import {
  COLLECTIONS,
  entitiesByKind,
  createWriteOutbox,
  createReadCache,
  createServerPersonalRepository,
  createCatalogClient,
  alwaysOnline,
} from '@oyl/all-of-oyl'
import { OUTBOX_KEY, READ_CACHE_KEY } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {keyof typeof COLLECTIONS} CollectionName
 * @typedef {Record<CollectionName, import('@oyl/all-of-oyl').Repository<any>>} Repositories
 * @typedef {Partial<Record<CollectionName, import('@oyl/all-of-oyl').CatalogClient<any>>>} Catalogs
 */

/** Read-cache bounds — recent list reads only; durable writes live in the outbox. */
const READ_CACHE_MAX_ENTRIES = 64
const READ_CACHE_TTL_MS = 5 * 60_000

/**
 * Manifest collection → Strapi REST plural path. Phase 2 ships `entries`→`notes`
 * and `activities`→`activities`; the rest are best-guess plurals, unused until each
 * gains a backend content-type (Sub-project B). The flusher routes by this map.
 * @type {Record<CollectionName, string>}
 */
export const PATH_BY_COLLECTION = {
  users: 'users',
  lifeAreas: 'life-areas',
  activities: 'activities',
  consumables: 'consumables',
  consumableProducts: 'consumable-products',
  accounts: 'accounts',
  entries: 'notes',
  goals: 'goals',
  budgets: 'budgets',
  plans: 'plans',
  projects: 'projects',
  dayPlans: 'day-plans',
  documents: 'documents',
  possessions: 'possessions',
  subscriptions: 'subscriptions',
  contacts: 'contacts',
  giftIdeas: 'gift-ideas',
  connections: 'connections',
  grants: 'grants',
}

/**
 * Entry-derived personal collections whose backend rows lack a `kind` discriminant and
 * are decoded by the heterogeneous reviver. The server-repo injects this `kind` after
 * `strapiRowToShape` (recordId->id) so `reviveEntry` can dispatch. Today only `notes`
 * have a backend; future Entry collections (measurements, …) slot in here.
 * @type {Partial<Record<CollectionName, string>>}
 */
export const ROW_KIND_BY_COLLECTION = {
  entries: 'note',
}

/** A UUID source for outbox mutation ids. @returns {string} */
function newId() {
  const c = /** @type {{ randomUUID?: () => string } | undefined} */ (globalThis.crypto)
  return c?.randomUUID ? c.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Build the online-first data layer: one ApiClient, one WriteOutbox, one ReadCache,
 * a server-backed `Repository` per `entitiesByKind('personal')` (writes enqueue to the
 * outbox; reads hit the API + cache), and a `CatalogClient` per `entitiesByKind('catalog')`.
 * The returned `flush` drains the outbox to the backend when connectivity reports online.
 *
 * The server is the source of truth (account-required). System-kind entities are skipped
 * (no client surface yet). `repos` is keyed by COLLECTIONS so existing stores consume it
 * unchanged (it's `Repository`-shaped).
 *
 * @param {import('@oyl/all-of-oyl').StorageLike} storage
 * @param {{
 *   api?: import('@oyl/all-of-oyl').ApiClient,
 *   connectivity?: import('@oyl/all-of-oyl').Connectivity,
 * }} [opts]
 * @returns {{
 *   repos: Repositories,
 *   catalogs: Catalogs,
 *   outbox: import('@oyl/all-of-oyl').WriteOutbox,
 *   flush: () => Promise<void>,
 * }}
 */
export function makeRepositories(storage, opts = {}) {
  const api = opts.api ?? noopApi()
  const connectivity = opts.connectivity ?? alwaysOnline()
  // Same-tab flush: the `storage` event doesn't fire in the writing tab, so wire the
  // outbox's onEnqueue to the (late-bound, online-gated, re-entrancy-guarded) flusher.
  // Any same-tab write thus flushes promptly without waiting for reload/online.
  /** @type {() => Promise<void>} */
  let flush = async () => {}
  const outbox = createWriteOutbox(storage, OUTBOX_KEY, now, newId, () => { void flush().catch(() => {}) })
  const cache = createReadCache(storage, READ_CACHE_KEY, {
    maxEntries: READ_CACHE_MAX_ENTRIES,
    ttlMs: READ_CACHE_TTL_MS,
    now: () => now().getTime(),
  })

  const repos = /** @type {Repositories} */ ({})
  for (const name of entitiesByKind('personal')) {
    const rowKind = ROW_KIND_BY_COLLECTION[name]
    repos[name] = createServerPersonalRepository({
      path: PATH_BY_COLLECTION[name],
      codec: /** @type {any} */ (COLLECTIONS[name]),
      api,
      outbox,
      cache,
      ...(rowKind !== undefined ? { rowKind } : {}),
    })
  }

  const catalogs = /** @type {Catalogs} */ ({})
  for (const name of entitiesByKind('catalog')) {
    const client = createCatalogClient({
      path: PATH_BY_COLLECTION[name],
      codec: /** @type {any} */ (COLLECTIONS[name]),
      api,
      outbox,
    })
    catalogs[name] = client
    // Expose a Repository-shaped read facade so existing stores (which call .list())
    // keep working; catalog writes flow through the catalog client / outbox.
    repos[name] = catalogRepoAdapter(client)
  }

  // System-kind entities (connections/grants) have no client surface yet — give the
  // stores an empty repo so they boot. They gain a server in a later sub-project.
  for (const name of entitiesByKind('system')) {
    repos[name] = emptyRepo()
  }

  flush = createFlusher(outbox, api, connectivity)
  return { repos, catalogs, outbox, flush }
}

/**
 * Create the outbox flusher. When connectivity is online it drains the outbox in order,
 * POSTing saves / DELETEing removes via the ApiClient and ack-ing each on success. It
 * stops at the first failure so order is preserved and the failed op is retried on the
 * next flush (online event or subsequent enqueue). Offline → no-op.
 * @param {import('@oyl/all-of-oyl').WriteOutbox} outbox
 * @param {import('@oyl/all-of-oyl').ApiClient} api
 * @param {import('@oyl/all-of-oyl').Connectivity} connectivity
 * @returns {() => Promise<void>}
 */
export function createFlusher(outbox, api, connectivity) {
  let draining = false
  return async function flush() {
    if (draining || !connectivity.isOnline()) return
    draining = true
    try {
      for (const m of outbox.peekAll()) {
        try {
          if (m.op === 'delete') {
            const id = String(/** @type {{ id?: unknown }} */ (m.payload)?.id ?? '')
            await api.remove(m.entity, id)
          } else {
            // Saves PUT to /<path>/<domainId> — the backend upserts by recordId (the
            // domain id), so a create-then-edit round-trip reconciles to one row.
            const id = String(/** @type {{ id?: unknown }} */ (m.payload)?.id ?? '')
            await api.update(m.entity, id, m.payload)
          }
          outbox.ack(m.id)
        } catch {
          // Stop the drain — preserve order; retry this op on the next flush.
          break
        }
      }
    } finally {
      draining = false
    }
  }
}

/**
 * A `Repository`-shaped read facade over a CatalogClient. Reads delegate to the client;
 * writes route through the client's outbox-backed create (delete is a no-op — catalog
 * entries are admin-managed). Lets catalog collections sit in the COLLECTIONS-keyed repos.
 * @param {import('@oyl/all-of-oyl').CatalogClient<any>} client
 * @returns {import('@oyl/all-of-oyl').Repository<any>}
 */
function catalogRepoAdapter(client) {
  return {
    list: () => client.list(),
    get: (id) => client.get(id),
    save: async (item) => { client.create(item); return item },
    saveMany: async (items) => { for (const i of items) client.create(i); return items },
    delete: async () => {},
    purge: async () => {},
  }
}

/** An empty Repository for entities with no backend client yet. @returns {import('@oyl/all-of-oyl').Repository<any>} */
function emptyRepo() {
  return {
    list: async () => [],
    get: async () => undefined,
    save: async (item) => item,
    saveMany: async (items) => items,
    delete: async () => {},
    purge: async () => {},
  }
}

/** A do-nothing ApiClient for boot before/without a configured backend. @returns {import('@oyl/all-of-oyl').ApiClient} */
function noopApi() {
  return {
    find: async () => ({ data: [], meta: {} }),
    findOne: async () => undefined,
    create: async (_path, data) => data,
    update: async (_path, _id, data) => data,
    remove: async () => {},
  }
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
