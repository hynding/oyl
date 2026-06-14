import { DayKey, DayRange } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { dueInLabel, formatMoney, monthlyTotalLabel } from '../vault/format.js'
import { defineVaultComposer } from './oyl-vault-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'
import { defineSubscriptionRow } from './oyl-subscription-row.js'
import { defineContactRow } from './oyl-contact-row.js'
import { defineGiftIdeaForm } from './oyl-gift-idea-form.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */

const HORIZONS = /** @type {ReadonlyArray<readonly [number, string]>} */ ([
  [30, 'Next 30 days'],
  [90, 'Next 90 days'],
  [365, 'Next year'],
])

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .2rem; }
  .upcoming-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 1.6rem 0 .2rem; }
  .upcoming-head .section-label { margin: 0; }
  select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .5rem; }
  oyl-vault-composer { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .due { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: baseline; padding: .6rem 0; border-top: 1px solid var(--color-border); }
  .due .when { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; }
  .due .date { grid-column: 2; color: var(--color-muted); font-family: var(--font-mono); font-size: var(--step--1); }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .monthly-total { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; }
  oyl-gift-idea-form { display: block; margin: .4rem 0 .8rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylVault extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {(id: import('@oyl/all-of-oyl').Id, on: import('@oyl/all-of-oyl').DayKey) => Promise<unknown>} */
    this.renew = async () => undefined
    /** @type {import('../lib/reactive/signal.js').Signal<number>} */
    this._horizon = /** @type {any} */ (undefined)
  }

  render() {
    defineVaultComposer()
    defineVaultItem()
    defineSubscriptionRow()
    defineContactRow()
    defineGiftIdeaForm()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._horizon = signal(90)

    const h2 = document.createElement('h2')
    h2.textContent = 'Vault'
    h2.tabIndex = -1

    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-vault-composer.js').OylVaultComposer} */ (document.createElement('oyl-vault-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Added to vault' }

    const upHead = document.createElement('div')
    upHead.className = 'upcoming-head'
    const upLabel = document.createElement('div')
    upLabel.className = 'section-label'
    upLabel.textContent = 'Upcoming'
    const sel = document.createElement('select')
    sel.setAttribute('aria-label', 'Horizon')
    for (const [days, label] of HORIZONS) {
      const o = document.createElement('option')
      o.value = String(days)
      o.textContent = label
      if (days === 90) o.selected = true
      sel.append(o)
    }
    const upList = document.createElement('ol')
    upList.className = 'upcoming-list'
    const upEmpty = document.createElement('div')
    upEmpty.className = 'empty'

    const docLabel = document.createElement('div')
    docLabel.className = 'section-label'
    docLabel.textContent = 'Documents'
    const docList = document.createElement('ol')
    const docEmpty = document.createElement('div')
    docEmpty.className = 'empty'

    const posLabel = document.createElement('div')
    posLabel.className = 'section-label'
    posLabel.textContent = 'Possessions'
    const posList = document.createElement('ol')
    const posEmpty = document.createElement('div')
    posEmpty.className = 'empty'

    const subHead = document.createElement('div')
    subHead.className = 'upcoming-head'
    const subLabel = document.createElement('div')
    subLabel.className = 'section-label'
    subLabel.textContent = 'Subscriptions'
    const subTotal = document.createElement('span')
    subTotal.className = 'monthly-total'
    subHead.append(subLabel, subTotal)
    const subsList = document.createElement('ol')
    const subsEmpty = document.createElement('div')
    subsEmpty.className = 'empty'

    const conLabel = document.createElement('div')
    conLabel.className = 'section-label'
    conLabel.textContent = 'Contacts'
    const conList = document.createElement('ol')
    const conEmpty = document.createElement('div')
    conEmpty.className = 'empty'

    const giftLabel = document.createElement('div')
    giftLabel.className = 'section-label'
    giftLabel.textContent = 'Gift ideas'
    const giftForm = /** @type {import('./oyl-gift-idea-form.js').OylGiftIdeaForm} */ (document.createElement('oyl-gift-idea-form'))
    giftForm.store = this.store
    giftForm.onAdded = () => { live.textContent = 'Gift idea added' }
    const giftList = document.createElement('ol')
    const giftEmpty = document.createElement('div')
    giftEmpty.className = 'empty'

    root.append(h2, live, composer, upHead, upList, upEmpty, docLabel, docList, docEmpty, posLabel, posList, posEmpty, subHead, subsList, subsEmpty, conLabel, conList, conEmpty, giftLabel, giftForm, giftList, giftEmpty)

    /** @param {number} horizon */
    const repaintUpcoming = (horizon) => {
      const today = DayKey.from(now(), this.tz)
      const range = DayRange.of(today, today.addDays(horizon))
      const feed = this.store.upcoming(range)
      upList.replaceChildren()
      for (const u of feed) upList.append(this._dueRow(u.label, dueInLabel(u.due, today), u.due.value))
      upEmpty.hidden = feed.length > 0
      upEmpty.textContent = upEmpty.hidden ? '' : `Nothing coming up in the ${horizon === 365 ? 'next year' : `next ${horizon} days`}.`
    }

    // Setting the signal re-runs the track() effect, which repaints the feed.
    sel.addEventListener('change', () => this._horizon.set(Number(sel.value)), { signal: this.lifecycle })
    upHead.append(upLabel, sel)

    this.track(() => {
      const horizon = this._horizon.get()
      repaintUpcoming(horizon)

      const docs = this.store.documents()
      docList.replaceChildren()
      for (const d of docs) docList.append(this._itemEl(d.name, [d.kind, d.expiresOn ? `Expires ${d.expiresOn.value}` : null], () => { void this.store.removeDocument(d.id); live.textContent = 'Deleted' }))
      docEmpty.hidden = docs.length > 0
      docEmpty.textContent = docEmpty.hidden ? '' : 'No documents yet.'

      const poss = this.store.possessions()
      posList.replaceChildren()
      for (const p of poss) posList.append(this._itemEl(p.name, [p.location, p.warrantyUntil ? `Warranty until ${p.warrantyUntil.value}` : null, p.purchasePrice ? formatMoney(p.purchasePrice) : null], () => { void this.store.removePossession(p.id); live.textContent = 'Deleted' }))
      posEmpty.hidden = poss.length > 0
      posEmpty.textContent = posEmpty.hidden ? '' : 'No possessions yet.'

      const today = DayKey.from(now(), this.tz)
      const subs = this.store.subscriptions()
      subTotal.textContent = monthlyTotalLabel(this.store.monthlySubscriptionTotals())
      subsList.replaceChildren()
      for (const s of subs) {
        const srow = /** @type {import('./oyl-subscription-row.js').OylSubscriptionRow} */ (document.createElement('oyl-subscription-row'))
        srow.subscription = s
        srow.today = today
        srow.onRenew = (id) => { void this.renew(id, today); live.textContent = 'Renewed — expense recorded' }
        srow.onDelete = (id) => { void this.store.removeSubscription(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(srow)
        subsList.append(li)
      }
      subsEmpty.hidden = subs.length > 0
      subsEmpty.textContent = subsEmpty.hidden ? '' : 'No subscriptions yet.'

      const contacts = this.store.contacts()
      conList.replaceChildren()
      for (const c of contacts) {
        const crow = /** @type {import('./oyl-contact-row.js').OylContactRow} */ (document.createElement('oyl-contact-row'))
        crow.contact = c
        crow.today = today
        crow.onLog = (id) => { void this.store.recordContact(id, today); live.textContent = 'Logged' }
        crow.onDelete = (id) => { void this.store.removeContact(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(crow)
        conList.append(li)
      }
      conEmpty.hidden = contacts.length > 0
      conEmpty.textContent = conEmpty.hidden ? '' : 'No contacts yet.'

      const nameById = new Map(contacts.map((c) => [c.id, c.name]))
      const ideas = this.store.giftIdeas()
      giftList.replaceChildren()
      for (const g of ideas) {
        const forName = nameById.get(g.contactId) ?? 'Unknown contact'
        giftList.append(this._itemEl(g.text, [`For ${forName}`], () => { void this.store.removeGiftIdea(g.id); live.textContent = 'Deleted' }))
      }
      giftEmpty.hidden = ideas.length > 0
      giftEmpty.textContent = giftEmpty.hidden ? '' : 'No gift ideas yet.'
    })
  }

  /** @param {string} label @param {string} when @param {string} date @returns {HTMLLIElement} */
  _dueRow(label, when, date) {
    const li = document.createElement('li')
    li.className = 'due'
    const main = document.createElement('div')
    const name = document.createElement('div')
    name.textContent = label
    const w = document.createElement('div')
    w.className = 'when'
    w.textContent = when
    main.append(name, w)
    const d = document.createElement('div')
    d.className = 'date'
    d.textContent = date
    li.append(main, d)
    return li
  }

  /** @param {string} label @param {ReadonlyArray<string | null | undefined>} lines @param {() => void} onDelete @returns {HTMLLIElement} */
  _itemEl(label, lines, onDelete) {
    const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
    item.label = label
    item.lines = lines
    item.onDelete = onDelete
    const li = document.createElement('li')
    li.append(item)
    return li
  }
}

/** Register the element (idempotent). */
export function defineVault() {
  if (!customElements.get('oyl-vault')) customElements.define('oyl-vault', OylVault)
}
