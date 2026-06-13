import { COLLECTIONS } from '@oyl/all-of-oyl'
import { CURRENT_SCHEMA_VERSION } from './schema.js'
import { SCHEMA_VERSION_KEY, SETTINGS_KEY, dataKey } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {{ schemaVersion: number, exportedAt: string, settings: unknown,
 *   collections: Record<string, unknown[]> }} BackupDoc
 */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/**
 * Capture all OYL state as a single portable document (toJSON shapes — the same wire
 * format the future backend will seed from).
 * @param {AppStorage} storage
 * @returns {BackupDoc}
 */
export function exportData(storage) {
  /** @type {Record<string, unknown[]>} */
  const collections = {}
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    collections[name] = raw ? JSON.parse(raw) : []
  }
  const settingsRaw = storage.getItem(SETTINGS_KEY)
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    settings: settingsRaw ? JSON.parse(settingsRaw) : null,
    collections,
  }
}

/**
 * Validate a backup document fully (every shape through its codec — unknown kinds
 * throw), then write collections and finally stamp the schema version as the commit
 * marker. Replaces existing data. Throws (writing nothing) on any validation failure.
 * @param {AppStorage} storage
 * @param {string} json
 * @returns {Promise<void>}
 */
export async function importData(storage, json) {
  const doc = /** @type {BackupDoc} */ (JSON.parse(json))
  if (typeof doc !== 'object' || doc === null || typeof doc.collections !== 'object') {
    throw new Error('backup: not a valid OYL export')
  }
  if (doc.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`backup: schema version ${doc.schemaVersion} is newer than this app`)
  }
  // Validate everything BEFORE writing: revive each shape via its codec (throws on bad).
  for (const name of Object.keys(COLLECTIONS)) {
    const codec = /** @type {any} */ (COLLECTIONS[/** @type {keyof typeof COLLECTIONS} */ (name)])
    for (const shape of doc.collections[name] ?? []) codec.fromJSON(shape)
  }
  // Commit: write data, then the version marker LAST.
  for (const name of Object.keys(COLLECTIONS)) {
    storage.setItem(dataKey(name), JSON.stringify(doc.collections[name] ?? []))
  }
  if (doc.settings) storage.setItem(SETTINGS_KEY, JSON.stringify(doc.settings))
  storage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
}
