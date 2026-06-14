import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, readSchemaState } from './schema.js'
import { SCHEMA_VERSION_KEY, dataKey } from './keys.js'

/** @param {Record<string, string>} [seed] */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    /** @param {string} k */
    getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */
    setItem: (k, v) => void map.set(k, v),
    /** @param {string} k */
    removeItem: (k) => void map.delete(k),
    /** @param {number} i */
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('schema state', () => {
  it('reports "fresh" when nothing is stored', () => {
    expect(readSchemaState(fakeStorage())).toEqual({ status: 'fresh' })
  })

  it('reports "ok" when version matches and data exists', () => {
    const s = fakeStorage({ [SCHEMA_VERSION_KEY]: String(CURRENT_SCHEMA_VERSION), [dataKey('entries')]: '[]' })
    expect(readSchemaState(s)).toEqual({ status: 'ok', version: CURRENT_SCHEMA_VERSION })
  })

  it('reports "torn" when data exists but the version marker is missing', () => {
    const s = fakeStorage({ [dataKey('entries')]: '[]' })
    expect(readSchemaState(s)).toEqual({ status: 'torn' })
  })

  it('reports "downgrade" when stored version is newer than the app', () => {
    const s = fakeStorage({ [SCHEMA_VERSION_KEY]: String(CURRENT_SCHEMA_VERSION + 1) })
    expect(readSchemaState(s)).toEqual({ status: 'downgrade', version: CURRENT_SCHEMA_VERSION + 1 })
  })

  it('reports "torn" when the version marker is non-numeric (corrupt)', () => {
    expect(readSchemaState(fakeStorage({ [SCHEMA_VERSION_KEY]: 'abc' }))).toEqual({ status: 'torn' })
    const withData = fakeStorage({ [SCHEMA_VERSION_KEY]: 'abc', [dataKey('entries')]: '[]' })
    expect(readSchemaState(withData)).toEqual({ status: 'torn' })
  })
})
