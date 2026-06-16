import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { StorageLike } from './local-storage-repository.js'

interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/**
 * A raw, revision-PRESERVING record store for the offline cache. Unlike
 * LocalStorageRepository it never bumps or checks revision: putRaw stores the
 * item's meta verbatim (so it can mirror the server's revision and be overwritten
 * by pull), and getRaw exposes tombstones for the sync engine. One per collection.
 */
export interface CacheStore<T extends { id: Id; meta?: PersistedMeta }> {
  get(id: Id): Promise<T | undefined>
  list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]>
  getRaw(id: Id): Promise<T | undefined>
  putRaw(item: T): Promise<void>
  removeRaw(id: Id): Promise<void>
}

export function createCacheStore<T extends { id: Id; meta?: PersistedMeta }>(
  storage: StorageLike,
  key: string,
  codec: Codec<T>,
): CacheStore<T> {
  function readAll(): T[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${key} is not an array`)
    return parsed.map((s) => codec.fromJSON(s))
  }
  function writeAll(items: T[]): void {
    storage.setItem(key, JSON.stringify(items.map((i) => codec.toJSON(i))))
  }
  return {
    async get(id) {
      const f = readAll().find((i) => i.id === id)
      return !f || f.meta?.deletedAt ? undefined : f
    },
    async list(opts) {
      const all = readAll()
      return opts?.includeDeleted ? all : all.filter((i) => !i.meta?.deletedAt)
    },
    async getRaw(id) {
      return readAll().find((i) => i.id === id)
    },
    async putRaw(item) {
      const all = readAll()
      const idx = all.findIndex((i) => i.id === item.id)
      if (idx === -1) all.push(item)
      else all[idx] = item
      writeAll(all)
    },
    async removeRaw(id) {
      const all = readAll()
      const next = all.filter((i) => i.id !== id)
      if (next.length !== all.length) writeAll(next)
    },
  }
}
