import { describe, it, expect } from 'vitest'
import { createReadCache } from './read-cache.js'

/** Minimal in-memory StorageLike for testing. */
function makeStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v) },
  }
}

describe('createReadCache', () => {
  describe('basic get/set', () => {
    it('returns undefined for an unknown key', () => {
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 60_000, now: () => 1000 })
      expect(cache.get('missing')).toBeUndefined()
    })

    it('returns the value after set', () => {
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 60_000, now: () => 1000 })
      cache.set('key1', { name: 'Alice' })
      expect(cache.get('key1')).toEqual({ name: 'Alice' })
    })

    it('overwrites an existing key', () => {
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 60_000, now: () => 1000 })
      cache.set('key1', 'first')
      cache.set('key1', 'second')
      expect(cache.get('key1')).toBe('second')
    })
  })

  describe('TTL expiry', () => {
    it('returns value before TTL expires', () => {
      let now = 0
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 5_000, now: () => now })
      now = 1000
      cache.set('key1', 'val')
      now = 5999 // 4999 ms elapsed — within 5 s TTL
      expect(cache.get('key1')).toBe('val')
    })

    it('returns undefined after TTL expires', () => {
      let now = 0
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 5_000, now: () => now })
      now = 1000
      cache.set('key1', 'val')
      now = 6001 // 5001 ms elapsed — past TTL
      expect(cache.get('key1')).toBeUndefined()
    })

    it('exactly at expiry boundary is expired', () => {
      let now = 0
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 10, ttlMs: 5_000, now: () => now })
      now = 1000
      cache.set('key1', 'val')
      now = 6000 // exactly expiresAt
      expect(cache.get('key1')).toBeUndefined()
    })
  })

  describe('LRU eviction', () => {
    it('evicts the least-recently-used entry when maxEntries is exceeded', () => {
      let now = 1000
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 3, ttlMs: 60_000, now: () => now })
      cache.set('a', 1)
      now++
      cache.set('b', 2)
      now++
      cache.set('c', 3)
      // 'a' is LRU. Adding 'd' should evict 'a'.
      now++
      cache.set('d', 4)
      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })

    it('get promotes a key so it is not the LRU candidate', () => {
      let now = 1000
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 3, ttlMs: 60_000, now: () => now })
      cache.set('a', 1)
      now++
      cache.set('b', 2)
      now++
      cache.set('c', 3)
      // Read 'a' to promote it — now 'b' is LRU.
      now++
      cache.get('a')
      now++
      cache.set('d', 4) // should evict 'b'
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('a')).toBe(1)
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })

    it('set on an existing key promotes it and does not grow the count', () => {
      let now = 1000
      const cache = createReadCache(makeStorage(), 'rc:', { maxEntries: 3, ttlMs: 60_000, now: () => now })
      cache.set('a', 1)
      now++
      cache.set('b', 2)
      now++
      cache.set('c', 3)
      // Re-set 'a' — promotes it, still 3 entries.
      now++
      cache.set('a', 99)
      now++
      cache.set('d', 4) // should evict 'b' (now LRU)
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('a')).toBe(99)
      expect(cache.get('c')).toBe(3)
      expect(cache.get('d')).toBe(4)
    })
  })

  describe('persistence', () => {
    it('persists values into storage under the given prefix', () => {
      const storage = makeStorage()
      const cache = createReadCache(storage, 'rc:', { maxEntries: 10, ttlMs: 60_000, now: () => 1000 })
      cache.set('key1', { x: 1 })
      // The storage should have an entry prefixed with 'rc:'
      const keys = Array.from(storage.store.keys())
      expect(keys.some((k) => k.startsWith('rc:'))).toBe(true)
    })

    it('reads persisted values from storage on get (cross-instance survival)', () => {
      const storage = makeStorage()
      const now = () => 1000
      const cache1 = createReadCache(storage, 'rc:', { maxEntries: 10, ttlMs: 60_000, now })
      cache1.set('key1', { x: 42 })
      // New instance reading the same storage
      const cache2 = createReadCache(storage, 'rc:', { maxEntries: 10, ttlMs: 60_000, now })
      expect(cache2.get('key1')).toEqual({ x: 42 })
    })
  })
})
