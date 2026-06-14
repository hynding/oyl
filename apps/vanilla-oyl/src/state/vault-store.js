import { Vault } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Document} Document */
/** @typedef {import('@oyl/all-of-oyl').Possession} Possession */
/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
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
    /** @param {DayRange} range @returns {readonly import('@oyl/all-of-oyl').UpcomingDue[]} */
    upcoming(range) {
      revision.get()
      return vault.upcoming(range)
    },
  }
}
