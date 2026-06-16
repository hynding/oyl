import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LifeArea, COLLECTIONS } from '@oyl/all-of-oyl'
import { countLocalRecords, hasUnmigratedLocal, shouldOfferMigration, migrateLocalToRemote } from './migrate.js'
import { dataKey, MIGRATED_KEY, MIGRATE_DECLINED_KEY } from './keys.js'

/** @returns {any} */
function mem() {
  /** @type {Map<string,string>} */
  const m = new Map()
  return { getItem: (/** @type {string} */ k) => (m.has(k) ? m.get(k) : null), setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, String(v)) }, removeItem: (/** @type {string} */ k) => { m.delete(k) } }
}
/** @param {any} storage @param {number} n */
function seedLifeAreas(storage, n) {
  const codec = /** @type {any} */ (COLLECTIONS.lifeAreas)
  const shapes = Array.from({ length: n }, (_, i) => codec.toJSON(new LifeArea({ name: `A${i}`, slug: `a${i}` })))
  storage.setItem(dataKey('lifeAreas'), JSON.stringify(shapes))
}
/** @returns {any} */
function stubRepos() {
  /** @type {any} */
  const r = {}
  for (const name of Object.keys(COLLECTIONS)) r[name] = { save: vi.fn(async (x) => x) }
  return r
}

describe('migrate', () => {
  /** @type {any} */
  let storage
  beforeEach(() => { storage = mem() })

  it('countLocalRecords sums local collections', () => {
    seedLifeAreas(storage, 3)
    expect(countLocalRecords(storage)).toBe(3)
  })

  it('hasUnmigratedLocal vs shouldOfferMigration (decline keeps the button)', () => {
    seedLifeAreas(storage, 1)
    expect(hasUnmigratedLocal(storage)).toBe(true)
    expect(shouldOfferMigration(storage)).toBe(true)
    storage.setItem(MIGRATE_DECLINED_KEY, '1')
    expect(shouldOfferMigration(storage)).toBe(false)
    expect(hasUnmigratedLocal(storage)).toBe(true)
    storage.setItem(MIGRATED_KEY, '1')
    expect(hasUnmigratedLocal(storage)).toBe(false)
    expect(shouldOfferMigration(storage)).toBe(false)
  })

  it('migrateLocalToRemote saves each record, sets MIGRATED_KEY, keeps local intact', async () => {
    seedLifeAreas(storage, 2)
    const repos = stubRepos()
    const n = await migrateLocalToRemote(storage, repos)
    expect(n).toBe(2)
    expect(repos.lifeAreas.save).toHaveBeenCalledTimes(2)
    expect(storage.getItem(MIGRATED_KEY)).toBe('1')
    expect(storage.getItem(dataKey('lifeAreas'))).toBeTruthy()
  })

  it('is idempotent — a second call returns 0 and saves nothing', async () => {
    seedLifeAreas(storage, 2)
    const repos = stubRepos()
    await migrateLocalToRemote(storage, repos)
    repos.lifeAreas.save.mockClear()
    const n = await migrateLocalToRemote(storage, repos)
    expect(n).toBe(0)
    expect(repos.lifeAreas.save).not.toHaveBeenCalled()
  })

  it('aborts on a malformed shape without setting MIGRATED_KEY', async () => {
    storage.setItem(dataKey('lifeAreas'), JSON.stringify([{ garbage: 1 }]))
    const repos = stubRepos()
    await expect(migrateLocalToRemote(storage, repos)).rejects.toThrow()
    expect(storage.getItem(MIGRATED_KEY)).toBeNull()
    expect(repos.lifeAreas.save).not.toHaveBeenCalled()
  })
})
