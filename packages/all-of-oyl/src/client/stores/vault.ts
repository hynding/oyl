import { Vault } from '../../index.js'
import type { Document, Possession, Subscription, SubscriptionCharge, Money, DayRange, DayKey, Id, Contact, GiftIdea, UpcomingDue, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type VaultRepos = {
  documents: Repository<Document>, possessions: Repository<Possession>,
  subscriptions: Repository<Subscription>,
  contacts: Repository<Contact>,
  giftIdeas: Repository<GiftIdea>,
}

/**
 * App-level reactive wrapper over the vault repositories + the domain Vault. Writes are
 * persist-first surgical (vault items are immutable — no in-place mutations in Slice 1).
 * hydrate() rebuilds ALL FIVE registries so upcoming() stays complete even though only
 * documents + possessions have write methods here (subscriptions/contacts/gift-ideas are
 * read-only until slices 2 & 3). Reads touch revision so they re-run under this.track().
 */
export function createVaultStore(repos: VaultRepos) {
  let vault = new Vault()
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    const fresh = new Vault()
    for (const d of await repos.documents.list()) fresh.addDocument(d)
    for (const p of await repos.possessions.list()) fresh.addPossession(p)
    for (const s of await repos.subscriptions.list()) fresh.addSubscription(s)
    for (const c of await repos.contacts.list()) fresh.addContact(c)
    for (const g of await repos.giftIdeas.list()) fresh.addGiftIdea(g)
    vault = fresh
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    async addDocument(doc: Document) {
      const saved = await repos.documents.save(doc)
      vault.addDocument(saved)
      revision.set((n += 1))
      return saved
    },
    async removeDocument(id: Id) {
      await repos.documents.delete(id)
      vault.removeDocument(id)
      revision.set((n += 1))
    },
    async addPossession(p: Possession) {
      const saved = await repos.possessions.save(p)
      vault.addPossession(saved)
      revision.set((n += 1))
      return saved
    },
    async removePossession(id: Id) {
      await repos.possessions.delete(id)
      vault.removePossession(id)
      revision.set((n += 1))
    },

    async addSubscription(sub: Subscription) {
      const saved = await repos.subscriptions.save(sub)
      vault.addSubscription(saved)
      revision.set((n += 1))
      return saved
    },
    async removeSubscription(id: Id) {
      await repos.subscriptions.delete(id)
      vault.removeSubscription(id)
      revision.set((n += 1))
    },
    /**
     * Pay the pending occurrence (stateful: advances the cursor in place, persists,
     * re-hydrates to resync — rollback-on-failure, like planner cancel). The returned
     * SubscriptionCharge is the finance seam; Slice 2 callers ignore it.
     */
    async renew(id: Id, on: DayKey): Promise<SubscriptionCharge | undefined> {
      const sub = vault.subscriptions().find((s) => s.id === id)
      if (!sub) return undefined
      const charge = sub.renew(on)
      try {
        await repos.subscriptions.save(sub)
      } catch (err) {
        await hydrate()
        throw err
      }
      // Online-first: the aggregate already reflects the renew; a repo re-read would
      // race the outbox flush (and wipe the unbacked vault repos). Notify only.
      revision.set((n += 1))
      return charge
    },

    async addContact(c: Contact) {
      const saved = await repos.contacts.save(c)
      vault.addContact(saved)
      revision.set((n += 1))
      return saved
    },
    /** Remove a contact and CASCADE-delete its gift ideas (domain Vault doesn't cascade). */
    async removeContact(id: Id) {
      for (const g of vault.giftIdeasFor(id)) {
        await repos.giftIdeas.delete(g.id)
        vault.removeGiftIdea(g.id)
      }
      await repos.contacts.delete(id)
      vault.removeContact(id)
      revision.set((n += 1))
    },
    /**
     * Record contact (stateful: mutate lastContactedOn in place, persist, re-hydrate —
     * rollback-on-failure, like renew).
     */
    async recordContact(id: Id, on: DayKey) {
      const c = vault.contacts().find((x) => x.id === id)
      if (!c) return
      c.recordContact(on)
      try {
        await repos.contacts.save(c)
      } catch (err) {
        await hydrate()
        throw err
      }
      revision.set((n += 1))
    },
    async addGiftIdea(g: GiftIdea) {
      const saved = await repos.giftIdeas.save(g)
      vault.addGiftIdea(saved)
      revision.set((n += 1))
      return saved
    },
    async removeGiftIdea(id: Id) {
      await repos.giftIdeas.delete(id)
      vault.removeGiftIdea(id)
      revision.set((n += 1))
    },

    documents(): readonly Document[] {
      revision.get()
      return vault.documents()
    },
    possessions(): readonly Possession[] {
      revision.get()
      return vault.possessions()
    },
    subscriptions(): readonly Subscription[] {
      revision.get()
      return vault.subscriptions()
    },
    monthlySubscriptionTotals(): ReadonlyMap<string, Money> {
      revision.get()
      return vault.monthlySubscriptionTotals()
    },
    contacts(): readonly Contact[] {
      revision.get()
      return vault.contacts()
    },
    giftIdeas(): readonly GiftIdea[] {
      revision.get()
      return vault.giftIdeas()
    },
    upcoming(range: DayRange): readonly UpcomingDue[] {
      revision.get()
      return vault.upcoming(range)
    },
  }
}
