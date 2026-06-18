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

/** Serialised shape: array of [cacheKey, entry] pairs, MRU last. */
type CacheMap = Array<[string, CacheEntry]>

/**
 * Creates a bounded LRU cache backed by `StorageLike`.
 *
 * ALL entries are stored under a **single** storage key (`${prefix}`) as a JSON
 * array of `[cacheKey, { value, expiresAt }]` pairs ordered MRU-last.
 * This keeps storage strictly bounded: one key, ≤ maxEntries live entries.
 *
 * - On `get`: missing or expired → undefined; live hit → promote to MRU, write back.
 * - On `set`: upsert entry with `expiresAt = now() + ttlMs`; promote to MRU;
 *   if size > maxEntries, drop the LRU (index 0) entry; write back.
 */
export function createReadCache(
  storage: StorageLike,
  prefix: string,
  opts: { maxEntries: number; ttlMs: number; now: () => number },
): ReadCache {
  const storageKey = prefix

  function read(): CacheMap {
    const raw = storage.getItem(storageKey)
    if (!raw) return []
    try {
      return JSON.parse(raw) as CacheMap
    } catch {
      return []
    }
  }

  function write(map: CacheMap): void {
    storage.setItem(storageKey, JSON.stringify(map))
  }

  return {
    get(key: string): unknown | undefined {
      const map = read()
      const idx = map.findIndex(([k]) => k === key)
      if (idx === -1) return undefined
      const pair = map[idx]
      if (!pair) return undefined
      const entry = pair[1]
      if (opts.now() >= entry.expiresAt) return undefined
      // Promote to MRU (move to end).
      map.splice(idx, 1)
      map.push([key, entry])
      write(map)
      return entry.value
    },

    set(key: string, value: unknown): void {
      const map = read()
      const idx = map.findIndex(([k]) => k === key)
      if (idx !== -1) map.splice(idx, 1)
      const entry: CacheEntry = { value, expiresAt: opts.now() + opts.ttlMs }
      map.push([key, entry])
      // Evict LRU (index 0) entries until within capacity.
      while (map.length > opts.maxEntries) {
        map.shift()
      }
      write(map)
    },
  }
}
