import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, type StorageLike } from './local-storage-repository.js'
import { LifeArea } from './life-area.js'
import { Id } from './id.js'

/** Minimal in-memory StorageLike for tests. */
function fakeStorage(): StorageLike & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    dump: () => Object.fromEntries(map),
  }
}

function deterministicClock(): () => Date {
  let tick = 0
  return () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
}

const codec = { toJSON: (a: LifeArea) => a.toJSON(), fromJSON: LifeArea.fromJSON }

function makeRepo() {
  return new LocalStorageRepository<LifeArea>(fakeStorage(), 'oyl/data/test', codec, deterministicClock())
}

// ── Repository behavioral contract ──────────────────────────────────────────
describe('LocalStorageRepository (repository contract)', () => {
  it('stamps fresh meta on first save and returns the item', async () => {
    const repo = makeRepo()
    const saved = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    expect(saved.meta?.revision).toBe(1)
    expect(saved.meta?.createdAt).toBeInstanceOf(Date)
    expect(saved.meta?.deletedAt).toBeUndefined()
  })

  it('bumps revision and updatedAt on subsequent saves', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const again = await repo.save(area)
    expect(again.meta?.revision).toBe(2)
    expect(again.meta!.updatedAt.getTime()).toBeGreaterThan(again.meta!.createdAt.getTime())
  })

  it('rejects stale revisions with REVISION_CONFLICT', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const stale = LifeArea.fromJSON(area.toJSON())
    await repo.save(area)
    await expect(repo.save(stale)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })

  it('rejects a fresh (meta-less) save colliding with an existing record', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const ghost = new LifeArea({ id: area.id, name: 'Health 2', slug: 'health' })
    await expect(repo.save(ghost)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })

  it('save with foreign meta for an unknown id is a create with fresh meta', async () => {
    const repo = makeRepo()
    const imported = LifeArea.fromJSON({
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Health',
      slug: 'health',
      meta: { createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', revision: 99 },
    })
    const saved = await repo.save(imported)
    expect(saved.meta?.revision).toBe(1)
    expect(saved.meta!.createdAt.getUTCFullYear()).toBe(2026)
  })

  it('soft delete: get returns undefined, list excludes unless asked; idempotent', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    await repo.delete(area.id)
    await repo.delete(area.id)
    expect(await repo.get(area.id)).toBeUndefined()
    expect(await repo.list()).toHaveLength(0)
    const includingDeleted = await repo.list({ includeDeleted: true })
    expect(includingDeleted).toHaveLength(1)
    expect(includingDeleted[0]?.meta?.deletedAt).toBeInstanceOf(Date)
  })

  it('purge removes entirely; idempotent; save after purge recreates', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    await repo.purge(area.id)
    await repo.purge(area.id)
    expect(await repo.list({ includeDeleted: true })).toHaveLength(0)
    const recreated = await repo.save(area)
    expect(recreated.meta?.revision).toBe(1)
  })

  it('get of unknown id is undefined', async () => {
    const repo = makeRepo()
    expect(await repo.get(Id.create())).toBeUndefined()
  })

  it('saveMany stamps fresh meta on all items and persists them', async () => {
    const repo = makeRepo()
    const saved = await repo.saveMany([
      new LifeArea({ name: 'A', slug: 'a' }),
      new LifeArea({ name: 'B', slug: 'b' }),
    ])
    expect(saved).toHaveLength(2)
    expect(saved[0]?.meta?.revision).toBe(1)
    expect(saved[1]?.meta?.revision).toBe(1)
    expect(await repo.list()).toHaveLength(2)
  })

  it('saveMany([]) is a no-op returning []', async () => {
    expect(await makeRepo().saveMany([])).toEqual([])
  })

  it('saveMany handles a mixed create + update batch', async () => {
    const repo = makeRepo()
    const a = await repo.save(new LifeArea({ name: 'A', slug: 'a' })) // revision 1
    const b = new LifeArea({ name: 'B', slug: 'b' }) // new
    const [ua, ub] = await repo.saveMany([a, b])
    expect(ua?.meta?.revision).toBe(2)
    expect(ub?.meta?.revision).toBe(1)
    expect(await repo.list()).toHaveLength(2)
  })

  it('saveMany is atomic: a stale item rejects and persists none of the batch', async () => {
    const repo = makeRepo()
    const a = await repo.save(new LifeArea({ name: 'A', slug: 'a' })) // revision 1
    const stale = LifeArea.fromJSON(a.toJSON()) // snapshot at revision 1
    await repo.save(a) // store now at revision 2; `stale` is behind
    const fresh = new LifeArea({ name: 'C', slug: 'c' }) // new — must NOT leak
    await expect(repo.saveMany([fresh, stale])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    const all = await repo.list()
    expect(all).toHaveLength(1) // only the original A
    expect(all.find((x) => x.slug === 'c')).toBeUndefined() // fresh staged but not committed
  })
})

// ── Adapter-specific traits ──────────────────────────────────────────────────
describe('LocalStorageRepository (adapter specifics)', () => {
  it('persists toJSON shapes under the given key and survives a fresh instance', async () => {
    const storage = fakeStorage()
    const repoA = new LocalStorageRepository<LifeArea>(storage, 'oyl/data/areas', codec, deterministicClock())
    const saved = await repoA.save(new LifeArea({ name: 'Health', slug: 'health' }))

    expect(JSON.parse(storage.dump()['oyl/data/areas']!)).toEqual([
      expect.objectContaining({ id: saved.id, name: 'Health', slug: 'health' }),
    ])

    const repoB = new LocalStorageRepository<LifeArea>(storage, 'oyl/data/areas', codec, deterministicClock())
    const reread = await repoB.get(saved.id)
    expect(reread?.name).toBe('Health')
    expect(reread?.meta?.revision).toBe(1)
  })

  it('does NOT alias the caller object (clones via serialization)', async () => {
    const repo = new LocalStorageRepository<LifeArea>(fakeStorage(), 'oyl/data/areas', codec, deterministicClock())
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    const saved = await repo.save(area)
    expect(saved).not.toBe(area)
    expect(area.meta).toBeUndefined()
  })
})
