import type { Account, Id, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type AccountsRepo = Repository<Account>

/**
 * App-level reactive wrapper over the accounts Repository — the list of domain Accounts.
 * Add/remove are persist-first; accounts have no in-place mutation (no edit). Per-account
 * spend is read via journalStore.accountSpend (needs the Journal), so this store stays
 * journal-agnostic.
 */
export function createAccountsStore(accountsRepo: AccountsRepo) {
  let accounts: Account[] = []
  let n = 0
  const revision = signal(0)

  /** Bootstrap-payload lists skip the repo read. */
  async function hydrate(preloaded?: readonly Account[]) {
    accounts = preloaded ? [...preloaded] : [...(await accountsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    async add(a: Account) {
      const saved = await accountsRepo.save(a)
      accounts = [...accounts, saved]
      revision.set((n += 1))
      return saved
    },
    async remove(id: Id) {
      await accountsRepo.delete(id)
      accounts = accounts.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    all(): readonly Account[] {
      revision.get()
      return [...accounts]
    },
  }
}
