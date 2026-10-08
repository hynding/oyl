import { Planner } from '../../index.js'
import type { Plan, Task, Id, DayKey, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type PlansRepo = Repository<Plan>

/**
 * App-level reactive wrapper over the plans Repository + the domain Planner.
 * Creates/removes are persist-first surgical; mutations (complete/cancel) run the
 * domain op, persist the affected plan(s), then re-hydrate to resync meta/revision —
 * rolling back to the persisted state if a save fails. The domain Planner stays a
 * plain stateful aggregate.
 */
export function createPlannerStore(plansRepo: PlansRepo) {
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

    /** Live Planner aggregate for read-only insights — touches revision. */
    peek(): Planner {
      revision.get()
      return planner
    },

    async add(plan: Plan) {
      const saved = await plansRepo.save(plan)
      planner.add(saved)
      revision.set((n += 1))
      return saved
    },

    /**
     * Complete a plan; recurring tasks respawn a successor (domain). The completed plan
     * and any successor are persisted ATOMICALLY via saveMany (both or neither). On a save
     * failure we re-hydrate (rollback to the persisted truth) and rethrow.
     */
    async complete(id: Id, on: DayKey): Promise<Task | undefined> {
      const successor = planner.complete(id, on)
      const completed = planner.get(id)
      const batch: Plan[] = []
      if (completed) batch.push(completed)
      if (successor) batch.push(successor)
      try {
        if (batch.length) await plansRepo.saveMany(batch)
      } catch (err) {
        await hydrate()
        throw err
      }
      // Online-first: the aggregate already holds the completed plan (+ successor);
      // a repo re-read would race the outbox flush (and wipe unbacked repos). Notify only.
      revision.set((n += 1))
      return successor
    },

    async cancel(id: Id) {
      const plan = planner.get(id)
      if (!plan) return
      plan.cancel()
      try {
        await plansRepo.save(plan)
      } catch (err) {
        await hydrate()
        throw err
      }
      revision.set((n += 1))
    },

    async remove(id: Id) {
      await plansRepo.delete(id)
      planner.remove(id)
      revision.set((n += 1))
    },

    agendaFor(day: DayKey): readonly Plan[] {
      revision.get()
      return planner.agendaFor(day)
    },

    overdue(day: DayKey): readonly Plan[] {
      revision.get()
      return planner.overdue(day)
    },

    canceledOn(day: DayKey): readonly Plan[] {
      revision.get()
      return planner.all().filter((p) => p.status === 'canceled' && p.due !== undefined && p.due.equals(day))
    },

    get(id: Id): Plan | undefined {
      revision.get()
      return planner.get(id)
    },
  }
}
