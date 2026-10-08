import type { Budget, Id, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type BudgetsRepo = Repository<Budget>

/**
 * App-level reactive wrapper over the budgets Repository — the list of domain Budgets.
 * Add/remove are persist-first; budgets have no in-place mutation (no pause). Progress is
 * read via journalStore.budgetStatus (needs the Journal), so this store stays journal-agnostic.
 */
export function createBudgetsStore(budgetsRepo: BudgetsRepo) {
  let budgets: Budget[] = []
  let n = 0
  const revision = signal(0)

  /** Bootstrap-payload lists skip the repo read. */
  async function hydrate(preloaded?: readonly Budget[]) {
    budgets = preloaded ? [...preloaded] : [...(await budgetsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    async add(b: Budget) {
      const saved = await budgetsRepo.save(b)
      budgets = [...budgets, saved]
      revision.set((n += 1))
      return saved
    },
    async remove(id: Id) {
      await budgetsRepo.delete(id)
      budgets = budgets.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    all(): readonly Budget[] {
      revision.get()
      return [...budgets]
    },
  }
}
