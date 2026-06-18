import { describe, it, expect, beforeEach } from 'vitest'
import { createServerPersonalRepository } from './server-personal-repository.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox, Mutation } from './write-outbox.js'
import type { ReadCache } from './read-cache.js'
import type { Codec } from '../collections.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'

// ── Simple domain type for tests ────────────────────────────────────────────

type Widget = {
  id: Id
  name: string
  meta?: PersistedMeta
}

const widgetCodec: Codec<Widget> = {
  toJSON: (w) => ({ id: w.id, name: w.name }),
  fromJSON: (shape) => {
    const s = shape as { id: string; name: string }
    return { id: s.id as Id, name: s.name }
  },
}

// ── Fake ApiClient ───────────────────────────────────────────────────────────

function makeApi(rows: unknown[] = [], single?: unknown): ApiClient {
  return {
    find: async (_path, _query) => ({ data: rows, meta: {} }),
    findOne: async (_path, _id) => single,
    create: async (_path, data) => data,
    update: async (_path, _id, data) => data,
    remove: async (_path, _id) => {},
  }
}

// ── In-memory WriteOutbox ────────────────────────────────────────────────────

function makeOutbox(): WriteOutbox & { mutations: Mutation[] } {
  const mutations: Mutation[] = []
  let seq = 0
  return {
    mutations,
    enqueue(m) {
      const mutation: Mutation = {
        id: `m${++seq}`,
        enqueuedAt: new Date('2026-01-01').toISOString(),
        ...m,
      }
      mutations.push(mutation)
      return mutation
    },
    peekAll: () => mutations.slice(),
    ack: (id) => {
      const idx = mutations.findIndex((m) => m.id === id)
      if (idx !== -1) mutations.splice(idx, 1)
    },
    size: () => mutations.length,
  }
}

// ── In-memory ReadCache ──────────────────────────────────────────────────────

function makeCache(): ReadCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    get: (key) => store.get(key),
    set: (key, value) => { store.set(key, value) },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createServerPersonalRepository', () => {
  const path = 'widgets'

  describe('list()', () => {
    it('returns codec-decoded rows from api.find', async () => {
      const rows = [
        { id: 'id-1', name: 'Alpha' },
        { id: 'id-2', name: 'Beta' },
      ]
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(rows),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await repo.list()
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ id: 'id-1', name: 'Alpha' })
      expect(result[1]).toEqual({ id: 'id-2', name: 'Beta' })
    })

    it('caches the list under a stable key', async () => {
      const rows = [{ id: 'id-1', name: 'Alpha' }]
      const cache = makeCache()
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(rows),
        outbox: makeOutbox(),
        cache,
      })
      await repo.list()
      expect(cache.store.size).toBeGreaterThan(0)
    })

    it('returns an empty array when api.find returns no rows', async () => {
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi([]),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await repo.list()
      expect(result).toEqual([])
    })
  })

  describe('get(id)', () => {
    it('returns a codec-decoded item when api.findOne returns data', async () => {
      const raw = { id: 'id-1', name: 'Alpha' }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi([], raw),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await repo.get('id-1' as Id)
      expect(result).toEqual({ id: 'id-1', name: 'Alpha' })
    })

    it('returns undefined when api.findOne returns undefined', async () => {
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi([], undefined),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await repo.get('missing' as Id)
      expect(result).toBeUndefined()
    })
  })

  describe('save(item)', () => {
    it('enqueues a save mutation (optimistic) and returns the item', async () => {
      const outbox = makeOutbox()
      const item: Widget = { id: 'id-1' as Id, name: 'Alpha' }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      const returned = await repo.save(item)
      expect(returned).toBe(item)
      expect(outbox.mutations).toHaveLength(1)
      expect(outbox.mutations[0]).toMatchObject({
        entity: path,
        op: 'save',
        payload: widgetCodec.toJSON(item),
      })
    })

    it('does NOT call api.create or api.update (no network for writes)', async () => {
      const outbox = makeOutbox()
      let apiCalled = false
      const api: ApiClient = {
        find: async () => ({ data: [], meta: {} }),
        findOne: async () => undefined,
        create: async () => { apiCalled = true; return {} },
        update: async () => { apiCalled = true; return {} },
        remove: async () => { apiCalled = true },
      }
      const item: Widget = { id: 'id-1' as Id, name: 'Alpha' }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api,
        outbox,
        cache: makeCache(),
      })
      await repo.save(item)
      expect(apiCalled).toBe(false)
    })

    it('sets baseUpdatedAt from item meta.updatedAt when present', async () => {
      const outbox = makeOutbox()
      const updatedAt = new Date('2026-01-15T10:00:00Z')
      const item: Widget = {
        id: 'id-1' as Id,
        name: 'Alpha',
        meta: {
          createdAt: new Date('2026-01-01'),
          updatedAt,
          revision: 3,
        },
      }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      await repo.save(item)
      expect(outbox.mutations[0]?.baseUpdatedAt).toBe(updatedAt.toISOString())
    })

    it('sets baseUpdatedAt to null when item has no meta', async () => {
      const outbox = makeOutbox()
      const item: Widget = { id: 'id-1' as Id, name: 'Alpha' }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      await repo.save(item)
      expect(outbox.mutations[0]?.baseUpdatedAt).toBeNull()
    })
  })

  describe('saveMany(items)', () => {
    it('enqueues one save mutation per item and returns the items', async () => {
      const outbox = makeOutbox()
      const items: Widget[] = [
        { id: 'id-1' as Id, name: 'Alpha' },
        { id: 'id-2' as Id, name: 'Beta' },
      ]
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      const returned = await repo.saveMany(items)
      expect(returned).toEqual(items)
      expect(outbox.mutations).toHaveLength(2)
      expect(outbox.mutations[0]).toMatchObject({ op: 'save', entity: path })
      expect(outbox.mutations[1]).toMatchObject({ op: 'save', entity: path })
    })

    it('returns [] for empty input', async () => {
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await repo.saveMany([])
      expect(result).toEqual([])
    })
  })

  describe('delete(id)', () => {
    it('enqueues a delete mutation', async () => {
      const outbox = makeOutbox()
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      await repo.delete('id-1' as Id)
      expect(outbox.mutations).toHaveLength(1)
      expect(outbox.mutations[0]).toMatchObject({
        entity: path,
        op: 'delete',
      })
    })

    it('does not call api.remove', async () => {
      let removeCalled = false
      const api: ApiClient = {
        find: async () => ({ data: [], meta: {} }),
        findOne: async () => undefined,
        create: async () => ({}),
        update: async () => ({}),
        remove: async () => { removeCalled = true },
      }
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api,
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      await repo.delete('id-1' as Id)
      expect(removeCalled).toBe(false)
    })
  })

  describe('purge(id)', () => {
    it('enqueues a delete mutation for the given id', async () => {
      const outbox = makeOutbox()
      const repo = createServerPersonalRepository({
        path,
        codec: widgetCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      await repo.purge('id-1' as Id)
      expect(outbox.mutations).toHaveLength(1)
      expect(outbox.mutations[0]).toMatchObject({
        entity: path,
        op: 'delete',
      })
    })
  })
})
