import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, DayRange, type Contact, type Document, type GiftIdea, type Id, type Money, type Possession, type Subscription, type UpcomingDue } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { dueInLabel, monthlyTotalLabel } from '@oyl/all-of-oyl/format'
import { HORIZONS, contactLines, documentLines, giftLines, possessionLines, possessionValue, subscriptionLines, upcomingEmptyText } from '../../vault/format.js'
import type { DocumentsWriter } from '../oyl-document-form/oyl-document-form.js'
import type { PossessionsWriter } from '../oyl-possession-form/oyl-possession-form.js'
import type { SubscriptionsWriter } from '../oyl-subscription-form/oyl-subscription-form.js'
import type { ContactsWriter } from '../oyl-contact-form/oyl-contact-form.js'
import type { GiftIdeasWriter } from '../oyl-gift-idea-form/oyl-gift-idea-form.js'

export interface VaultStore extends DocumentsWriter, PossessionsWriter, SubscriptionsWriter, ContactsWriter, GiftIdeasWriter {
  documents(): readonly Document[]
  possessions(): readonly Possession[]
  subscriptions(): readonly Subscription[]
  giftIdeas(): readonly GiftIdea[]
  monthlySubscriptionTotals(): ReadonlyMap<string, Money>
  upcoming(range: DayRange): readonly UpcomingDue[]
  removeDocument(id: Id): Promise<unknown>
  removePossession(id: Id): Promise<unknown>
  removeSubscription(id: Id): Promise<unknown>
  removeContact(id: Id): Promise<unknown>
  removeGiftIdea(id: Id): Promise<unknown>
  recordContact(id: Id, on: DayKey): Promise<unknown>
}

type Kind = 'documents' | 'possessions' | 'subscriptions' | 'contacts'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'documents', label: 'Documents' }, { value: 'possessions', label: 'Possessions' },
  { value: 'subscriptions', label: 'Subscriptions' }, { value: 'contacts', label: 'Contacts' },
]

/**
 * The vault: an Upcoming feed over a horizon, then one kind at a time (documents,
 * possessions, subscriptions, contacts — gift ideas under contacts), each with a collapsed
 * add form and a list of `oyl-item-row`s. Lists and callbacks are vanilla's; the horizon is a
 * bundle signal so the effect re-computes the feed when it changes.
 */
@Component({ tag: 'oyl-vault', styleUrl: 'oyl-vault.css', shadow: true })
export class OylVault {
  @Element() host!: HTMLElement

  @Prop() store!: VaultStore
  /** `dataState.renewSubscription`: renews and records the finance expense. */
  @Prop() renew!: (id: Id, on: DayKey) => Promise<unknown>
  @Prop() tz = 'UTC'

  @State() kind: Kind = 'documents'
  @State() horizon = 90
  @State() upcoming: readonly UpcomingDue[] = []
  @State() documents: readonly Document[] = []
  @State() possessions: readonly Possession[] = []
  @State() subscriptions: readonly Subscription[] = []
  @State() contacts: readonly Contact[] = []
  @State() gifts: readonly GiftIdea[] = []
  @State() totals: ReadonlyMap<string, Money> = new Map()
  @State() announcement = ''

  private horizonSignal!: Signal<number>
  private stop = () => {}

  componentWillLoad() {
    this.horizonSignal = signal(90)
    // One effect over the vault revision (every read touches it) and the horizon signal.
    // Fresh arrays per run → the screen re-renders; row lines are derived in render().
    this.stop = effect(() => {
      const today = this.today()
      const horizon = this.horizonSignal.get()
      this.horizon = horizon
      this.upcoming = this.store.upcoming(DayRange.of(today, today.addDays(horizon)))
      this.documents = this.store.documents()
      this.possessions = this.store.possessions()
      this.subscriptions = this.store.subscriptions()
      this.contacts = this.store.contacts()
      this.gifts = this.store.giftIdeas()
      this.totals = this.store.monthlySubscriptionTotals()
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  private today() {
    return DayKey.from(now(), this.tz)
  }

  private announce(msg: string) {
    this.announcement = msg
  }

  private onHorizon = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.horizonSignal.set(Number(e.detail.value))
  }

  private onKind = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.kind = e.detail.value as Kind
  }

  private removeWith = (fn: (id: Id) => Promise<unknown>) => (e: CustomEvent<string>) => {
    e.stopPropagation()
    void fn(e.detail as Id)
    this.announce('Deleted')
  }
  private onRemoveDocument = this.removeWith((id) => this.store.removeDocument(id))
  private onRemovePossession = this.removeWith((id) => this.store.removePossession(id))
  private onRemoveSubscription = this.removeWith((id) => this.store.removeSubscription(id))
  private onRemoveContact = this.removeWith((id) => this.store.removeContact(id))
  private onRemoveGift = this.removeWith((id) => this.store.removeGiftIdea(id))

  private onAct = (e: CustomEvent<{ act: string; itemId: string }>) => {
    e.stopPropagation()
    const id = e.detail.itemId as Id
    if (e.detail.act === 'renew') {
      void this.renew(id, this.today())
      this.announce('Renewed — expense recorded')
    } else if (e.detail.act === 'log') {
      void this.store.recordContact(id, this.today())
      this.announce('Logged')
    }
  }

  private onAdded = (e: Event) => {
    e.stopPropagation()
    this.announce('Added to vault')
  }

  private onGiftAdded = (e: Event) => {
    e.stopPropagation()
    this.announce('Gift idea added')
  }

  private section(kind: Kind, title: string, form: unknown, list: unknown, empty: string, extra?: unknown) {
    return (
      <section class={kind}>
        <div class="section-head">
          <div class="section-label">{title}</div>
          {kind === 'subscriptions' && this.subscriptions.length > 0 && <span class="monthly-total">{monthlyTotalLabel(this.totals)}</span>}
        </div>
        <details>
          <summary>New {title.toLowerCase().replace(/s$/, '')}</summary>
          {form}
        </details>
        {list ?? <div class="empty">{empty}</div>}
        {extra}
      </section>
    )
  }

  render() {
    const today = this.today()
    const namesById = new Map(this.contacts.map((c) => [c.id as string, c.name]))
    const list = (cls: string, items: unknown[]) => (items.length > 0 ? <ol class={cls}>{items}</ol> : null)
    return (
      <div class="screen">
        <h2 tabindex="-1">Vault</h2>
        <div class="sr-only" aria-live="polite">{this.announcement}</div>
        <div class="section-head">
          <div class="section-label">Upcoming</div>
          <ui-select name="horizon" label="Within" options={HORIZONS.map(([d, l]) => ({ value: String(d), label: l }))} value={String(this.horizon)} onUiChange={this.onHorizon} />
        </div>
        {this.upcoming.length > 0 ? (
          <ol class="upcoming">
            {this.upcoming.map((u) => (
              <li class="due" key={`${u.itemId}:${u.due.value}`}>
                <div>
                  <div class="label">{u.label}</div>
                  <div class="when">{dueInLabel(u.due, today)}</div>
                </div>
                <div class="date">{u.due.value}</div>
              </li>
            ))}
          </ol>
        ) : (
          <div class="empty" data-role="upcoming-empty">{upcomingEmptyText(this.horizon)}</div>
        )}
        <ui-segment name="kind" label="Kind" options={KINDS} value={this.kind} onUiChange={this.onKind} />
        {this.kind === 'documents' && this.section('documents', 'Documents',
          <oyl-document-form store={this.store} onAdded={this.onAdded} />,
          list('documents', this.documents.map((d) => <li key={d.id}><oyl-item-row itemId={d.id} label={d.name} lines={documentLines(d)} onRemove={this.onRemoveDocument} /></li>)),
          'No documents yet.')}
        {this.kind === 'possessions' && this.section('possessions', 'Possessions',
          <oyl-possession-form store={this.store} onAdded={this.onAdded} />,
          list('possessions', this.possessions.map((p) => <li key={p.id}><oyl-item-row itemId={p.id} label={p.name} lines={possessionLines(p)} value={possessionValue(p)} onRemove={this.onRemovePossession} /></li>)),
          'No possessions yet.')}
        {this.kind === 'subscriptions' && this.section('subscriptions', 'Subscriptions',
          <oyl-subscription-form store={this.store} onAdded={this.onAdded} />,
          list('subscriptions', this.subscriptions.map((s) => <li key={s.id}><oyl-item-row itemId={s.id} label={s.name} lines={subscriptionLines(s, today)} action={{ act: 'renew', label: 'Renew' }} onAct={this.onAct} onRemove={this.onRemoveSubscription} /></li>)),
          'No subscriptions yet.')}
        {this.kind === 'contacts' && this.section('contacts', 'Contacts',
          <oyl-contact-form store={this.store} onAdded={this.onAdded} />,
          list('contacts', this.contacts.map((c) => <li key={c.id}><oyl-item-row itemId={c.id} label={c.name} lines={contactLines(c, today)} action={{ act: 'log', label: 'Log contact' }} onAct={this.onAct} onRemove={this.onRemoveContact} /></li>)),
          'No contacts yet.',
          [
            <div class="section-label gifts-label">Gift ideas</div>,
            <oyl-gift-idea-form store={this.store} onAdded={this.onGiftAdded} />,
            list('gifts', this.gifts.map((g) => <li key={g.id}><oyl-item-row itemId={g.id} label={g.text} lines={giftLines(g, namesById)} onRemove={this.onRemoveGift} /></li>)) ?? <div class="empty gifts-empty">No gift ideas yet.</div>,
          ])}
      </div>
    )
  }
}
