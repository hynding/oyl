import type { StorageLike } from './local-storage-repository.js'

/** Bounded recent-reads cache with TTL expiry and LRU eviction. */
export interface ReadCache {
  get(key: string): unknown | undefined
  set(key: string, value: unknown): void
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

/**
 * Creates a bounded LRU cache backed by `StorageLike`.
 *
 * - Each entry is stored at `${prefix}${key}` as JSON `{ value, expiresAt }`.
 * - Eviction order is tracked in-memory (insertion/access order → LRU = front).
 * - On `get`: expired entries are treated as missing (returns undefined).
 * - On `set`: if at capacity, the LRU entry is evicted before inserting the new one.
 */
export function createReadCache(
  storage: StorageLike,
  prefix: string,
  opts: { maxEntries: number; ttlMs: number; now: () => number },
): ReadCache {
  // In-memory LRU order: index 0 = least-recently-used, last = most-recently-used.
  // Populated lazily on first use — we don't enumerate storage keys up-front
  // because StorageLike doesn't expose iteration.
  const lruOrder: string[] = []

  function storageKey(key: string): string {
    return `${prefix}${key}`
  }

  function readEntry(key: string): CacheEntry | undefined {
    const raw = storage.getItem(storageKey(key))
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as CacheEntry
    } catch {
      return undefined
    }
  }

  function writeEntry(key: string, entry: CacheEntry): void {
    storage.setItem(storageKey(key), JSON.stringify(entry))
  }

  function promote(key: string): void {
    const idx = lruOrder.indexOf(key)
    if (idx !== -1) lruOrder.splice(idx, 1)
    lruOrder.push(key)
  }

  return {
    get(key: string): unknown | undefined {
      const entry = readEntry(key)
      if (!entry) return undefined
      if (opts.now() >= entry.expiresAt) return undefined
      promote(key)
      return entry.value
    },

    set(key: string, value: unknown): void {
      const isNew = lruOrder.indexOf(key) === -1 && storage.getItem(storageKey(key)) === null
      // Evict LRU if we're at capacity and this is a brand-new key.
      if (isNew && lruOrder.length >= opts.maxEntries) {
        const lruKey = lruOrder.shift()!
        // We can't delete from StorageLike, so we write an already-expired entry.
        writeEntry(lruKey, { value: null, expiresAt: 0 })
      }
      const entry: CacheEntry = { value, expiresAt: opts.now() + opts.ttlMs }
      writeEntry(key, entry)
      promote(key)
    },
  }
}
