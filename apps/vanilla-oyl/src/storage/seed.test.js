import { describe, expect, it } from 'vitest'
import { loadDemoData, isEmpty } from './seed.js'
import { makeSeed } from '@oyl/all-of-oyl'
import { SCHEMA_VERSION_KEY, dataKey } from './keys.js'

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

describe('seed', () => {
  it('isEmpty is true for fresh storage, false after seeding', async () => {
    const storage = fakeStorage()
    expect(await isEmpty(storage)).toBe(true)
    await loadDemoData(storage)
    expect(await isEmpty(storage)).toBe(false)
  })

  it('writes every seed collection and sets the schema version last', async () => {
    const storage = fakeStorage()
    await loadDemoData(storage)
    expect(storage.getItem(SCHEMA_VERSION_KEY)).not.toBeNull()
    // loadDemoData stamps each collection under its data key (the local dev-seed surface).
    const seed = makeSeed()
    expect(JSON.parse(/** @type {string} */ (storage.getItem(dataKey('notes')))).length).toBe(seed.notes.length)
    expect(JSON.parse(/** @type {string} */ (storage.getItem(dataKey('subscriptions')))).length).toBe(seed.subscriptions.length)
  })
})
