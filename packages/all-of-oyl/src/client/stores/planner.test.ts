import { describe, expect, it } from 'vitest'
import type { Plan, Repository } from '../../index.js'
import { InMemoryRepository, LocalStorageRepository, COLLECTIONS, Task, Cadence, DayKey } from '../../index.js'
import { createPlannerStore } from './planner.js'
import { effect } from '../reactive/effect.js'

type PlansRepo = Repository<Plan>

/** A cloning plans repo over an in-memory map; `fail()` makes subsequent writes throw. */
function setup() {
  const map = new Map()
  let failWrites = false
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error('quota')
      map.set(k, v)
    },
  }
  const repo = new LocalStorageRepository(storage, 'oyl/data/plans', COLLECTIONS.plans as any) as unknown as PlansRepo
  return { repo, fail: () => { failWrites = true } }
}

const DUE = DayKey.of('2026-06-16')
const task = (title = 'Water the plants', opts = {}) => new Task({ title, due: DUE, ...opts })

describe('createPlannerStore', () => {
  it('add persists, appears in agendaFor, bumps revision', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const before = store.revision.get()
    const saved = await store.add(task())
    expect(saved.meta?.revision).toBe(1)
    expect(store.agendaFor(DUE)).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('complete marks done, persists, and respawns a recurring successor', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t)
    const successor = await store.complete(t.id, DUE)
    expect(store.get(t.id)?.status).toBe('done')
    expect(successor?.status).toBe('open')
    expect(store.get((successor as Task).id)).toBeDefined()
    expect(await repo.list()).toHaveLength(2)
  })

  it('complete keeps the day agenda when the repo is an enqueue-only stub (online-first)', async () => {
    // plans are not yet backed: the repo saves-as-no-op and lists empty. A success-path
    // re-hydrate would erase the completed plan (and its successor) from the screen.
    const stub = ({
      list: async () => [], get: async () => undefined,
      save: async (p: unknown) => p, saveMany: async (ps: unknown[]) => ps,
      delete: async () => {}, purge: async () => {},
    } as unknown as PlansRepo)
    const store = createPlannerStore(stub)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t)
    const successor = await store.complete(t.id, DUE)
    expect(store.get(t.id)?.status).toBe('done')
    expect(successor?.status).toBe('open')
    expect(store.agendaFor(DUE).length).toBeGreaterThan(0)
    await store.cancel((successor as Task).id)
    expect(store.get((successor as Task).id)?.status).toBe('canceled')
  })

  it('persist-first rollback: a failing save on complete restores the open state', async () => {
    const { repo, fail } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    fail()
    await expect(store.complete(t.id, DUE)).rejects.toThrow('quota')
    expect(store.get(t.id)?.status).toBe('open')
  })

  it('complete is atomic: a failing batch write persists neither the completion nor the successor', async () => {
    const map = new Map()
    let writeCount = 0
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (writeCount++ >= 1) throw new Error('quota') // fail every write after the first (the add)
        map.set(k, v)
      },
    }
    const repo = new LocalStorageRepository(storage, 'oyl/data/plans', COLLECTIONS.plans as any) as unknown as PlansRepo
    const store = createPlannerStore(repo)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t) // write #0 → persisted
    await expect(store.complete(t.id, DUE)).rejects.toThrow('quota') // the batch write (#1) fails
    expect(store.get(t.id)?.status).toBe('open') // completion rolled back via hydrate
    expect(await repo.list()).toHaveLength(1) // only the original, open task — no successor leaked, no partial completion
  })

  it('complete persists in a single storage write (atomic batch, not two saves)', async () => {
    const map = new Map()
    let writes = 0
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        writes += 1
        map.set(k, v)
      },
    }
    const repo = (new LocalStorageRepository(storage, 'oyl/data/plans', COLLECTIONS.plans as any) as any)
    const store = createPlannerStore(repo)
    await store.add(task('Water', { cadence: Cadence.of(1, 'weeks') }))
    const writesBefore = writes
    const t = store.agendaFor(DUE)[0]
    const successor = await store.complete((t as any).id, DUE)
    // exactly one storage write during complete → atomic batch (two-save would be 2)
    expect(writes - writesBefore).toBe(1)
    // and BOTH plans persisted: original is done, successor is open
    expect(store.get((t as any).id)?.status).toBe('done')
    expect(successor?.status).toBe('open')
    expect(await repo.list()).toHaveLength(2)
  })

  it('cancel sets canceled (excluded from agenda, present in canceledOn)', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    await store.cancel(t.id)
    expect(store.get(t.id)?.status).toBe('canceled')
    expect(store.agendaFor(DUE)).toHaveLength(0)
    expect(store.canceledOn(DUE)).toHaveLength(1)
  })

  it('remove deletes from repo and aggregate', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const t = task()
    await store.add(t)
    await store.remove(t.id)
    expect(store.get(t.id)).toBeUndefined()
    expect(await repo.list()).toHaveLength(0)
  })

  it('overdue surfaces open plans whose due has passed', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    await store.add(new Task({ title: 'late', due: DayKey.of('2026-06-13') }))
    expect(store.overdue(DayKey.of('2026-06-16'))).toHaveLength(1)
  })

  it('an effect reading agendaFor re-runs when a mutation bumps revision', async () => {
    const { repo } = setup()
    const store = createPlannerStore(repo)
    const seen = [] as number[]
    effect(() => seen.push(store.agendaFor(DUE).length))
    await store.add(task())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })

  it('peek exposes the live Planner aggregate', async () => {
    const store = createPlannerStore((new InMemoryRepository() as any))
    await store.add(new Task({ title: 'x', due: DayKey.of('2026-06-16') }))
    expect(store.peek().all()).toHaveLength(1)
  })
})
