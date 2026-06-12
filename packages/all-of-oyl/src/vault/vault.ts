import type { DayKey } from '../core/day-key'
import type { DayRange } from '../core/day-range'
import { DomainError } from '../core/domain-error'
import type { Id } from '../core/id'
import { Money } from '../core/money'
import { Contact } from './contact'
import { Document } from './document'
import { GiftIdea } from './gift-idea'
import { Possession } from './possession'
import { Subscription } from './subscription'

/** One item in the unified reminder feed. */
export type UpcomingDue = { itemId: Id; label: string; due: DayKey }

/** Average Gregorian month, in days — the proration convention for subscription totals. */
const AVG_MONTH_DAYS = 30.4375

type Registry<T extends { id: Id }> = { items: T[]; byId: Set<Id> }

function makeRegistry<T extends { id: Id }>(): Registry<T> {
  return { items: [], byId: new Set() }
}

function addTo<T extends { id: Id }>(registry: Registry<T>, item: T, what: string): void {
  if (registry.byId.has(item.id)) {
    throw new DomainError('DUPLICATE_ID', `${what} already in vault: ${item.id}`)
  }
  registry.byId.add(item.id)
  registry.items.push(item)
}

function removeFrom<T extends { id: Id }>(registry: Registry<T>, id: Id): void {
  if (!registry.byId.delete(id)) return
  registry.items.splice(registry.items.findIndex((i) => i.id === id), 1)
}

/**
 * One person's record of what they have. A plain in-memory aggregate (apps
 * hydrate it from repositories). Anything with a future date feeds
 * upcoming(); apps merge it with planner.upcoming(range) for the complete
 * what's-coming view.
 */
export class Vault {
  private readonly documentRegistry = makeRegistry<Document>()
  private readonly possessionRegistry = makeRegistry<Possession>()
  private readonly subscriptionRegistry = makeRegistry<Subscription>()
  private readonly contactRegistry = makeRegistry<Contact>()
  private readonly giftIdeaRegistry = makeRegistry<GiftIdea>()

  addDocument(item: Document): void {
    addTo(this.documentRegistry, item, 'document')
  }
  removeDocument(id: Id): void {
    removeFrom(this.documentRegistry, id)
  }
  documents(): readonly Document[] {
    return [...this.documentRegistry.items]
  }

  addPossession(item: Possession): void {
    addTo(this.possessionRegistry, item, 'possession')
  }
  removePossession(id: Id): void {
    removeFrom(this.possessionRegistry, id)
  }
  possessions(): readonly Possession[] {
    return [...this.possessionRegistry.items]
  }

  addSubscription(item: Subscription): void {
    addTo(this.subscriptionRegistry, item, 'subscription')
  }
  removeSubscription(id: Id): void {
    removeFrom(this.subscriptionRegistry, id)
  }
  subscriptions(): readonly Subscription[] {
    return [...this.subscriptionRegistry.items]
  }

  addContact(item: Contact): void {
    addTo(this.contactRegistry, item, 'contact')
  }
  removeContact(id: Id): void {
    removeFrom(this.contactRegistry, id)
  }
  contacts(): readonly Contact[] {
    return [...this.contactRegistry.items]
  }

  addGiftIdea(item: GiftIdea): void {
    addTo(this.giftIdeaRegistry, item, 'gift idea')
  }
  removeGiftIdea(id: Id): void {
    removeFrom(this.giftIdeaRegistry, id)
  }
  giftIdeas(): readonly GiftIdea[] {
    return [...this.giftIdeaRegistry.items]
  }

  giftIdeasFor(contactId: Id): readonly GiftIdea[] {
    return this.giftIdeaRegistry.items.filter((g) => g.contactId === contactId)
  }

  /**
   * The unified reminder feed: document expiries, warranty expiries,
   * subscription renewals, and contact occasions whose next due (as of the
   * range start) falls inside the range, sorted by due day then insertion.
   * One entry per item — the NEXT occurrence only. Exception: a contact
   * emits one row PER OCCASION (birthday and anniversary both appear), so
   * itemId is NOT unique in the feed — rows are unique by (itemId, label).
   */
  upcoming(range: DayRange): readonly UpcomingDue[] {
    const feed: UpcomingDue[] = []
    const consider = (itemId: Id, label: string, due: DayKey | undefined) => {
      if (due !== undefined && range.contains(due)) feed.push({ itemId, label, due })
    }
    for (const doc of this.documentRegistry.items) consider(doc.id, doc.name, doc.nextDueOn(range.start))
    for (const item of this.possessionRegistry.items) consider(item.id, `${item.name} (warranty)`, item.nextDueOn(range.start))
    for (const sub of this.subscriptionRegistry.items) consider(sub.id, sub.name, sub.nextDueOn(range.start))
    for (const contact of this.contactRegistry.items) {
      for (const occasion of contact.occasions) {
        consider(contact.id, `${contact.name} — ${occasion.name}`, occasion.cadence.nextOnOrAfter(occasion.anchor, range.start))
      }
    }
    return feed.sort((a, b) => a.due.compare(b.due))
  }

  /**
   * What subscriptions cost per month, per currency (Money refuses to add
   * across currencies). Proration convention: months exact, years /12,
   * weeks and days via the average Gregorian month (30.4375 days), rounded
   * to minor units.
   */
  monthlySubscriptionTotals(): ReadonlyMap<string, Money> {
    const totals = new Map<string, Money>()
    for (const sub of this.subscriptionRegistry.items) {
      const { n, unit } = sub.cadence
      const factor =
        unit === 'months' ? 1 / n : unit === 'years' ? 1 / (12 * n) : unit === 'weeks' ? AVG_MONTH_DAYS / (7 * n) : AVG_MONTH_DAYS / n
      const monthly = Money.of(Math.round(sub.amount.minor * factor), sub.amount.currency, sub.amount.exponent)
      const existing = totals.get(sub.amount.currency)
      totals.set(sub.amount.currency, existing === undefined ? monthly : existing.add(monthly))
    }
    return totals
  }
}
