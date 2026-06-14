import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, COLLECTIONS, Task, Cadence, DayKey } from '@oyl/all-of-oyl'
import { createPlannerStore } from './planner-store.js'
import { effect } from '../lib/reactive/effect.js'

/** @typedef {import('@oyl/all-of-oyl').Plan} Plan */
/** @typedef {import('@oyl/all-of-oyl').Repository<Plan>} PlansRepo */

/** A cloning plans repo over an in-memory map; `fail()` makes subsequent writes throw. */
function setup() {
  const map = new Map()
  let failWrites = false
  const storage = {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => {
      if (failWrites) throw new Error('quota')
      map.set(k, v)
    },
  }
  const repo = /** @type {PlansRepo} */ (
    /** @type {unknown} */ (new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans)))
  )
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
    expect(store.get(/** @type {Task} */ (successor).id)).toBeDefined()
    expect(await repo.list()).toHaveLength(2)
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
      /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
      /** @param {string} k @param {string} v */ setItem: (k, v) => {
        if (writeCount++ >= 1) throw new Error('quota') // fail every write after the first (the add)
        map.set(k, v)
      },
    }
    const repo = /** @type {PlansRepo} */ (
      /** @type {unknown} */ (new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans)))
    )
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
      /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
      /** @param {string} k @param {string} v */ setItem: (k, v) => {
        writes += 1
        map.set(k, v)
      },
    }
    const repo = /** @type {any} */ (new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans)))
    const store = createPlannerStore(repo)
    await store.add(task('Water', { cadence: Cadence.of(1, 'weeks') }))
    const writesBefore = writes
    const t = store.agendaFor(DUE)[0]
    const successor = await store.complete(/** @type {any} */ (t).id, DUE)
    // exactly one storage write during complete → atomic batch (two-save would be 2)
    expect(writes - writesBefore).toBe(1)
    // and BOTH plans persisted: original is done, successor is open
    expect(store.get(/** @type {any} */ (t).id)?.status).toBe('done')
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
    const seen = /** @type {number[]} */ ([])
    effect(() => seen.push(store.agendaFor(DUE).length))
    await store.add(task())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })
})
