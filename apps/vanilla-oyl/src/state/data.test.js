import { describe, expect, it } from 'vitest'
import { Note, Measurement, Goal, DayKey, Task, periodWindowOf } from '@oyl/all-of-oyl'
import { createThemeState } from './theme.js'
import { createDataState } from './data.js'
import { defaultTimezone } from '../storage/clock.js'
import { loadDemoData } from '../storage/seed.js'

/** @param {Record<string,string>} [seed] */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => void map.set(k, v),
    /** @param {string} k */ removeItem: (k) => void map.delete(k),
    /** @param {number} i */ key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('data state', () => {
  it('refresh populates schema + counts; readDiagnostics composes them', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await ds.refresh()
    expect(ds.schema.get().status).toBe('fresh')
    expect(ds.counts.get()).toBeTypeOf('object')
    const diag = ds.readDiagnostics()
    expect(diag.schema.status).toBe('fresh')
    expect(diag.theme.theme).toBe('classic')
    expect(typeof diag.build).toBe('string')
  })

  it('exposes a journal store hydrated from the entries repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.entries.save(new Note({ occurredAt: new Date(iso), text: 'hi' }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    expect(ds.journal.entriesOn(day)).toHaveLength(1)
  })

  it('exposes a planner store hydrated from the plans repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const due = DayKey.of('2026-06-16')
    await ds.repos.plans.save(/** @type {any} */ (new Task({ title: 'plan it', due })))
    await ds.refresh()
    expect(ds.planner.agendaFor(due)).toHaveLength(1)
  })

  it('readDiagnostics includes a storage estimate when the Storage API is available', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage')
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 1234, quota: 5_000_000 }) },
    })
    try {
      const storage = fakeStorage()
      const ds = createDataState(storage, createThemeState(storage))
      await ds.refresh()
      expect(ds.readDiagnostics().storage).toEqual({ usage: 1234, quota: 5_000_000 })
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'storage', original)
      else Reflect.deleteProperty(globalThis.navigator, 'storage')
    }
  })

  it('exposes a vault store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.vault.hydrate).toBe('function')
    expect(typeof ds.vault.upcoming).toBe('function')
  })

  it('exposes a goals store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.goals.all).toBe('function')
  })

  it('exposes a budgets store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.budgets.all).toBe('function')
  })

  it('reviewOn composes a review for a period', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.goals.save(new Goal({ name: 'Sleep', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' }))
    await ds.repos.entries.save(new Measurement({ occurredAt: new Date(iso), metric: 'sleep.hours', value: 7 }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('day', day))
    expect(r.goals).toHaveLength(1)
    expect(r.goals[0]?.progress.current).toBe(7)
    expect(r.totals).toBeDefined()
  })

  it('readDiagnostics storage is null when the Storage API is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage')
    Reflect.deleteProperty(globalThis.navigator, 'storage')
    try {
      const storage = fakeStorage()
      const ds = createDataState(storage, createThemeState(storage))
      await ds.refresh()
      expect(ds.readDiagnostics().storage).toBeNull()
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'storage', original)
    }
  })

  it('reviewOn includes named life areas from the loaded catalogs', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await loadDemoData(storage)
    await ds.refresh()
    const day = DayKey.from(new Date(), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('month', day))
    expect(r.areas.map((a) => a.name)).toContain('Health')
  })
})
