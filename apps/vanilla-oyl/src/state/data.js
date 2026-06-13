import { signal } from '../lib/reactive/signal.js'
import { makeRepositories, collectionCounts } from '../storage/bootstrap.js'
import { readSchemaState } from '../storage/schema.js'

/** @typedef {import('../storage/schema.js').SchemaState} SchemaState */
/** @typedef {ReturnType<typeof import('./theme.js').createThemeState>} ThemeState */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, key(i: number): string | null, length: number }} AppStorage */

/**
 * App data state: repositories over real storage + reactive diagnostics the Status
 * screen reads. refresh() re-reads everything (boot, seed, import, multi-tab).
 * @param {AppStorage & import('@oyl/all-of-oyl').StorageLike} storage
 * @param {ThemeState} themeState
 */
export function createDataState(storage, themeState) {
  const repos = makeRepositories(storage)
  /** @type {import('../lib/reactive/signal.js').Signal<Record<string, number>>} */
  const counts = signal(/** @type {Record<string, number>} */ ({}))
  /** @type {import('../lib/reactive/signal.js').Signal<SchemaState>} */
  const schema = signal(readSchemaState(storage))

  async function refresh() {
    schema.set(readSchemaState(storage))
    counts.set(await collectionCounts(repos))
  }

  /** Compose the current diagnostics snapshot (reads signals — call inside an effect to stay live). */
  function readDiagnostics() {
    const s = schema.get()
    return {
      schema: 'version' in s ? { status: s.status, version: s.version } : { status: s.status },
      counts: counts.get(),
      theme: themeState.settings.get(),
      build: /** @type {any} */ (globalThis).__OYL_LIB_BUILD__ ?? 'dev',
    }
  }

  return { repos, counts, schema, refresh, readDiagnostics }
}
