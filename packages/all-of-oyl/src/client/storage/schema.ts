import type { EnumerableStorage } from '../ports.js'
import { PREFIX, SCHEMA_VERSION_KEY, isOylKey } from './keys.js'

/** Bump when a stored toJSON shape changes; add a migration keyed off the old number. */
export const CURRENT_SCHEMA_VERSION = 1

export type SchemaState =
  | { status: 'fresh' }
  | { status: 'ok', version: number }
  | { status: 'torn' }
  | { status: 'downgrade', version: number }

/** The minimal storage surface schema inspection needs (window.localStorage satisfies it). */
type ReadableStorage = Pick<EnumerableStorage, 'getItem' | 'key' | 'length'>

/** Count oyl/data/* keys present. */
function hasData(storage: ReadableStorage): boolean {
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k && isOylKey(k) && k.startsWith(`${PREFIX}data/`)) return true
  }
  return false
}

/**
 * Classify what's in storage before hydration. `oyl/schema-version` is the commit
 * marker: data present without it means a torn import.
 */
export function readSchemaState(storage: ReadableStorage): SchemaState {
  const raw = storage.getItem(SCHEMA_VERSION_KEY)
  const dataPresent = hasData(storage)
  if (raw === null) return dataPresent ? { status: 'torn' } : { status: 'fresh' }
  const version = Number(raw)
  // A non-numeric marker is corrupt — treat it as a torn write needing recovery,
  // not a silent "ok" (which would let hydration run against malformed state).
  if (!Number.isInteger(version)) return { status: 'torn' }
  if (version > CURRENT_SCHEMA_VERSION) return { status: 'downgrade', version }
  return { status: 'ok', version: CURRENT_SCHEMA_VERSION }
}
