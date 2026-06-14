import { Vault } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Document} Document */
/** @typedef {import('@oyl/all-of-oyl').Possession} Possession */
/** @typedef {import('@oyl/all-of-oyl').Subscription} Subscription */
/** @typedef {import('@oyl/all-of-oyl').SubscriptionCharge} SubscriptionCharge */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */
/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Contact} Contact */
/** @typedef {import('@oyl/all-of-oyl').GiftIdea} GiftIdea */
/** @typedef {import('@oyl/all-of-oyl').Repository<Document>} DocumentsRepo */
/** @typedef {import('@oyl/all-of-oyl').Repository<Possession>} PossessionsRepo */
/**
 * @typedef {{
 *   documents: DocumentsRepo, possessions: PossessionsRepo,
 *   subscriptions: import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').Subscription>,
 *   contacts: import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').Contact>,
 *   giftIdeas: import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').GiftIdea>,
 * }} VaultRepos
 */

/**
 * App-level reactive wrapper over the vault repositories + the domain Vault. Writes are
 * persist-first surgical (vault items are immutable — no in-place mutations in Slice 1).
 * hydrate() rebuilds ALL FIVE registries so upcoming() stays complete even though only
 * documents + possessions have write methods here (subscriptions/contacts/gift-ideas are
 * read-only until slices 2 & 3). Reads touch revision so they re-run under this.track().
 * @param {VaultRepos} repos
 */
export function createVaultStore(repos) {
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

    /** @param {Document} doc @returns {Promise<Document>} */
    async addDocument(doc) {
      const saved = await repos.documents.save(doc)
      vault.addDocument(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeDocument(id) {
      await repos.documents.delete(id)
      vault.removeDocument(id)
      revision.set((n += 1))
    },
    /** @param {Possession} p @returns {Promise<Possession>} */
    async addPossession(p) {
      const saved = await repos.possessions.save(p)
      vault.addPossession(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removePossession(id) {
      await repos.possessions.delete(id)
      vault.removePossession(id)
      revision.set((n += 1))
    },

    /** @param {Subscription} sub @returns {Promise<Subscription>} */
    async addSubscription(sub) {
      const saved = await repos.subscriptions.save(sub)
      vault.addSubscription(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeSubscription(id) {
      await repos.subscriptions.delete(id)
      vault.removeSubscription(id)
      revision.set((n += 1))
    },
    /**
     * Pay the pending occurrence (stateful: advances the cursor in place, persists,
     * re-hydrates to resync — rollback-on-failure, like planner cancel). The returned
     * SubscriptionCharge is the finance seam; Slice 2 callers ignore it.
     * @param {Id} id @param {DayKey} on @returns {Promise<SubscriptionCharge | undefined>}
     */
    async renew(id, on) {
      const sub = vault.subscriptions().find((s) => s.id === id)
      if (!sub) return undefined
      const charge = sub.renew(on)
      try {
        await repos.subscriptions.save(sub)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return charge
    },

    /** @param {Contact} c @returns {Promise<Contact>} */
    async addContact(c) {
      const saved = await repos.contacts.save(c)
      vault.addContact(saved)
      revision.set((n += 1))
      return saved
    },
    /** Remove a contact and CASCADE-delete its gift ideas (domain Vault doesn't cascade). @param {Id} id */
    async removeContact(id) {
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
     * rollback-on-failure, like renew). @param {Id} id @param {DayKey} on
     */
    async recordContact(id, on) {
      const c = vault.contacts().find((x) => x.id === id)
      if (!c) return
      c.recordContact(on)
      try {
        await repos.contacts.save(c)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @param {GiftIdea} g @returns {Promise<GiftIdea>} */
    async addGiftIdea(g) {
      const saved = await repos.giftIdeas.save(g)
      vault.addGiftIdea(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeGiftIdea(id) {
      await repos.giftIdeas.delete(id)
      vault.removeGiftIdea(id)
      revision.set((n += 1))
    },

    /** @returns {readonly Document[]} */
    documents() {
      revision.get()
      return vault.documents()
    },
    /** @returns {readonly Possession[]} */
    possessions() {
      revision.get()
      return vault.possessions()
    },
    /** @returns {readonly Subscription[]} */
    subscriptions() {
      revision.get()
      return vault.subscriptions()
    },
    /** @returns {ReadonlyMap<string, Money>} */
    monthlySubscriptionTotals() {
      revision.get()
      return vault.monthlySubscriptionTotals()
    },
    /** @returns {readonly Contact[]} */
    contacts() {
      revision.get()
      return vault.contacts()
    },
    /** @returns {readonly GiftIdea[]} */
    giftIdeas() {
      revision.get()
      return vault.giftIdeas()
    },
    /** @param {DayRange} range @returns {readonly import('@oyl/all-of-oyl').UpcomingDue[]} */
    upcoming(range) {
      revision.get()
      return vault.upcoming(range)
    },
  }
}
