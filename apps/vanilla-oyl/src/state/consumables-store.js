import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Consumable} Consumable */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Consumable>} ConsumablesRepo */

/**
 * App-level reactive wrapper over the consumables Repository — the catalog of domain Consumables.
 * Add/remove are persist-first; consumables have no in-place mutation (no edit).
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
    /** @param {Id} id */
    async remove(id) {
      await consumablesRepo.delete(id)
      consumables = consumables.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Consumable[]} */
    all() {
      revision.get()
      return [...consumables]
    },
  }
}
