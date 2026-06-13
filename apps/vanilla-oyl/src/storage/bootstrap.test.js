import { describe, expect, it } from 'vitest'
import { makeRepositories, collectionCounts } from './bootstrap.js'
import { COLLECTIONS, makeSeed } from '@oyl/all-of-oyl'
import { dataKey } from './keys.js'

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

describe('bootstrap', () => {
  it('builds one repository per manifest collection', () => {
    const repos = makeRepositories(fakeStorage())
    expect(new Set(Object.keys(repos))).toEqual(new Set(Object.keys(COLLECTIONS)))
  })

  it('reads back seeded data through the right codec', async () => {
    const seed = makeSeed()
    const storage = fakeStorage({ [dataKey('entries')]: JSON.stringify(seed.entries) })
    const repos = makeRepositories(storage)
    const entries = await repos.entries.list()
    expect(entries.length).toBe(seed.entries.length)
  })

  it('collectionCounts reports per-collection record counts', async () => {
    const seed = makeSeed()
    const storage = fakeStorage({
      [dataKey('entries')]: JSON.stringify(seed.entries),
      [dataKey('goals')]: JSON.stringify(seed.goals),
    })
    const counts = await collectionCounts(makeRepositories(storage))
    expect(counts.entries).toBe(seed.entries.length)
    expect(counts.goals).toBe(seed.goals.length)
    expect(counts.contacts).toBe(0)
  })
})
