import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Food} Food */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Food>} FoodsRepo */

/**
 * App-level reactive wrapper over the foods Repository — the catalog of domain Foods.
 * Add/remove are persist-first; foods have no in-place mutation (no edit).
 * @param {FoodsRepo} foodsRepo
 */
export function createFoodsStore(foodsRepo) {
  /** @type {Food[]} */
  let foods = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    foods = [...(await foodsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Food} f @returns {Promise<Food>} */
    async add(f) {
      const saved = await foodsRepo.save(f)
      foods = [...foods, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await foodsRepo.delete(id)
      foods = foods.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Food[]} */
    all() {
      revision.get()
      return [...foods]
    },
  }
}
