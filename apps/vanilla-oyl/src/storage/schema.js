import { PREFIX, SCHEMA_VERSION_KEY, isOylKey } from './keys.js'

/** Bump when a stored toJSON shape changes; add a migration keyed off the old number. */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * @typedef {{ status: 'fresh' }
 *   | { status: 'ok', version: number }
 *   | { status: 'torn' }
 *   | { status: 'downgrade', version: number }} SchemaState
 */

/** The minimal storage surface schema inspection needs (window.localStorage satisfies it). */
/** @typedef {{ getItem(k: string): string | null, key(i: number): string | null, length: number }} ReadableStorage */

/** Count oyl/data/* keys present. @param {ReadableStorage} storage @returns {boolean} */
function hasData(storage) {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isOylKey(k) && k.startsWith(`${PREFIX}data/`)) return true
  }
  return false
}

/**
 * Classify what's in storage before hydration. `oyl/schema-version` is the commit
 * marker: data present without it means a torn import.
 * @param {ReadableStorage} storage
 * @returns {SchemaState}
 */
export function readSchemaState(storage) {
  const raw = storage.getItem(SCHEMA_VERSION_KEY)
  const dataPresent = hasData(storage)
  if (raw === null) return dataPresent ? { status: 'torn' } : { status: 'fresh' }
  const version = Number(raw)
  if (version > CURRENT_SCHEMA_VERSION) return { status: 'downgrade', version }
  return { status: 'ok', version: CURRENT_SCHEMA_VERSION }
}
