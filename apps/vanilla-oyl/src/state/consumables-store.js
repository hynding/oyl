import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Consumable} Consumable */
/** @typedef {import('@oyl/all-of-oyl').Repository<Consumable>} ConsumablesRepo */

/**
 * App-level reactive wrapper over the consumables Repository — the catalog of domain Consumables.
 * Add is persist-first; catalog-item delete/update is a deferred backend capability
 * (Sub-project B/D), so there is no remove() here yet.
 * @param {ConsumablesRepo} consumablesRepo
 */
export function createConsumablesStore(consumablesRepo) {
  /** @type {Consumable[]} */
  let consumables = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    consumables = [...(await consumablesRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Consumable} c @returns {Promise<Consumable>} */
    async add(c) {
      const saved = await consumablesRepo.save(c)
      consumables = [...consumables, saved]
      revision.set((n += 1))
      return saved
    },
    /** @returns {readonly Consumable[]} */
    all() {
      revision.get()
      return [...consumables]
    },
  }
}
