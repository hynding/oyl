import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { Id } from './id.js'

function makeRepo() {
  let tick = 0
  const clock = () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
  return new InMemoryRepository<LifeArea>(clock)
}

describe('InMemoryRepository', () => {
  it('stamps fresh meta on first save and returns the item', async () => {
    const repo = makeRepo()
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    expect(area.meta).toBeUndefined()
    const saved = await repo.save(area)
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
    const stale = LifeArea.fromJSON(area.toJSON()) // snapshot at revision 1
    await repo.save(area) // now revision 2
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
    await repo.delete(area.id) // no-op
    expect(await repo.get(area.id)).toBeUndefined()
    expect(await repo.list()).toHaveLength(0)
    const includingDeleted = await repo.list({ includeDeleted: true })
    expect(includingDeleted).toHaveLength(1)
    expect(includingDeleted[0]?.meta?.deletedAt).toBeInstanceOf(Date)
    const meta = includingDeleted[0]?.meta
    expect(meta?.updatedAt.getTime()).toBe(meta?.deletedAt?.getTime())
  })

  it('purge removes entirely; idempotent; save after purge recreates', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    await repo.purge(area.id)
    await repo.purge(area.id) // no-op
    expect(await repo.list({ includeDeleted: true })).toHaveLength(0)
    const recreated = await repo.save(area)
    expect(recreated.meta?.revision).toBe(1)
  })

  it('get of unknown id is undefined', async () => {
    const repo = makeRepo()
    expect(await repo.get(Id.create())).toBeUndefined()
  })
})
