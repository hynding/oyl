import { DomainError } from './domain-error.js'
import type { StorageLike } from './local-storage-repository.js'

/** Per-collection delta high-water marks (ISO updatedAt), persisted to one storage key. */
export interface CursorStore {
  get(collection: string): string | undefined
  set(collection: string, cursor: string): void
  clear(): void
}

export function createCursorStore(storage: StorageLike, key: string): CursorStore {
  function read(): Record<string, string> {
    const raw = storage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new DomainError('MALFORMED_JSON', `${key} is not an object`)
    }
    return parsed as Record<string, string>
  }
  return {
    get(collection) {
      return read()[collection]
    },
    set(collection, cursor) {
      const all = read()
      all[collection] = cursor
      storage.setItem(key, JSON.stringify(all))
    },
    clear() {
      storage.setItem(key, JSON.stringify({}))
    },
  }
}
