import { describe, it, expect, beforeEach } from 'vitest'
import { createCursorStore } from './cursor-store.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike { let v: string | null = null; return { getItem: () => v, setItem: (_k, val) => { v = val } } }

describe('createCursorStore', () => {
  let storage: StorageLike
  beforeEach(() => { storage = mem() })

  it('get/set per collection, persists across instances, and clear drops all', () => {
    const c = createCursorStore(storage, 'oyl/sync-cursors')
    expect(c.get('entries')).toBeUndefined()
    c.set('entries', '2026-01-01T00:00:00.000Z')
    c.set('plans', '2026-02-01T00:00:00.000Z')
    expect(c.get('entries')).toBe('2026-01-01T00:00:00.000Z')
    const c2 = createCursorStore(storage, 'oyl/sync-cursors')
    expect(c2.get('plans')).toBe('2026-02-01T00:00:00.000Z')
    c2.clear()
    expect(createCursorStore(storage, 'oyl/sync-cursors').get('entries')).toBeUndefined()
  })
})
