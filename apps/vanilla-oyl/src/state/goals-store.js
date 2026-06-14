import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} Goal */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Goal>} GoalsRepo */

/**
 * App-level reactive wrapper over the goals Repository. The "aggregate" here is just the
 * list of domain Goals. add/remove are persist-first; pause/resume mutate a Goal in place,
 * persist, then re-hydrate (rollback-on-failure) — the planner-cancel pattern. Goal progress
 * is NOT computed here (it needs the Journal) — the screen reads it via journalStore.progressOf,
 * so goals stays journal-agnostic.
 * @param {GoalsRepo} goalsRepo
 */
export function createGoalsStore(goalsRepo) {
  /** @type {Goal[]} */
  let goals = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    goals = [...(await goalsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    /** @param {Goal} g @returns {Promise<Goal>} */
    async add(g) {
      const saved = await goalsRepo.save(g)
      goals = [...goals, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await goalsRepo.delete(id)
      goals = goals.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @param {Id} id @param {DayKey} on */
    async pause(id, on) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.pause(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @param {Id} id @param {DayKey} on */
    async resume(id, on) {
      const g = goals.find((x) => x.id === id)
      if (!g) return
      g.resume(on)
      try {
        await goalsRepo.save(g)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @returns {readonly Goal[]} */
    all() {
      revision.get()
      return [...goals]
    },
  }
}
