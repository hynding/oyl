import { COLLECTIONS, LocalStorageRepository, createHttpRepository } from '@oyl/all-of-oyl'
import { dataKey } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {keyof typeof COLLECTIONS} CollectionName
 * @typedef {Record<CollectionName, import('@oyl/all-of-oyl').Repository<any>>} Repositories
 */

/**
 * Construct one repository per manifest collection. When `opts.client` is provided each
 * repo delegates to the HTTP API; otherwise falls back to localStorage.
 * @param {import('@oyl/all-of-oyl').StorageLike} storage
 * @param {{ client?: import('@oyl/all-of-oyl').HttpClient }} [opts]
 * @returns {Repositories}
 */
export function makeRepositories(storage, opts = {}) {
  const repos = /** @type {Repositories} */ ({})
  for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
    const codec = /** @type {any} */ (COLLECTIONS[name])
    repos[name] = opts.client
      ? /** @type {any} */ (createHttpRepository(opts.client, name, codec))
      : new LocalStorageRepository(storage, dataKey(name), codec, now)
  }
  return repos
}

/**
 * Live (non-deleted) record count per collection.
 * @param {Repositories} repos
 * @returns {Promise<Record<string, number>>}
 */
export async function collectionCounts(repos) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const name of /** @type {CollectionName[]} */ (Object.keys(repos))) {
    counts[name] = (await repos[name].list()).length
  }
  return counts
}
