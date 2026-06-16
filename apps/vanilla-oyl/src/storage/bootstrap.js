import { COLLECTIONS, LocalStorageRepository, createHttpRepository, createCacheStore, createOutbox, createCursorStore, createSyncEngine, alwaysOnline } from '@oyl/all-of-oyl'
import { dataKey, cacheKey, OUTBOX_KEY, CURSORS_KEY } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {keyof typeof COLLECTIONS} CollectionName
 * @typedef {Record<CollectionName, import('@oyl/all-of-oyl').Repository<any>>} Repositories
 */

/**
 * Build the repositories. Remote mode (`opts.client`) returns offline-first facades from a
 * sync engine (+ the engine for start()/syncState); local mode returns plain localStorage repos.
 * @param {import('@oyl/all-of-oyl').StorageLike} storage
 * @param {{ client?: import('@oyl/all-of-oyl').HttpClient, connectivity?: import('@oyl/all-of-oyl').Connectivity }} [opts]
 * @returns {{ repos: Repositories, engine?: import('@oyl/all-of-oyl').SyncEngine }}
 */
export function makeRepositories(storage, opts = {}) {
  if (opts.client) {
    /** @type {Record<string, { cache: any, remote: any }>} */
    const collections = {}
    for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
      const codec = /** @type {any} */ (COLLECTIONS[name])
      collections[name] = {
        cache: createCacheStore(storage, cacheKey(name), codec),
        remote: createHttpRepository(opts.client, name, codec),
      }
    }
    const outbox = createOutbox(storage, OUTBOX_KEY, now)
    const cursors = createCursorStore(storage, CURSORS_KEY)
    const timers = { set: (/** @type {() => void} */ fn, /** @type {number} */ ms) => setTimeout(fn, ms), clear: (/** @type {any} */ h) => clearTimeout(h) }
    const engine = createSyncEngine({ collections, outbox, connectivity: opts.connectivity ?? alwaysOnline(), now, timers, cursors })
    return { repos: /** @type {Repositories} */ (engine.repositories), engine }
  }
  const repos = /** @type {Repositories} */ ({})
  for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
    repos[name] = new LocalStorageRepository(storage, dataKey(name), /** @type {any} */ (COLLECTIONS[name]), now)
  }
  return { repos }
}

/**
 * Live (non-deleted) record count per collection.
 * @param {Repositories} repos @returns {Promise<Record<string, number>>}
 */
export async function collectionCounts(repos) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const name of /** @type {CollectionName[]} */ (Object.keys(repos))) {
    counts[name] = (await repos[name].list()).length
  }
  return counts
}
