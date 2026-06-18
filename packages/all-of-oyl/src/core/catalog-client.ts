import type { Id } from './id.js'
import type { Codec } from '../collections.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox } from './write-outbox.js'
import type { ReadCache } from './read-cache.js'

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
 * - Reads: api → codec.fromJSON (results cached as needed by the ReadCache).
 * - `create`: optimistic via WriteOutbox; the app's flusher pushes it later.
 */
export function createCatalogClient<T extends { id: Id }>(deps: {
  path: string
  codec: Codec<T>
  api: ApiClient
  outbox: WriteOutbox
  cache: ReadCache
}): CatalogClient<T> {
  const { path, codec, api, outbox, cache: _cache } = deps

  async function search(q: string): Promise<T[]> {
    const { data } = await api.find(path, { 'filters[name][$containsi]': q })
    return data.map((row) => codec.fromJSON(row))
  }

  async function list(): Promise<T[]> {
    const { data } = await api.find(path)
    return data.map((row) => codec.fromJSON(row))
  }

  async function get(id: Id): Promise<T | undefined> {
    const raw = await api.findOne(path, id)
    if (raw === undefined) return undefined
    return codec.fromJSON(raw)
  }

  function create(item: T): void {
    outbox.enqueue({ entity: path, op: 'save', payload: codec.toJSON(item), baseUpdatedAt: null })
  }

  return { search, list, get, create }
}
