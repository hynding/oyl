import type { Goal, Id, DayKey, Repository } from '../../index.js'
import { signal } from '../reactive/signal.js'

type GoalsRepo = Repository<Goal>

/**
 * App-level reactive wrapper over the goals Repository. The "aggregate" here is just the
 * list of domain Goals. add/remove are persist-first; pause/resume mutate a Goal in place,
 * persist, then re-hydrate (rollback-on-failure) — the planner-cancel pattern. Goal progress
 * is NOT computed here (it needs the Journal) — the screen reads it via journalStore.progressOf,
 * so goals stays journal-agnostic.
 */
export function createGoalsStore(goalsRepo: GoalsRepo) {
  let goals: Goal[] = []
  let n = 0
  const revision = signal(0)

  /** Bootstrap-payload lists skip the repo read. */
  async function hydrate(preloaded?: readonly Goal[]) {
    goals = preloaded ? [...preloaded] : [...(await goalsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    async add(g: Goal) {
      const saved = await goalsRepo.save(g)
      goals = [...goals, saved]
      revision.set((n += 1))
      return saved
    },
    async remove(id: Id) {
      await goalsRepo.delete(id)
      goals = goals.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    async pause(id: Id, on: DayKey) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.pause(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      // Online-first: save() only enqueues — a repo re-read here could race the flush
      // and clobber the in-place mutation. The aggregate is already current; just notify.
      revision.set((n += 1))
    },
    async resume(id: Id, on: DayKey) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.resume(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      // Online-first: save() only enqueues — a repo re-read here could race the flush
      // and clobber the in-place mutation. The aggregate is already current; just notify.
      revision.set((n += 1))
    },
    all(): readonly Goal[] {
      revision.get()
      return [...goals]
    },
  }
}
