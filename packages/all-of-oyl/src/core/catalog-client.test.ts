import { describe, it, expect } from 'vitest'
import { createCatalogClient } from './catalog-client.js'
import type { ApiClient } from './api-client.js'
import type { WriteOutbox, Mutation } from './write-outbox.js'
import type { Codec } from '../collections.js'
import type { Id } from './id.js'
import { Activity } from '../index.js'

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
      const client = createCatalogClient({ path, codec: foodCodec, api, outbox: makeOutbox() })
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
      })
      client.create({ id: 'id-1' as Id, name: 'Apple' })
      expect(apiWritten).toBe(false)
    })
  })

  // Regression: a real Strapi activity row (numeric id + recordId, no kind) must decode
  // through the REAL Activity codec. Without strapiRowToShape, Activity.fromJSON throws
  // MALFORMED_JSON on the numeric id; the stand-in foodCodec above masked it.
  describe('decodes real Strapi-shaped rows via the real Activity codec', () => {
    const activityCodec = { fromJSON: Activity.fromJSON, toJSON: (a: Activity) => a.toJSON() } as unknown as Codec<Activity>
    // recordId is the domain id — a real UUID (Id.of requires UUID format).
    const ACT_ID = '00000000-0000-4000-8000-000000000030'
    const strapiActivityRow = {
      id: 3,
      documentId: 'doc-y',
      recordId: ACT_ID,
      name: 'Run',
      slug: 'run',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
      owner: { id: 1 },
      creator: { id: 1 },
    }

    it('search() decodes a Strapi activity row to an Activity with id === recordId', async () => {
      const client = createCatalogClient({
        path: 'activities',
        codec: activityCodec,
        api: makeApi([strapiActivityRow]),
        outbox: makeOutbox(),
      })
      const result = await client.search('run')
      expect(result).toHaveLength(1)
      const activity = result[0]
      expect(activity).toBeInstanceOf(Activity)
      expect(activity?.id).toBe(ACT_ID)
      expect(activity?.name).toBe('Run')
    })

    it('get() decodes a Strapi activity row to an Activity with id === recordId', async () => {
      const client = createCatalogClient({
        path: 'activities',
        codec: activityCodec,
        api: makeApi([], strapiActivityRow),
        outbox: makeOutbox(),
      })
      const activity = await client.get(ACT_ID as Id)
      expect(activity).toBeInstanceOf(Activity)
      expect(activity?.id).toBe(ACT_ID)
      expect(activity?.name).toBe('Run')
    })
  })
})
