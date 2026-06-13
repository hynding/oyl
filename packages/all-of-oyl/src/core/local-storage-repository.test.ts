import { describe, expect, it } from 'vitest'
import { LocalStorageRepository, type StorageLike } from './local-storage-repository.js'
import { LifeArea } from './life-area.js'
import { repositoryContract } from './repository-contract.js'

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

repositoryContract(
  'LocalStorageRepository',
  () => new LocalStorageRepository<LifeArea>(fakeStorage(), 'oyl/data/test', codec, deterministicClock()),
)

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
