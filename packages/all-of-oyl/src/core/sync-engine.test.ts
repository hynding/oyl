import { describe, it, expect } from 'vitest'
import { createSyncEngine } from './sync-engine.js'
import { createCacheStore } from './cache-store.js'
import { createOutbox } from './outbox.js'
import { manualConnectivity } from './connectivity.js'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike { const store: Record<string, string> = {}; return { getItem: (k) => store[k] ?? null, setItem: (k, val) => { store[k] = val } } }
const codec = COLLECTIONS.lifeAreas as any
const now = () => new Date('2026-06-15T12:00:00Z')

function setup(online = true) {
  const storage = mem()
  const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
  const remote = new InMemoryRepository<LifeArea>(now)
  const outbox = createOutbox(storage, 'oyl/outbox', now)
  const conn = manualConnectivity(online)
  const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: conn, now })
  return { engine, cache, remote, outbox, conn, repo: engine.repositories.lifeAreas! }
}
const area = (name = 'Health', slug = 'health') => new LifeArea({ name, slug })

describe('createSyncEngine', () => {
  it('offline save writes the cache + outbox, not the remote', async () => {
    const { repo, cache, remote, outbox } = setup(false)
    const a = area()
    await repo.save(a)
    expect((await cache.getRaw(a.id))?.id).toBe(a.id)
    expect(outbox.has('lifeAreas', a.id)).toBe(true)
    expect(await remote.get(a.id)).toBeUndefined()
  })

  it('flush pushes to the remote, drains the outbox, advances the base revision (data unchanged)', async () => {
    const { repo, cache, remote, outbox, engine } = setup(true)
    const a = area()
    await repo.save(a)
    await engine.flush()
    expect((await remote.get(a.id))?.id).toBe(a.id)
    expect(outbox.size()).toBe(0)
    expect((await cache.getRaw(a.id))?.meta?.revision).toBe((await remote.get(a.id))?.meta?.revision)
  })

  it('edit-after-flush does not 409 (base read from cache)', async () => {
    const { repo, remote, engine, cache, outbox } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    const local = (await cache.get(a.id))!
    await repo.save(local)
    await engine.flush()
    expect(engine.syncState.get().status).toBe('idle')
    expect(outbox.size()).toBe(0)
    expect((await remote.get(a.id))?.meta?.revision).toBeGreaterThan(1)
  })

  it('concurrent backend edit → 409 → client-wins', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    const onServer = (await remote.get(a.id))!
    await remote.save(onServer)
    const local = (await cache.get(a.id))!
    await repo.save(local)
    await engine.flush()
    expect((await remote.get(a.id))?.id).toBe(a.id)
    expect(engine.syncState.get().status).toBe('idle')
  })

  it('pull brings a remote-only record into the cache and skips pending ids', async () => {
    const { repo, cache, remote, engine } = setup(true)
    const remoteOnly = area('Money', 'money')
    await remote.save(remoteOnly)
    const pending = area('Mind', 'mind')
    await repo.save(pending)
    await engine.pull()
    expect((await cache.getRaw(remoteOnly.id))?.id).toBe(remoteOnly.id)
    expect((await cache.getRaw(pending.id))?.id).toBe(pending.id)
  })

  it('reconnect triggers flush; syncState pending → 0', async () => {
    const { repo, conn, engine, remote } = setup(false)
    await engine.start()
    const a = area()
    await repo.save(a)
    expect(engine.syncState.get().pending).toBe(1)
    conn.setOnline(true)
    await Promise.resolve(); await Promise.resolve()
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()
    expect(engine.syncState.get().pending).toBe(0)
  })
})
