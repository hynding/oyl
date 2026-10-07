import type { ConsumableProduct, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type ConsumableProductsRepo = Repository<ConsumableProduct>

/**
 * App-level reactive wrapper over the consumable-products Repository — the catalog of
 * specific packaged products mapped to a parent Consumable.
 * Add is persist-first; delete/update is a deferred backend capability (Sub-project D).
 */
export function createConsumableProductsStore(consumableProductsRepo: ConsumableProductsRepo) {
  let consumableProducts: ConsumableProduct[] = []
  let n = 0
  const revision = signal(0)

  /** Bootstrap-payload lists skip the repo read. */
  async function hydrate(preloaded?: readonly ConsumableProduct[]) {
    consumableProducts = preloaded ? [...preloaded] : [...(await consumableProductsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    async add(p: ConsumableProduct) {
      const saved = await consumableProductsRepo.save(p)
      consumableProducts = [...consumableProducts, saved]
      revision.set((n += 1))
      return saved
    },
    all(): readonly ConsumableProduct[] {
      revision.get()
      return [...consumableProducts]
    },
  }
}
