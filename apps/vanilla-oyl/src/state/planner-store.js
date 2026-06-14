import { Planner } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Task} Task */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Plan>} PlansRepo */

/**
 * App-level reactive wrapper over the plans Repository + the domain Planner.
 * Creates/removes are persist-first surgical; mutations (complete/cancel) run the
 * domain op, persist the affected plan(s), then re-hydrate to resync meta/revision —
 * rolling back to the persisted state if a save fails. The domain Planner stays a
 * plain stateful aggregate.
 * @param {PlansRepo} plansRepo
 */
export function createPlannerStore(plansRepo) {
  let planner = new Planner()
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    const fresh = new Planner()
    for (const p of await plansRepo.list()) fresh.add(p)
    planner = fresh
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    /** @param {Plan} plan @returns {Promise<Plan>} */
    async add(plan) {
      const saved = await plansRepo.save(plan)
      planner.add(saved)
      revision.set((n += 1))
      return saved
    },

    /**
     * Complete a plan; recurring tasks respawn a successor (domain). The completed plan
     * and any successor are persisted ATOMICALLY via saveMany (both or neither). On a save
     * failure we re-hydrate (rollback to the persisted truth) and rethrow.
     * @param {Id} id @param {DayKey} on @returns {Promise<Task | undefined>}
     */
    async complete(id, on) {
      const successor = planner.complete(id, on)
      const completed = planner.get(id)
      /** @type {Plan[]} */
      const batch = []
      if (completed) batch.push(completed)
      if (successor) batch.push(successor)
      try {
        if (batch.length) await plansRepo.saveMany(batch)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return successor
    },

    /** @param {Id} id */
    async cancel(id) {
      const plan = planner.get(id)
      if (!plan) return
      plan.cancel()
      try {
        await plansRepo.save(plan)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },

    /** @param {Id} id */
    async remove(id) {
      await plansRepo.delete(id)
      planner.remove(id)
      revision.set((n += 1))
    },

    /** @param {DayKey} day @returns {readonly Plan[]} */
    agendaFor(day) {
      revision.get()
      return planner.agendaFor(day)
    },

    /** @param {DayKey} day @returns {readonly Plan[]} */
    overdue(day) {
      revision.get()
      return planner.overdue(day)
    },

    /** @param {DayKey} day @returns {readonly Plan[]} */
    canceledOn(day) {
      revision.get()
      return planner.all().filter((p) => p.status === 'canceled' && p.due !== undefined && p.due.equals(day))
    },

    /** @param {Id} id @returns {Plan | undefined} */
    get(id) {
      revision.get()
      return planner.get(id)
    },
  }
}
