import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Goal, DayKey } from '../../index.js'
import { createGoalsStore } from './goals.js'

const today = DayKey.of('2026-06-13')
const goal = (name = 'G', opts: Record<string, unknown> = {}) => new Goal({ name, metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day', ...opts })

describe('createGoalsStore', () => {
  it('add persists and reflects in all(); remove deletes', async () => {
    const repo = (new InMemoryRepository() as any)
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    expect(store.all()).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await store.remove(saved.id)
    expect(store.all()).toHaveLength(0)
  })

  it('pause leaves an open pause; resume closes it', async () => {
    const repo = (new InMemoryRepository() as any)
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    await store.pause(saved.id, today)
    const paused = (store.all()[0] as Goal)
    expect(paused.pauses).toHaveLength(1)
    expect(paused.pauses[0]?.to).toBeUndefined()
    await store.resume(saved.id, today)
    const resumed = (store.all()[0] as Goal)
    expect(resumed.pauses[0]?.to?.value).toBe(today.value)
  })

  it('pause survives an outbox-era repo whose reads lag the write (no post-save re-read)', async () => {
    // Online-first: save() only ENQUEUES — a repo read right after may return stale
    // state. The store must trust its in-place mutation, not re-hydrate on success.
    const repo = (new InMemoryRepository() as any)
    const store = createGoalsStore(repo)
    const saved = await store.add(goal())
    const staleList = repo.list.bind(repo)
    repo.list = async () => (await staleList()).map((g: Goal) => Goal.fromJSON(JSON.parse(JSON.stringify(g.toJSON())))) // decouple instances
    repo.save = async (g: Goal) => g // enqueue-only: repo state never advances
    await store.pause(saved.id, today)
    const paused = (store.all()[0] as Goal)
    expect(paused.pauses).toHaveLength(1)
    await store.resume(saved.id, today)
    const resumed = (store.all()[0] as Goal)
    expect(resumed.pauses[0]?.to?.value).toBe(today.value)
  })

  it('hydrate rebuilds from the repo', async () => {
    const repo = (new InMemoryRepository() as any)
    await repo.save(goal('seeded'))
    const store = createGoalsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all()).toHaveLength(1)
  })
})
