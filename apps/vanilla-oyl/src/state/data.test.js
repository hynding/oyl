import { describe, expect, it } from 'vitest'
import { createThemeState } from './theme.js'
import { createDataState } from './data.js'

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
})
