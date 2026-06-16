import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'

/**
 * Reference implementation and executable specification of Repository
 * semantics: meta stamping, revision conflicts, soft delete, idempotent
 * removal, create-on-foreign-meta. Adapter authors copy these behaviors.
 *
 * Reference-implementation caveat: this store keeps the caller's live object
 * (and stamps meta on it in place). Real adapters should clone on store/read
 * rather than copying this aliasing.
 */
export class InMemoryRepository<T extends { id: Id; meta?: PersistedMeta }> implements Repository<T> {
  private readonly records = new Map<Id, T>()
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  async get(id: Id): Promise<T | undefined> {
    const stored = this.records.get(id)
    if (!stored || stored.meta?.deletedAt) return undefined
    return stored
  }

  async list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]> {
    const all = [...this.records.values()]
    return opts?.includeDeleted ? all : all.filter((r) => !r.meta?.deletedAt)
  }

  async save(item: T): Promise<T> {
    const stored = this.records.get(item.id)
    const now = this.clock()
    if (!stored) {
      // Create — even if the item carries foreign meta (purge-then-restore, imports).
      item.meta = { createdAt: now, updatedAt: now, revision: 1 }
    } else {
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      item.meta = {
        createdAt: stored.meta?.createdAt ?? now,
        updatedAt: now,
        revision: (stored.meta?.revision ?? 0) + 1,
      }
    }
    this.records.set(item.id, item)
    return item
  }

  async saveMany(items: T[]): Promise<T[]> {
    const now = this.clock()
    const staged = items.map((item) => {
      const stored = this.records.get(item.id)
      if (!stored) {
        return { item, meta: { createdAt: now, updatedAt: now, revision: 1 } }
      }
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      return {
        item,
        meta: { createdAt: stored.meta?.createdAt ?? now, updatedAt: now, revision: (stored.meta?.revision ?? 0) + 1 },
      }
    })
    for (const { item, meta } of staged) {
      item.meta = meta
      this.records.set(item.id, item)
    }
    return staged.map((s) => s.item)
  }

  async delete(id: Id): Promise<void> {
    const stored = this.records.get(id)
    if (!stored || !stored.meta || stored.meta.deletedAt) return
    const now = this.clock()
    stored.meta = { ...stored.meta, updatedAt: now, revision: stored.meta.revision + 1, deletedAt: now }
  }

  async purge(id: Id): Promise<void> {
    this.records.delete(id)
  }
}
