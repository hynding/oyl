import { COLLECTIONS } from '@oyl/all-of-oyl'
import { dataKey, MIGRATED_KEY, MIGRATE_DECLINED_KEY } from './keys.js'

/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/** Σ local (oyl/data/*) record counts across all collections. @param {AppStorage} storage @returns {number} */
export function countLocalRecords(storage) {
  let n = 0
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) n += arr.length
    }
  }
  return n
}

/** Un-migrated local data exists (the standing capability — the manual button). @param {AppStorage} storage @returns {boolean} */
export function hasUnmigratedLocal(storage) {
  return countLocalRecords(storage) > 0 && !storage.getItem(MIGRATED_KEY)
}

/** Offer the auto-prompt iff there's un-migrated local data AND it hasn't been declined. @param {AppStorage} storage @returns {boolean} */
export function shouldOfferMigration(storage) {
  return hasUnmigratedLocal(storage) && !storage.getItem(MIGRATE_DECLINED_KEY)
}

/**
 * Upload local-only data to remote via the engine facades. Idempotent (a no-op once
 * MIGRATED_KEY is set). Validate-first: revive every record before saving any. Sets
 * MIGRATED_KEY on success.
 * @param {AppStorage} storage
 * @param {Record<string, import('@oyl/all-of-oyl').Repository<any>>} repos
 * @returns {Promise<number>}
 */
export async function migrateLocalToRemote(storage, repos) {
  if (storage.getItem(MIGRATED_KEY)) return 0
  /** @type {Array<{ name: string, item: any }>} */
  const revived = []
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (!raw) continue
    const shapes = JSON.parse(raw)
    if (!Array.isArray(shapes)) continue
    const codec = /** @type {any} */ (/** @type {any} */ (COLLECTIONS)[name])
    for (const shape of shapes) revived.push({ name, item: codec.fromJSON(shape) })
  }
  for (const { name, item } of revived) {
    const repo = /** @type {any} */ (repos)[name]
    await repo.save(item)
  }
  storage.setItem(MIGRATED_KEY, '1')
  return revived.length
}
