import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'

/** The narrow slice of the Web Storage API the adapter needs; injected for testability. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/**
 * Repository<T> backed by a single Web Storage key holding a JSON array of toJSON
 * shapes. Mirrors InMemoryRepository's semantics (meta stamping, REVISION_CONFLICT,
 * soft delete, idempotent purge) but CLONES through (de)serialization rather than
 * aliasing the caller's object. One instance per collection.
 */
export class LocalStorageRepository<T extends { id: Id; meta?: PersistedMeta }> implements Repository<T> {
  constructor(
    private readonly storage: StorageLike,
    private readonly key: string,
    private readonly codec: Codec<T>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private readAll(): T[] {
    const raw = this.storage.getItem(this.key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${this.key} is not an array`)
    return parsed.map((shape) => this.codec.fromJSON(shape))
  }

  private writeAll(items: T[]): void {
    this.storage.setItem(this.key, JSON.stringify(items.map((i) => this.codec.toJSON(i))))
  }

  async get(id: Id): Promise<T | undefined> {
    const found = this.readAll().find((i) => i.id === id)
    if (!found || found.meta?.deletedAt) return undefined
    return found
  }

  async list(opts?: { includeDeleted?: boolean }): Promise<T[]> {
    const all = this.readAll()
    return opts?.includeDeleted ? all : all.filter((i) => !i.meta?.deletedAt)
  }

  async save(item: T): Promise<T> {
    const all = this.readAll()
    const idx = all.findIndex((i) => i.id === item.id)
    const now = this.clock()
    // Clone the incoming item so we never alias the caller's object.
    const next = this.codec.fromJSON(this.codec.toJSON(item))
    if (idx === -1) {
      next.meta = { createdAt: now, updatedAt: now, revision: 1 }
      all.push(next)
    } else {
      const stored = all[idx]!
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      next.meta = {
        createdAt: stored.meta?.createdAt ?? now,
        updatedAt: now,
        revision: (stored.meta?.revision ?? 0) + 1,
      }
      all[idx] = next
    }
    this.writeAll(all)
    return next
  }

  async saveMany(items: T[]): Promise<T[]> {
    const all = this.readAll()
    const now = this.clock()
    const result: T[] = []
    for (const item of items) {
      const idx = all.findIndex((i) => i.id === item.id)
      const next = this.codec.fromJSON(this.codec.toJSON(item))
      if (idx === -1) {
        next.meta = { createdAt: now, updatedAt: now, revision: 1 }
        all.push(next)
      } else {
        const stored = all[idx]!
        if (item.meta?.revision !== stored.meta?.revision) {
          throw new DomainError(
            'REVISION_CONFLICT',
            `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
          )
        }
        next.meta = {
          createdAt: stored.meta?.createdAt ?? now,
          updatedAt: now,
          revision: (stored.meta?.revision ?? 0) + 1,
        }
        all[idx] = next
      }
      result.push(next)
    }
    this.writeAll(all)
    return result
  }

  async delete(id: Id): Promise<void> {
    const all = this.readAll()
    const idx = all.findIndex((i) => i.id === id)
    const stored = idx === -1 ? undefined : all[idx]
    if (!stored || !stored.meta || stored.meta.deletedAt) return
    const now = this.clock()
    stored.meta = { ...stored.meta, updatedAt: now, revision: stored.meta.revision + 1, deletedAt: now }
    all[idx] = stored
    this.writeAll(all)
  }

  async purge(id: Id): Promise<void> {
    const all = this.readAll()
    const next = all.filter((i) => i.id !== id)
    if (next.length !== all.length) this.writeAll(next)
  }
}
