import {
  COLLECTIONS,
  entitiesByKind,
  createWriteOutbox,
  createReadCache,
  createServerPersonalRepository,
  createCatalogClient,
  alwaysOnline,
  strapiRowToShape,
} from '../../index.js'
import type { ApiClient, BootstrapPayload, CatalogClient, Connectivity, Repository, WriteOutbox } from '../../index.js'
import type { StorageLike } from '../ports.js'
import { OUTBOX_KEY, READ_CACHE_KEY } from './keys.js'
import { now } from './clock.js'

export type CollectionName = keyof typeof COLLECTIONS
export type Repositories = Record<CollectionName, Repository<any>>
export type Catalogs = Partial<Record<CollectionName, CatalogClient<any>>>

/** Read-cache bounds — recent list reads only; durable writes live in the outbox. */
const READ_CACHE_MAX_ENTRIES = 64
const READ_CACHE_TTL_MS = 5 * 60_000

/**
 * Manifest collection → Strapi REST plural path. The flusher routes by this map.
 * Keys mirror COLLECTIONS exactly (exhaustive Record<CollectionName, string>).
 */
export const PATH_BY_COLLECTION: Record<CollectionName, string> = {
  users: 'users',
  lifeAreas: 'life-areas',
  activities: 'activities',
  consumables: 'consumables',
  consumableProducts: 'consumable-products',
  accounts: 'accounts',
  notes: 'notes',
  consumptions: 'consumptions',
  transactions: 'transactions',
  measurements: 'measurements',
  activitySessions: 'activity-sessions',
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
 * Entry-derived personal collections whose Strapi rows lack a `kind` field.
 * `strapiRowToShape(row, { kind: rowKind })` injects it so per-kind `Class.fromJSON`
 * can parse the shape (each calls `parseEntryBase(shape, expectedKind)` which requires
 * the `kind` field). Documentation / forward-compat only — only BACKED collections are
 * wired to a real server repo in this phase.
 */
export const ROW_KIND_BY_COLLECTION: Partial<Record<CollectionName, string>> = {
  notes: 'note',
  consumptions: 'consumption',
  transactions: 'transaction',
  measurements: 'measurement',
  activitySessions: 'activity-session',
}

/**
 * Collections that have a live Strapi backend in this phase.
 * Others get `emptyRepo()` so their stores boot without hitting nonexistent endpoints.
 */
const BACKED = new Set<CollectionName>(['notes', 'consumptions', 'accounts', 'transactions', 'budgets', 'measurements', 'activitySessions', 'goals'])

/**
 * Catalog collections with a live Strapi backend. `lifeAreas` has no content-type yet,
 * so it gets a no-network client — a live one would 404 `/api/life-areas` on every boot.
 */
export const CATALOG_BACKED = new Set<CollectionName>(['activities', 'consumables', 'consumableProducts'])

/** ES-only outbox mutation id (the browser passes crypto.randomUUID via makeRepositories' `newId`). */
export function fallbackId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
 */
export function makeRepositories(
  storage: StorageLike,
  opts: { api?: ApiClient, connectivity?: Connectivity, newId?: () => string } = {},
): {
  repos: Repositories
  catalogs: Catalogs
  outbox: WriteOutbox
  flush: () => Promise<void>
} {
  const api = opts.api ?? noopApi()
  const connectivity = opts.connectivity ?? alwaysOnline()
  const newId = opts.newId ?? fallbackId
  // Same-tab flush: the `storage` event doesn't fire in the writing tab, so wire the
  // outbox's onEnqueue to the (late-bound, online-gated, re-entrancy-guarded) flusher.
  // Any same-tab write thus flushes promptly without waiting for reload/online.
  let flush: () => Promise<void> = async () => {}
  const outbox = createWriteOutbox(storage, OUTBOX_KEY, now, newId, () => { void flush().catch(() => {}) })
  const cache = createReadCache(storage, READ_CACHE_KEY, {
    maxEntries: READ_CACHE_MAX_ENTRIES,
    ttlMs: READ_CACHE_TTL_MS,
    now: () => now().getTime(),
  })

  const repos = {} as Repositories
  for (const name of entitiesByKind('personal')) {
    if (BACKED.has(name)) {
      const rowKind = ROW_KIND_BY_COLLECTION[name]
      repos[name] = createServerPersonalRepository({
        path: PATH_BY_COLLECTION[name],
        codec: COLLECTIONS[name] as any,
        api,
        outbox,
        cache,
        ...(rowKind !== undefined ? { rowKind } : {}),
      })
    } else {
      repos[name] = emptyRepo()
    }
  }

  const catalogs: Catalogs = {}
  for (const name of entitiesByKind('catalog')) {
    const client = CATALOG_BACKED.has(name)
      ? createCatalogClient({
          path: PATH_BY_COLLECTION[name],
          codec: COLLECTIONS[name] as any,
          api,
          outbox,
        })
      : emptyCatalogClient()
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
 */
export function createFlusher(outbox: WriteOutbox, api: ApiClient, connectivity: Connectivity): () => Promise<void> {
  let draining = false
  let requestedMidDrain = false
  return async function flush() {
    if (draining) {
      // An enqueue arrived while a drain pass was iterating its snapshot — remember it,
      // so the active drain runs another pass instead of stranding the new op.
      requestedMidDrain = true
      return
    }
    if (!connectivity.isOnline()) return
    draining = true
    try {
      let cleanPass = true
      do {
        requestedMidDrain = false
        cleanPass = true
        for (const m of outbox.peekAll()) {
          try {
            if (m.op === 'delete') {
              const id = String((m.payload as { id?: unknown })?.id ?? '')
              await api.remove(m.entity, id)
            } else {
              // Saves PUT to /<path>/<domainId> — the backend upserts by recordId (the
              // domain id), so a create-then-edit round-trip reconciles to one row.
              const id = String((m.payload as { id?: unknown })?.id ?? '')
              await api.update(m.entity, id, m.payload)
            }
            outbox.ack(m.id)
          } catch {
            // Stop the drain — preserve order; retry this op on the next flush.
            cleanPass = false
            break
          }
        }
        // Re-pass only after a fully clean pass (a failed pass must wait for its retry
        // trigger — looping immediately would hammer a failing backend).
      } while (cleanPass && requestedMidDrain)
    } finally {
      draining = false
    }
  }
}

/**
 * A `Repository`-shaped read facade over a CatalogClient. Reads delegate to the client;
 * writes route through the client's outbox-backed create (delete is a no-op — catalog
 * entries are admin-managed). Lets catalog collections sit in the COLLECTIONS-keyed repos.
 */
function catalogRepoAdapter(client: CatalogClient<any>): Repository<any> {
  return {
    list: () => client.list(),
    get: (id) => client.get(id),
    save: async (item) => { client.create(item); return item },
    saveMany: async (items) => { for (const i of items) client.create(i); return items },
    delete: async () => {},
    purge: async () => {},
  }
}

/**
 * A no-network CatalogClient for catalog collections with no backend yet. `create` is a
 * no-op (NOT an enqueue): the flusher stops at the first failure, so a mutation against
 * a nonexistent route would 404 forever and wedge the outbox drain.
 */
function emptyCatalogClient(): CatalogClient<any> {
  return {
    search: async () => [],
    list: async () => [],
    get: async () => undefined,
    create: () => {},
  }
}

/** An empty Repository for entities with no backend client yet. */
function emptyRepo(): Repository<any> {
  return {
    list: async () => [],
    get: async () => undefined,
    save: async (item) => item,
    saveMany: async (items) => items,
    delete: async () => {},
    purge: async () => {},
  }
}

/** A do-nothing ApiClient for boot before/without a configured backend. */
function noopApi(): ApiClient {
  return {
    find: async () => ({ data: [], meta: {} }),
    findOne: async () => undefined,
    create: async (_path, data) => data,
    update: async (_path, _id, data) => data,
    remove: async () => {},
    bootstrap: async () => undefined,
  }
}

/**
 * Decode a raw GET /bootstrap payload (Strapi rows keyed by REST plural path) into domain
 * lists keyed by CollectionName. Rows decode exactly like the per-collection read paths:
 * `strapiRowToShape` normalization + per-kind injection for Entry-derived collections.
 * Collections absent from the payload decode to [] so stores and counts read uniformly.
 */
export function decodeBootstrap(payload: BootstrapPayload): Record<CollectionName, any[]> {
  const out = {} as Record<CollectionName, any[]>
  for (const name of Object.keys(COLLECTIONS) as CollectionName[]) {
    const rows = payload[PATH_BY_COLLECTION[name]]
    const rowKind = ROW_KIND_BY_COLLECTION[name]
    out[name] = Array.isArray(rows)
      ? rows.map((row) => (COLLECTIONS[name] as any).fromJSON(
          strapiRowToShape(row, rowKind !== undefined ? { kind: rowKind } : undefined),
        ))
      : []
  }
  return out
}

/**
 * Live (non-deleted) record count per collection.
 */
export async function collectionCounts(repos: Repositories): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const name of Object.keys(repos) as CollectionName[]) {
    counts[name] = (await repos[name].list()).length
  }
  return counts
}
