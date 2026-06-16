import { describe, it, expect } from 'vitest'
import { createSyncEngine } from './sync-engine.js'
import { createCacheStore } from './cache-store.js'
import { createOutbox } from './outbox.js'
import { manualConnectivity } from './connectivity.js'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'
import type { StorageLike } from './local-storage-repository.js'
import { DomainError } from './domain-error.js'
import { createCursorStore } from './cursor-store.js'
import { HttpRepositoryError } from './http-repository.js'

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

/** Wraps a remote so every save throws REVISION_CONFLICT — a perpetually-racing writer. */
function alwaysConflictRemote(inner: any) {
  return {
    get: (id: any) => inner.get(id),
    list: (opts: any) => inner.list(opts),
    save: async () => { throw new DomainError('REVISION_CONFLICT', 'forced') },
    delete: (id: any) => inner.delete(id),
    purge: (id: any) => inner.purge(id),
    saveMany: (items: any) => inner.saveMany(items),
  }
}

/** Build an engine with an explicit conflict policy (one 'lifeAreas' collection). */
function setupPolicy(policy: 'client-wins' | 'server-wins', remoteOverride?: any) {
  const storage = mem()
  const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
  const remote = remoteOverride ?? new InMemoryRepository(now)
  const outbox = createOutbox(storage, 'oyl/outbox', now)
  const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: manualConnectivity(true), now, conflictPolicy: policy })
  return { engine, cache, remote, outbox, repo: engine.repositories.lifeAreas! }
}

describe('createSyncEngine — conflict policy', () => {
  it('client-wins (default): conflict resolves with client data and records the conflict once', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.save((await remote.get(a.id))!) // another device bumps the server (rev 2)
    await repo.save((await cache.get(a.id))!)     // local edit (cache base still rev 1)
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()    // live, client data won
    expect(engine.syncState.get().conflicts).toBe(1)
    expect(engine.syncState.get().lastConflict?.id).toBe(String(a.id))
    expect(engine.syncState.get().status).toBe('idle')
  })

  it('client-wins over a server tombstone: resurrects with client data (fixes SP5a bug)', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.delete(a.id)                       // another device deleted it (tombstone, rev bumped)
    await repo.save((await cache.get(a.id))!)       // still live locally -> edit
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()     // resurrected (live again) with client data
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('server-wins: adopts the server record, drops the op, records the conflict', async () => {
    const { repo, remote, engine, cache, outbox } = setupPolicy('server-wins')
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.save((await remote.get(a.id))!)    // server rev 2 (the winner)
    await repo.save((await cache.get(a.id))!)
    await engine.flush()
    expect((await cache.getRaw(a.id))?.meta?.revision).toBe((await remote.get(a.id))?.meta?.revision)
    expect(outbox.size()).toBe(0)
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('server-wins over a server tombstone: the record is removed locally', async () => {
    const { repo, remote, engine, cache } = setupPolicy('server-wins')
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.delete(a.id)
    await repo.save((await cache.get(a.id))!)
    await engine.flush()
    expect(await cache.get(a.id)).toBeUndefined()   // server deletion won (tombstone adopted -> hidden)
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('bounded retry: a perpetual conflict leaves the op queued (not a hard error, not counted)', async () => {
    const { repo, engine, outbox } = setupPolicy('client-wins', alwaysConflictRemote(new InMemoryRepository(now)))
    await repo.save(area())
    await engine.flush()
    expect(outbox.size()).toBe(1)                   // op preserved for a later retry
    expect(engine.syncState.get().status).not.toBe('error')
    expect(engine.syncState.get().conflicts).toBe(0) // unresolved -> not counted
  })

  it('no conflict: conflicts stays 0', async () => {
    const { repo, engine } = setup(true)
    await repo.save(area()); await engine.flush()
    expect(engine.syncState.get().conflicts).toBe(0)
  })
})

/** A remote that records the `since` it was called with and filters by it. */
function recordingRemote(inner: any) {
  const sinceCalls: (string | undefined)[] = []
  return {
    sinceCalls,
    get: (id: any) => inner.get(id),
    save: (item: any) => inner.save(item),
    delete: (id: any) => inner.delete(id),
    purge: (id: any) => inner.purge(id),
    saveMany: (items: any) => inner.saveMany(items),
    async list(opts: any) {
      sinceCalls.push(opts?.since)
      const all = (await inner.list({ includeDeleted: true })) as any[]
      return opts?.since ? all.filter((r) => r.meta?.updatedAt?.toISOString() >= opts.since) : all
    },
  }
}

describe('createSyncEngine — delta pull', () => {
  it('first pull full + sets cursor; later pulls send since=cursor; resync forces full', async () => {
    let t = Date.parse('2026-06-15T12:00:00.000Z')
    const clock = () => new Date(t)
    const storage = mem()
    const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
    const inner = new InMemoryRepository(clock)
    const remote = recordingRemote(inner)
    const outbox = createOutbox(storage, 'oyl/outbox', clock)
    const cursors = createCursorStore(storage, 'oyl/sync-cursors')
    const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: manualConnectivity(true), now: clock, cursors })

    await inner.save(area('A', 'a'))      // a "server" record at 12:00:00
    await engine.pull()
    expect(remote.sinceCalls[0]).toBeUndefined()
    expect((await cache.list()).length).toBe(1)

    t = Date.parse('2026-06-15T12:00:05.000Z')
    await inner.save(area('B', 'b'))      // newer server record
    await engine.pull()
    expect(remote.sinceCalls[1]).toBe('2026-06-15T12:00:00.000Z') // since = cursor from pull 1
    expect((await cache.list()).length).toBe(2)

    await engine.resync()
    expect(remote.sinceCalls[2]).toBeUndefined() // cursor cleared → full pull
  })
})

describe('createSyncEngine — pulledAt', () => {
  it('pull() sets pulledAt; flush() does not', async () => {
    const { repo, engine } = setup(true)
    await repo.save(area())
    await engine.flush()
    expect(engine.syncState.get().pulledAt).toBeUndefined() // flush-only: no pulledAt
    await engine.pull()
    expect(engine.syncState.get().pulledAt).toBeInstanceOf(Date)
  })
})

/** A serializing in-process mutex — mirrors navigator.locks per-origin across "tabs". */
function memLock() {
  /** @type {Promise<any>} */
  let chain = Promise.resolve()
  /** @type {string[]} */
  const calls: string[] = []
  return { calls, runExclusive: (name: string, fn: () => Promise<void>) => { calls.push(name); const p = chain.then(() => fn()); chain = p.catch(() => {}); return p } }
}
/** Wrap a remote to count save() calls. */
function counting(inner: any) {
  let saves = 0
  return { get: (id: any) => inner.get(id), list: (o: any) => inner.list(o), save: (x: any) => { saves++; return inner.save(x) }, delete: (id: any) => inner.delete(id), purge: (id: any) => inner.purge(id), saveMany: (i: any) => inner.saveMany(i), get saves() { return saves } }
}

describe('createSyncEngine — flush lock', () => {
  it('runs flush through lock.runExclusive(oyl-flush) when a lock is given', async () => {
    const storage = mem()
    const lock = memLock()
    const remote = new InMemoryRepository(now)
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now, lock })
    const a = area()
    await engine.repositories.lifeAreas!.save(a)
    await engine.flush()
    expect(lock.calls).toContain('oyl-flush')
    expect(await remote.get(a.id)).toBeTruthy()
  })

  it('serializes two engines on a shared outbox — each record pushed once (no double-flush)', async () => {
    const storage = mem()
    const lock = memLock()
    const remote = counting(new InMemoryRepository(now))
    const mk = () => createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now, lock })
    const A = mk(); const B = mk()
    await A.repositories.lifeAreas!.save(area()) // enqueues to the SHARED outbox (+ auto-triggers A.flush)
    await Promise.all([A.flush(), B.flush()])
    expect(remote.saves).toBe(1)
  })
})

/** A remote that throws a 413 for ids in `poison`, else delegates to `inner`. */
function flakyRemote(inner: any) {
  const poison = new Set<string>()
  return {
    poison,
    get: (id: any) => inner.get(id), list: (o: any) => inner.list(o), delete: (id: any) => inner.delete(id), purge: (id: any) => inner.purge(id), saveMany: (i: any) => inner.saveMany(i),
    save: async (x: any) => { if (poison.has(x.id)) throw new HttpRepositoryError('server', 'server error (413)', 413); return inner.save(x) },
  }
}

describe('createSyncEngine — poison quarantine', () => {
  function setupFlaky() {
    const storage = mem()
    const inner = new InMemoryRepository(now)
    const remote = flakyRemote(inner)
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote: remote as any } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now })
    return { engine, inner, remote, repo: engine.repositories.lifeAreas! }
  }

  it('quarantines a poison op + flushes the rest; failed=1, pending=0; terminates', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p'); const G = area('G', 'g')
    remote.poison.add(P.id)
    await repo.save(P); await repo.save(G)
    await engine.flush()
    expect(await inner.get(G.id)).toBeTruthy()
    expect(await inner.get(P.id)).toBeUndefined()
    expect(engine.syncState.get().failed).toBe(1)
    expect(engine.syncState.get().pending).toBe(0)
    expect(engine.syncState.get().lastFailedError).toContain('413')
  })

  it('retryFailed re-attempts (now succeeds) → failed=0, on remote', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p')
    remote.poison.add(P.id)
    await repo.save(P); await engine.flush()
    expect(engine.syncState.get().failed).toBe(1)
    remote.poison.delete(P.id)
    await engine.retryFailed()
    expect(engine.syncState.get().failed).toBe(0)
    expect(engine.syncState.get().lastFailedError).toBeUndefined() // stale error cleared on recovery
    expect(await inner.get(P.id)).toBeTruthy()
  })

  it('discardFailed drops the op (failed=0, never pushed)', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p')
    remote.poison.add(P.id)
    await repo.save(P); await engine.flush()
    engine.discardFailed()
    expect(engine.syncState.get().failed).toBe(0)
    expect(await inner.get(P.id)).toBeUndefined()
  })

  it('a plain Error is quarantined (not infinite, not halting)', async () => {
    const storage = mem(); const inner = new InMemoryRepository(now)
    const remote: any = { get: (id: any) => inner.get(id), list: (o: any) => inner.list(o), delete: (id: any) => inner.delete(id), purge: (id: any) => inner.purge(id), saveMany: (i: any) => inner.saveMany(i), save: async () => { throw new Error('boom') } }
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now })
    await engine.repositories.lifeAreas!.save(area('X', 'x'))
    await engine.flush()
    expect(engine.syncState.get().failed).toBe(1)
  })
})
