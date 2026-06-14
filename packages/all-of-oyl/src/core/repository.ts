import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'

/**
 * The persistence port. Apps supply adapters (SQL, CMS, IndexedDB, …);
 * the domain never imports one. Adapters are constructed already scoped
 * to one user — ownership lives in the adapter, not the model.
 */
export interface Repository<T extends { id: Id; meta?: PersistedMeta }> {
  /** undefined for missing AND soft-deleted records. */
  get(id: Id): Promise<T | undefined>
  list(opts?: { includeDeleted?: boolean }): Promise<T[]>
  /** Stamps/refreshes meta (storage clock); returns the item. Stale revision → REVISION_CONFLICT. */
  save(item: T): Promise<T>
  /**
   * Atomically persist several items of this collection. All-or-nothing: every item is
   * stamped and stored, or — on any REVISION_CONFLICT or write error — none are. Per-item
   * semantics match save() (unknown id → revision 1; else stale → REVISION_CONFLICT, else
   * revision bumps). Returns the stamped items in input order; [] for empty input.
   */
  saveMany(items: T[]): Promise<T[]>
  /** Soft delete (sets deletedAt). Idempotent. */
  delete(id: Id): Promise<void>
  /** Hard delete — the right-to-erasure path. Idempotent. */
  purge(id: Id): Promise<void>
}
