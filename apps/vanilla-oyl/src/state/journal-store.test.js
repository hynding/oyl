import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Note, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from './journal-store.js'
import { effect } from '../lib/reactive/effect.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */

const TZ = 'America/New_York'
const ISO = '2026-06-10T16:00:00Z' // 12:00 EDT → June 10 in TZ
const dayOf = () => DayKey.from(new Date(ISO), TZ)
const aNote = (text = 'hello') => new Note({ occurredAt: new Date(ISO), text })

describe('createJournalStore', () => {
  it('add persists to the repo, reflects in entriesOn, and bumps revision', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const before = store.revision.get()
    const saved = await store.add(aNote())
    expect(saved.meta?.revision).toBe(1)
    expect(store.entriesOn(dayOf())).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('persist-first: a failing save leaves the Journal untouched and rethrows', async () => {
    const repo = {
      save: async () => { throw new Error('quota') },
      delete: async () => {},
      list: async () => [],
      get: async () => undefined,
      purge: async () => {},
    }
    const store = createJournalStore(/** @type {any} */ (repo), TZ)
    await expect(store.add(aNote())).rejects.toThrow('quota')
    expect(store.entriesOn(dayOf())).toHaveLength(0)
  })

  it('remove deletes from the repo and the aggregate', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const saved = await store.add(aNote())
    await store.remove(saved.id)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    expect(await repo.list()).toHaveLength(0)
  })

  it('hydrate rebuilds the aggregate from the repo', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    await repo.save(aNote('one'))
    await repo.save(new Note({ occurredAt: new Date(ISO), text: 'two' }))
    const store = createJournalStore(repo, TZ)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    await store.hydrate()
    expect(store.entriesOn(dayOf())).toHaveLength(2)
  })

  it('an effect reading entriesOn re-runs when a mutation bumps revision', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const seen = /** @type {number[]} */ ([])
    effect(() => seen.push(store.entriesOn(dayOf()).length))
    await store.add(aNote())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })
})
