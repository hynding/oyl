import { describe, expect, it } from 'vitest'
import { exportData, importData } from './backup.js'
import { loadDemoData } from './seed.js'
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

describe('backup', () => {
  it('exports a versioned document and re-imports it intact', async () => {
    const src = fakeStorage()
    await loadDemoData(src)
    const doc = exportData(src)
    expect(doc.schemaVersion).toBeGreaterThan(0)
    expect(typeof doc.exportedAt).toBe('string')

    const dest = fakeStorage()
    await importData(dest, JSON.stringify(doc))
    const seed = makeSeed()
    expect(JSON.parse(/** @type {string} */ (dest.getItem(dataKey('entries')))).length).toBe(seed.entries.length)
    expect(dest.getItem(SCHEMA_VERSION_KEY)).not.toBeNull()
  })

  it('rejects a corrupt payload before writing anything', async () => {
    const dest = fakeStorage()
    const corrupt = JSON.stringify({ schemaVersion: 1, exportedAt: 'x', collections: { entries: [{ kind: 'not-a-real-kind' }] } })
    await expect(importData(dest, corrupt)).rejects.toThrow()
    expect(dest.getItem(SCHEMA_VERSION_KEY)).toBeNull()
  })
})
