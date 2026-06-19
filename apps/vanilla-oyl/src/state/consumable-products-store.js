import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').ConsumableProduct} ConsumableProduct */
/** @typedef {import('@oyl/all-of-oyl').Repository<ConsumableProduct>} ConsumableProductsRepo */

/**
 * App-level reactive wrapper over the consumable-products Repository — the catalog of
 * specific packaged products mapped to a parent Consumable.
 * Add is persist-first; delete/update is a deferred backend capability (Sub-project D).
 * @param {ConsumableProductsRepo} consumableProductsRepo
 */
export function createConsumableProductsStore(consumableProductsRepo) {
  /** @type {ConsumableProduct[]} */
  let consumableProducts = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    consumableProducts = [...(await consumableProductsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {ConsumableProduct} p @returns {Promise<ConsumableProduct>} */
    async add(p) {
      const saved = await consumableProductsRepo.save(p)
      consumableProducts = [...consumableProducts, saved]
      revision.set((n += 1))
      return saved
    },
    /** @returns {readonly ConsumableProduct[]} */
    all() {
      revision.get()
      return [...consumableProducts]
    },
  }
}
