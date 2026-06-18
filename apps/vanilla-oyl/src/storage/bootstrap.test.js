import { describe, expect, it, vi } from 'vitest'
import { makeRepositories, createFlusher, PATH_BY_COLLECTION } from './bootstrap.js'
import { Note, entitiesByKind, manualConnectivity } from '@oyl/all-of-oyl'
import { OUTBOX_KEY } from './keys.js'

function fakeStorage() {
  const m = new Map()
  return {
    /** @param {string} k */
    getItem: (k) => m.get(k) ?? null,
    /** @param {string} k @param {string} v */
    setItem: (k, v) => void m.set(k, v),
    /** @param {string} k */
    removeItem: (k) => void m.delete(k),
    /** @param {number} i */
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}

/** @returns {import('@oyl/all-of-oyl').ApiClient & { calls: any[] }} */
function fakeApi() {
  /** @type {any[]} */
  const calls = []
  return {
    calls,
    find: async () => ({ data: [], meta: {} }),
    findOne: async () => undefined,
    create: async (path, data) => { calls.push({ op: 'create', path, data }); return data },
    update: async (path, id, data) => { calls.push({ op: 'update', path, id, data }); return data },
    remove: async (path, id) => { calls.push({ op: 'remove', path, id }) },
  }
}

describe('makeRepositories (online-first)', () => {
  it('builds a server personal repo per personal entity and a catalog client per catalog entity', () => {
    const { repos, catalogs } = makeRepositories(/** @type {any} */ (fakeStorage()), { api: fakeApi() })
    for (const name of entitiesByKind('personal')) {
      expect(typeof repos[name]?.list).toBe('function')
      expect(typeof repos[name]?.save).toBe('function')
    }
    for (const name of entitiesByKind('catalog')) {
      expect(typeof catalogs[name]?.search).toBe('function')
      expect(typeof catalogs[name]?.list).toBe('function')
    }
  })

  it('personal save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api })
    await repos.entries.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.entries, op: 'save' })
    expect(api.calls).toHaveLength(0) // writes never hit the network directly
  })

  it('flush() drains the outbox via api.update (PUT by domain id) when online, then acks', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos, flush } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(true) })
    const note = new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' })
    await repos.entries.save(note)
    await flush()
    expect(api.calls).toHaveLength(1)
    // save → PUT /<path>/<domainId> (upsert), NOT POST. The id is the domain id.
    expect(api.calls[0]).toMatchObject({ op: 'update', path: PATH_BY_COLLECTION.entries, id: note.id })
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(0) // acked
  })

  it('flush() is a no-op when offline (outbox retained)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos, flush } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.entries.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
    await flush()
    expect(api.calls).toHaveLength(0)
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
  })

  it('flush() stops at the first failure, preserving order (failed op retried later)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    let fail = true
    api.update = vi.fn(async (path, id, data) => {
      if (fail) throw new Error('boom')
      api.calls.push({ op: 'update', path, id, data })
      return data
    })
    const { repos, flush } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(true) })
    await repos.entries.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'a' }))
    await flush()
    expect(JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))).toHaveLength(1) // retained
    fail = false
    await flush()
    expect(JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))).toHaveLength(0) // drained
  })
})

describe('createFlusher', () => {
  it('routes delete mutations to api.remove with the payload id', async () => {
    const api = fakeApi()
    /** @type {any} */
    const outbox = {
      _q: [{ id: 'm1', entity: 'notes', op: 'delete', payload: { id: 'rec-1' }, baseUpdatedAt: null, enqueuedAt: '' }],
      peekAll() { return this._q.slice() },
      ack(/** @type {string} */ id) { this._q = this._q.filter((/** @type {any} */ m) => m.id !== id) },
      enqueue() { throw new Error('unused') },
      size() { return this._q.length },
    }
    const flush = createFlusher(outbox, api, manualConnectivity(true))
    await flush()
    expect(api.calls).toEqual([{ op: 'remove', path: 'notes', id: 'rec-1' }])
    expect(outbox.size()).toBe(0)
  })
})
