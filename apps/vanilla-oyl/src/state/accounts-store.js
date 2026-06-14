import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Account} Account */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Account>} AccountsRepo */

/**
 * App-level reactive wrapper over the accounts Repository — the list of domain Accounts.
 * Add/remove are persist-first; accounts have no in-place mutation (no edit). Per-account
 * spend is read via journalStore.accountSpend (needs the Journal), so this store stays
 * journal-agnostic.
 * @param {AccountsRepo} accountsRepo
 */
export function createAccountsStore(accountsRepo) {
  /** @type {Account[]} */
  let accounts = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    accounts = [...(await accountsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Account} a @returns {Promise<Account>} */
    async add(a) {
      const saved = await accountsRepo.save(a)
      accounts = [...accounts, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await accountsRepo.delete(id)
      accounts = accounts.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Account[]} */
    all() {
      revision.get()
      return [...accounts]
    },
  }
}
