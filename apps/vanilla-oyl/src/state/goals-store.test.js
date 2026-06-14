import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Goal, DayKey } from '@oyl/all-of-oyl'
import { createGoalsStore } from './goals-store.js'

/** @typedef {import('@oyl/all-of-oyl').Goal} GoalT */
const today = DayKey.of('2026-06-13')
/** @param {string} [name] @param {Record<string, unknown>} [opts] */
const goal = (name = 'G', opts = {}) => new Goal({ name, metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day', ...opts })

describe('createGoalsStore', () => {
  it('add persists and reflects in all(); remove deletes', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    expect(store.all()).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await store.remove(saved.id)
    expect(store.all()).toHaveLength(0)
  })

  it('pause leaves an open pause; resume closes it', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    await store.pause(saved.id, today)
    const paused = /** @type {GoalT} */ (store.all()[0])
    expect(paused.pauses).toHaveLength(1)
    expect(paused.pauses[0]?.to).toBeUndefined()
    await store.resume(saved.id, today)
    const resumed = /** @type {GoalT} */ (store.all()[0])
    expect(resumed.pauses[0]?.to?.value).toBe(today.value)
  })

  it('hydrate rebuilds from the repo', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    await repo.save(goal('seeded'))
    const store = createGoalsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all()).toHaveLength(1)
  })
})
