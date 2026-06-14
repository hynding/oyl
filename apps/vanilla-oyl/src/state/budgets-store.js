import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Budget>} BudgetsRepo */

/**
 * App-level reactive wrapper over the budgets Repository — the list of domain Budgets.
 * Add/remove are persist-first; budgets have no in-place mutation (no pause). Progress is
 * read via journalStore.budgetStatus (needs the Journal), so this store stays journal-agnostic.
 * @param {BudgetsRepo} budgetsRepo
 */
export function createBudgetsStore(budgetsRepo) {
  /** @type {Budget[]} */
  let budgets = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    budgets = [...(await budgetsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Budget} b @returns {Promise<Budget>} */
    async add(b) {
      const saved = await budgetsRepo.save(b)
      budgets = [...budgets, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await budgetsRepo.delete(id)
      budgets = budgets.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Budget[]} */
    all() {
      revision.get()
      return [...budgets]
    },
  }
}
