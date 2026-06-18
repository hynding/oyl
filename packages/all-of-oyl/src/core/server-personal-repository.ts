import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { Codec } from '../collections.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox } from './write-outbox.js'
import type { ReadCache } from './read-cache.js'
import { strapiRowToShape } from './strapi-row.js'

/**
 * Creates a server-backed Repository<T> that satisfies the Repository contract so
 * existing stores (journal-store, etc.) can consume it unchanged.
 *
 * - Reads: api → codec.fromJSON → cache (list is cached under a stable key).
 * - Writes: optimistic via WriteOutbox (enqueue only — the app's flusher flushes later).
 */
export function createServerPersonalRepository<T extends { id: Id; meta?: PersistedMeta }>(deps: {
  path: string
  codec: Codec<T>
  api: ApiClient
  outbox: WriteOutbox
  cache: ReadCache
  /**
   * Backend rows are raw Strapi shapes (numeric `id`, domain id under `recordId`, no
   * `kind`); they're normalized via `strapiRowToShape` before `codec.fromJSON`. For
   * Entry-derived collections set `rowKind` so the heterogeneous reviver can dispatch.
   */
  rowKind?: string
}): Repository<T> {
  const { path, codec, api, outbox, cache, rowKind } = deps
  const LIST_KEY = `${path}::list`
  const decode = (row: unknown): T =>
    codec.fromJSON(strapiRowToShape(row, rowKind !== undefined ? { kind: rowKind } : undefined))

  // Phase 1: list opts (includeDeleted/since) are not yet forwarded to the API — delta-pull comes later.
  async function list(_opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]> {
    const { data } = await api.find(path)
    const decoded = data.map(decode)
    cache.set(LIST_KEY, decoded)
    return decoded
  }

  async function get(id: Id): Promise<T | undefined> {
    const raw = await api.findOne(path, id)
    if (raw === undefined) return undefined
    return decode(raw)
  }

  async function save(item: T): Promise<T> {
    const baseUpdatedAt = item.meta ? item.meta.updatedAt.toISOString() : null
    outbox.enqueue({ entity: path, op: 'save', payload: codec.toJSON(item), baseUpdatedAt })
    return item
  }

  async function saveMany(items: T[]): Promise<T[]> {
    for (const item of items) {
      await save(item)
    }
    return items
  }

  async function del(id: Id): Promise<void> {
    outbox.enqueue({ entity: path, op: 'delete', payload: { id }, baseUpdatedAt: null })
  }

  // Phase 1: purge enqueues a delete op; soft vs hard delete is not yet distinguished at the outbox/protocol level.
  async function purge(id: Id): Promise<void> {
    outbox.enqueue({ entity: path, op: 'delete', payload: { id }, baseUpdatedAt: null })
  }

  return { list, get, save, saveMany, delete: del, purge }
}
