import { COLLECTIONS, DayRange } from '@oyl/all-of-oyl'
import { CURRENT_SCHEMA_VERSION } from './schema.js'
import { SETTINGS_KEY } from './keys.js'
import { now } from './clock.js'
import { loadDataset } from './seed.js'

/**
 * Account backup over the hydrated stores (online-first): export serializes what the
 * signed-in account actually holds; import validates then loads through the same
 * store paths as seeding, so restored data flows into the outbox → server.
 *
 * @typedef {{ schemaVersion: number, exportedAt: string, settings: unknown,
 *   collections: Record<string, unknown[]> }} BackupDoc
 * @typedef {ReturnType<typeof import('../state/data.js').createDataState>} DataState
 */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/** Journal entry kind → its collection key in the backup document. */
const COLLECTION_BY_KIND = /** @type {Record<string, string>} */ ({
  'note': 'notes',
  'measurement': 'measurements',
  'consumption': 'consumptions',
  'transaction': 'transactions',
  'activity-session': 'activitySessions',
})

/**
 * Capture the account's data as a single portable document (toJSON wire shapes —
 * the same format `loadDataset` accepts, so an export is always re-importable).
 * Collections without a store surface yet export as [] (documented in seed.js).
 * @param {AppStorage} storage
 * @param {DataState} dataState
 * @returns {BackupDoc}
 */
export function exportData(storage, dataState) {
  /** @type {Record<string, unknown[]>} */
  const collections = {}
  for (const name of Object.keys(COLLECTIONS)) collections[name] = []

  const journal = dataState.journal.peek()
  const span = journal.span()
  if (span) {
    for (const entry of journal.entriesIn(DayRange.of(span.start, span.end))) {
      const key = COLLECTION_BY_KIND[entry.kind]
      if (key) (collections[key] ??= []).push(entry.toJSON())
    }
  }
  collections.plans = dataState.planner.peek().all().map((p) => p.toJSON())
  collections.documents = dataState.vault.documents().map((d) => d.toJSON())
  collections.possessions = dataState.vault.possessions().map((p) => p.toJSON())
  collections.subscriptions = dataState.vault.subscriptions().map((s) => s.toJSON())
  collections.contacts = dataState.vault.contacts().map((c) => c.toJSON())
  collections.giftIdeas = dataState.vault.giftIdeas().map((g) => g.toJSON())
  collections.goals = dataState.goals.all().map((g) => g.toJSON())
  collections.budgets = dataState.budgets.all().map((b) => b.toJSON())
  collections.accounts = dataState.accounts.all().map((a) => a.toJSON())
  collections.consumables = dataState.consumables.all().map((c) => c.toJSON())
  collections.consumableProducts = dataState.consumableProducts.all().map((p) => p.toJSON())

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
 * throw), then load it into the account through the stores. Loading nothing on any
 * validation failure. Existing records with the same ids are upserted server-side,
 * so re-importing your own backup is effectively idempotent.
 * @param {DataState} dataState
 * @param {string} json
 * @returns {Promise<{ added: number, skipped: number }>}
 */
export async function importData(dataState, json) {
  const doc = /** @type {BackupDoc} */ (JSON.parse(json))
  if (typeof doc !== 'object' || doc === null || typeof doc.collections !== 'object') {
    throw new Error('backup: not a valid OYL export')
  }
  if (doc.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`backup: schema version ${doc.schemaVersion} is newer than this app`)
  }
  // Validate everything BEFORE loading: revive each shape via its codec (throws on bad).
  for (const name of Object.keys(COLLECTIONS)) {
    const codec = /** @type {any} */ (COLLECTIONS[/** @type {keyof typeof COLLECTIONS} */ (name)])
    for (const shape of doc.collections[name] ?? []) codec.fromJSON(shape)
  }
  return loadDataset(dataState, /** @type {any} */ (doc.collections))
}
