import { COLLECTIONS, makeSeed } from '@oyl/all-of-oyl'
import { CURRENT_SCHEMA_VERSION } from './schema.js'
import { SCHEMA_VERSION_KEY, dataKey, isOylKey, PREFIX } from './keys.js'

/** The minimal storage surface these helpers need. */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, key(i: number): string | null, length: number }} AppStorage */

/** True when no oyl/data/* key holds any records. @param {AppStorage} storage @returns {Promise<boolean>} */
export async function isEmpty(storage) {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isOylKey(k) && k.startsWith(`${PREFIX}data/`)) {
      const raw = storage.getItem(k)
      if (raw && raw !== '[]') return false
    }
  }
  return true
}

/**
 * Write the canonical demo dataset (all collections) as toJSON shapes, then stamp the
 * schema version LAST as the commit marker. Replaces any existing data.
 * @param {AppStorage} storage
 * @returns {Promise<void>}
 */
export async function loadDemoData(storage) {
  const seed = /** @type {Record<string, unknown[]>} */ (makeSeed())
  for (const name of /** @type {(keyof typeof COLLECTIONS)[]} */ (Object.keys(COLLECTIONS))) {
    storage.setItem(dataKey(name), JSON.stringify(seed[name] ?? []))
  }
  storage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
}
