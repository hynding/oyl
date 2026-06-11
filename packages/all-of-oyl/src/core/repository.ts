import type { Id } from './id'
import type { PersistedMeta } from './persisted-meta'

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
  /** Soft delete (sets deletedAt). Idempotent. */
  delete(id: Id): Promise<void>
  /** Hard delete — the right-to-erasure path. Idempotent. */
  purge(id: Id): Promise<void>
}
