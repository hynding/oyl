import { describe, it, expect } from 'vitest'
import { createCatalogClient } from './catalog-client.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox, Mutation } from './write-outbox.js'
import type { ReadCache } from './read-cache.js'
import type { Codec } from '../collections.js'
import type { Id } from './id.js'

// ── Simple catalog domain type ───────────────────────────────────────────────

type Food = {
  id: Id
  name: string
}

const foodCodec: Codec<Food> = {
  toJSON: (f) => ({ id: f.id, name: f.name }),
  fromJSON: (shape) => {
    const s = shape as { id: string; name: string }
    return { id: s.id as Id, name: s.name }
  },
}

// ── Fake ApiClient ───────────────────────────────────────────────────────────

type FindCapture = { path: string; query: Record<string, string | number | boolean> | undefined }

function makeApi(rows: unknown[] = [], single?: unknown): ApiClient & { findCaptures: FindCapture[] } {
  const findCaptures: FindCapture[] = []
  return {
    findCaptures,
    find: async (path, query) => {
      findCaptures.push({ path, query })
      return { data: rows, meta: {} }
    },
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

function makeCache(): ReadCache {
  const store = new Map<string, unknown>()
  return {
    get: (key) => store.get(key),
    set: (key, value) => { store.set(key, value) },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createCatalogClient', () => {
  const path = 'foods'

  describe('search(q)', () => {
    it('calls api.find with the containsi filter and decodes results', async () => {
      const rows = [
        { id: 'id-1', name: 'Running shoes' },
        { id: 'id-2', name: 'Run tracker' },
      ]
      const api = makeApi(rows)
      const client = createCatalogClient({ path, codec: foodCodec, api, outbox: makeOutbox(), cache: makeCache() })
      const result = await client.search('run')
      expect(api.findCaptures[0]).toEqual({
        path,
        query: { 'filters[name][$containsi]': 'run' },
      })
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ id: 'id-1', name: 'Running shoes' })
    })

    it('returns an empty array when no results match', async () => {
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api: makeApi([]),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await client.search('zzz')
      expect(result).toEqual([])
    })
  })

  describe('list()', () => {
    it('returns all codec-decoded rows from api.find', async () => {
      const rows = [{ id: 'id-1', name: 'Apple' }, { id: 'id-2', name: 'Banana' }]
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api: makeApi(rows),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await client.list()
      expect(result).toHaveLength(2)
      expect(result[1]).toEqual({ id: 'id-2', name: 'Banana' })
    })
  })

  describe('get(id)', () => {
    it('returns a codec-decoded item when api.findOne returns data', async () => {
      const raw = { id: 'id-1', name: 'Apple' }
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api: makeApi([], raw),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await client.get('id-1' as Id)
      expect(result).toEqual({ id: 'id-1', name: 'Apple' })
    })

    it('returns undefined when api.findOne returns undefined', async () => {
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api: makeApi([], undefined),
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      const result = await client.get('missing' as Id)
      expect(result).toBeUndefined()
    })
  })

  describe('create(item)', () => {
    it('enqueues a catalog save mutation via the outbox', () => {
      const outbox = makeOutbox()
      const item: Food = { id: 'id-1' as Id, name: 'Apple' }
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api: makeApi(),
        outbox,
        cache: makeCache(),
      })
      client.create(item)
      expect(outbox.mutations).toHaveLength(1)
      expect(outbox.mutations[0]).toMatchObject({
        entity: path,
        op: 'save',
        payload: foodCodec.toJSON(item),
        baseUpdatedAt: null,
      })
    })

    it('does not call any api write method', () => {
      let apiWritten = false
      const api: ApiClient = {
        find: async () => ({ data: [], meta: {} }),
        findOne: async () => undefined,
        create: async () => { apiWritten = true; return {} },
        update: async () => { apiWritten = true; return {} },
        remove: async () => { apiWritten = true },
      }
      const client = createCatalogClient({
        path,
        codec: foodCodec,
        api,
        outbox: makeOutbox(),
        cache: makeCache(),
      })
      client.create({ id: 'id-1' as Id, name: 'Apple' })
      expect(apiWritten).toBe(false)
    })
  })
})
