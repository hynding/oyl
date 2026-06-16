import { describe, it, expect, beforeEach } from 'vitest'
import { createCacheStore } from './cache-store.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike & { dump(): string | null } {
  let v: string | null = null
  return { getItem: () => v, setItem: (_k, val) => { v = val }, dump: () => v }
}
const codec = COLLECTIONS.lifeAreas as any

function area(rev: number, deleted = false) {
  const a = new LifeArea({ name: 'Health', slug: 'health' })
  a.meta = { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), revision: rev, ...(deleted ? { deletedAt: new Date('2026-01-03') } : {}) }
  return a
}

describe('createCacheStore', () => {
  let storage: ReturnType<typeof mem>
  beforeEach(() => { storage = mem() })

  it('putRaw preserves revision and meta exactly (no bump)', async () => {
    const c = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
    const a = area(7)
    await c.putRaw(a)
    const got = await c.getRaw(a.id)
    expect(got?.meta?.revision).toBe(7)
    expect(got?.meta?.createdAt.toISOString()).toBe(new Date('2026-01-01').toISOString())
    a.meta = { ...a.meta!, revision: 9 }
    await c.putRaw(a)
    expect((await c.getRaw(a.id))?.meta?.revision).toBe(9)
  })

  it('get hides tombstones; getRaw includes them; list filters', async () => {
    const c = createCacheStore(storage, 'k', codec)
    const live = area(1)
    const dead = area(2, true)
    await c.putRaw(live)
    await c.putRaw(dead)
    expect(await c.get(dead.id)).toBeUndefined()
    expect(await c.getRaw(dead.id)).toBeTruthy()
    expect((await c.list()).map((i) => i.id)).toEqual([live.id])
    expect((await c.list({ includeDeleted: true })).length).toBe(2)
  })

  it('removeRaw hard-removes', async () => {
    const c = createCacheStore(storage, 'k', codec)
    const a = area(1)
    await c.putRaw(a)
    await c.removeRaw(a.id)
    expect(await c.getRaw(a.id)).toBeUndefined()
  })

  it('persists via storage (a fresh instance over the same key sees the data)', async () => {
    const a = area(3)
    await createCacheStore(storage, 'k', codec).putRaw(a)
    const c2 = createCacheStore(storage, 'k', codec)
    expect((await c2.getRaw(a.id))?.meta?.revision).toBe(3)
  })
})
