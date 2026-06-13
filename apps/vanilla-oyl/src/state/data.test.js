import { describe, expect, it } from 'vitest'
import { Note, DayKey, Task } from '@oyl/all-of-oyl'
import { createThemeState } from './theme.js'
import { createDataState } from './data.js'
import { defaultTimezone } from '../storage/clock.js'

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
})
