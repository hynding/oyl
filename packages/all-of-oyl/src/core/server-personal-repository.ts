import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { Codec } from '../collections.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox } from './write-outbox.js'
import type { ReadCache } from './read-cache.js'

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
  now: () => Date
}): Repository<T> {
  const { path, codec, api, outbox, cache } = deps
  const LIST_KEY = `${path}::list`

  async function list(_opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]> {
    const { data } = await api.find(path)
    const decoded = data.map((row) => codec.fromJSON(row))
    cache.set(LIST_KEY, decoded)
    return decoded
  }

  async function get(id: Id): Promise<T | undefined> {
    const raw = await api.findOne(path, id)
    if (raw === undefined) return undefined
    return codec.fromJSON(raw)
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

  async function purge(id: Id): Promise<void> {
    outbox.enqueue({ entity: path, op: 'delete', payload: { id }, baseUpdatedAt: null })
  }

  return { list, get, save, saveMany, delete: del, purge }
}
