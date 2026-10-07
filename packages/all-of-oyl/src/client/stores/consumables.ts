import type { Consumable, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type ConsumablesRepo = Repository<Consumable>

/**
 * App-level reactive wrapper over the consumables Repository — the catalog of domain Consumables.
 * Add is persist-first; catalog-item delete/update is a deferred backend capability
 * (Sub-project B/D), so there is no remove() here yet.
 */
export function createConsumablesStore(consumablesRepo: ConsumablesRepo) {
  let consumables: Consumable[] = []
  let n = 0
  const revision = signal(0)

  /** Bootstrap-payload lists skip the repo read. */
  async function hydrate(preloaded?: readonly Consumable[]) {
    consumables = preloaded ? [...preloaded] : [...(await consumablesRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    async add(c: Consumable) {
      const saved = await consumablesRepo.save(c)
      consumables = [...consumables, saved]
      revision.set((n += 1))
      return saved
    },
    all(): readonly Consumable[] {
      revision.get()
      return [...consumables]
    },
  }
}
