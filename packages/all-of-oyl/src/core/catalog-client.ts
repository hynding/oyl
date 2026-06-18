import type { Id } from './id.js'
import type { Codec } from '../collections.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox } from './write-outbox.js'
import { strapiRowToShape } from './strapi-row.js'

/**
 * Read-mostly client for catalog collections (shared reference data).
 * `create` is user-contributed: it enqueues via the outbox (no owner semantics
 * — that is enforced server-side). There is no delete: catalog entries are
 * managed by administrators, not individual users.
 */
export interface CatalogClient<T> {
  search(q: string): Promise<T[]>
  list(): Promise<T[]>
  get(id: Id): Promise<T | undefined>
  /** Enqueues a catalog save mutation via the outbox — does not hit the network. */
  create(item: T): void
}

/**
 * Creates a CatalogClient<T> backed by an ApiClient and WriteOutbox.
 *
 * - Reads: api → codec.fromJSON (no caching — see comment below).
 * - `create`: optimistic via WriteOutbox; the app's flusher pushes it later.
 */
export function createCatalogClient<T extends { id: Id }>(deps: {
  path: string
  codec: Codec<T>
  api: ApiClient
  outbox: WriteOutbox
  // catalog read-caching is deferred — doing it correctly needs cache invalidation on create()
}): CatalogClient<T> {
  const { path, codec, api, outbox } = deps
  // Backend rows are raw Strapi shapes (numeric `id`, domain id under `recordId`);
  // normalize before decoding. Catalog types (e.g. Activity) carry no `kind`.
  const decode = (row: unknown): T => codec.fromJSON(strapiRowToShape(row))

  async function search(q: string): Promise<T[]> {
    const { data } = await api.find(path, { 'filters[name][$containsi]': q })
    return data.map(decode)
  }

  async function list(): Promise<T[]> {
    const { data } = await api.find(path)
    return data.map(decode)
  }

  async function get(id: Id): Promise<T | undefined> {
    const raw = await api.findOne(path, id)
    if (raw === undefined) return undefined
    return decode(raw)
  }

  function create(item: T): void {
    outbox.enqueue({ entity: path, op: 'save', payload: codec.toJSON(item), baseUpdatedAt: null })
  }

  return { search, list, get, create }
}
