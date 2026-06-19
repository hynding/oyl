import { describe, expect, it, vi } from 'vitest'
import { makeRepositories, createFlusher, PATH_BY_COLLECTION } from './bootstrap.js'
import { Note, Consumption, Consumable, Transaction, Account, Budget, Money, Measurement, entitiesByKind, manualConnectivity } from '@oyl/all-of-oyl'
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

  it('notes save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    // Offline: the save path itself only enqueues; the flusher (not save) hits the network.
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.notes.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.notes, op: 'save' })
    expect(api.calls).toHaveLength(0) // writes never hit the network directly
  })

  it('consumptions save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const consumable = new Consumable({ name: 'Oats', facts: { calories: 150, protein: 5, totalCarbohydrate: 27, totalFat: 3 } })
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.consumptions.save(new Consumption({ occurredAt: new Date('2026-06-10T16:00:00Z'), consumable: { id: consumable.id, nutrients: consumable.facts } }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.consumptions, op: 'save' })
    expect(api.calls).toHaveLength(0)
  })

  it('consumptions read path injects kind so a kind-less Strapi row decodes to a Consumption', async () => {
    const api = fakeApi()
    // A real Strapi relational row: numeric id + recordId (the domain id), NO `kind` discriminant.
    // The per-kind codec is Consumption.fromJSON, whose parseEntryBase validates kind === 'consumption',
    // so bootstrap must inject it via ROW_KIND_BY_COLLECTION.consumptions → strapiRowToShape(row, { kind }).
    const row = {
      id: 7,
      recordId: '11111111-1111-4111-8111-111111111111',
      occurredAt: '2026-06-10T16:00:00.000Z',
      servings: 1,
      nutrients: { calories: 150 },
    }
    api.find = async () => ({ data: [row], meta: {} })
    const { repos } = makeRepositories(/** @type {any} */ (fakeStorage()), { api, connectivity: manualConnectivity(false) })
    const list = await repos.consumptions.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toBeInstanceOf(Consumption)
    expect(list[0].id).toBe(row.recordId)
    expect(list[0].nutrients.calories).toBe(150)
  })

  it('transactions read path injects kind so a kind-less Strapi row decodes to a Transaction', async () => {
    const api = fakeApi()
    // A real Strapi relational row: numeric id + recordId (the domain id), NO `kind` discriminant.
    // The per-kind codec is Transaction.fromJSON, whose parseEntryBase validates kind === 'transaction',
    // so bootstrap must inject it via ROW_KIND_BY_COLLECTION.transactions → strapiRowToShape(row, { kind }).
    // minor is ALREADY a number here — sanitizeMoney coercion runs server-side in the Strapi controller.
    const recordId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const row = {
      id: 7,
      recordId,
      occurredAt: '2026-06-10T16:00:00.000Z',
      category: 'groceries',
      direction: 'expense',
      amount: { minor: 1500, currency: 'USD', exponent: 2 },
      accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }
    api.find = async () => ({ data: [row], meta: {} })
    const { repos } = makeRepositories(/** @type {any} */ (fakeStorage()), { api, connectivity: manualConnectivity(false) })
    const list = await repos.transactions.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toBeInstanceOf(Transaction)
    expect(list[0].id).toBe(recordId)
    expect(list[0].amount.minor).toBe(1500)
  })

  it('accounts save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.accounts.save(new Account({ name: 'Checking', currency: 'USD' }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.accounts, op: 'save' })
    expect(api.calls).toHaveLength(0)
  })

  it('budgets save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.budgets.save(new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.budgets, op: 'save' })
    expect(api.calls).toHaveLength(0)
  })

  it('stub repos (activitySessions) list resolves [] and save does not enqueue', async () => {
    const storage = fakeStorage()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api: fakeApi(), connectivity: manualConnectivity(false) })
    expect(await repos.activitySessions.list()).toEqual([])
    // emptyRepo save returns the item but does NOT enqueue to the outbox
    const note = new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'stub test' })
    const saved = await repos.activitySessions.save(/** @type {any} */ (note))
    expect(saved).toBe(note)
    const outbox = JSON.parse(storage.getItem(OUTBOX_KEY) ?? 'null')
    expect(outbox).toBeNull() // no outbox entry written by stub repos
  })

  it('measurements read path injects kind so a kind-less Strapi row decodes to a Measurement', async () => {
    const api = fakeApi()
    // A real Strapi relational row: numeric id + recordId (the domain id), NO `kind` discriminant.
    // The per-kind codec is Measurement.fromJSON, whose parseEntryBase validates kind === 'measurement',
    // so bootstrap must inject it via ROW_KIND_BY_COLLECTION.measurements → strapiRowToShape(row, { kind }).
    // value is a number — Strapi float returns a number, no coercion needed.
    const recordId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const row = {
      id: 7,
      recordId,
      occurredAt: '2026-06-10T16:00:00.000Z',
      metric: 'body.weight_kg',
      value: 82.5,
    }
    api.find = async () => ({ data: [row], meta: {} })
    const { repos } = makeRepositories(/** @type {any} */ (fakeStorage()), { api, connectivity: manualConnectivity(false) })
    const list = await repos.measurements.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toBeInstanceOf(Measurement)
    expect(list[0].id).toBe(recordId)
    expect(list[0].metric).toBe('body.weight_kg')
    expect(list[0].value).toBe(82.5)
  })

  it('measurements save enqueues to the outbox (no network)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.measurements.save(new Measurement({ occurredAt: new Date('2026-06-10T16:00:00Z'), metric: 'body.weight_kg', value: 82.5 }))
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ entity: PATH_BY_COLLECTION.measurements, op: 'save' })
    expect(api.calls).toHaveLength(0)
  })

  it('flush() drains the outbox via api.update (PUT by domain id) when online, then acks', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos, flush } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(true) })
    const note = new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' })
    await repos.notes.save(note)
    await flush()
    expect(api.calls).toHaveLength(1)
    // save → PUT /<path>/<domainId> (upsert), NOT POST. The id is the domain id.
    expect(api.calls[0]).toMatchObject({ op: 'update', path: PATH_BY_COLLECTION.notes, id: note.id })
    const outbox = JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))
    expect(outbox).toHaveLength(0) // acked
  })

  it('a same-tab enqueue while online flushes promptly without an explicit flush() call', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(true) })
    const note = new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' })
    await repos.notes.save(note) // enqueue → onEnqueue → flush (no external trigger)
    await Promise.resolve() // let the fire-and-forget flush settle
    expect(api.calls).toHaveLength(1)
    expect(api.calls[0]).toMatchObject({ op: 'update', path: PATH_BY_COLLECTION.notes, id: note.id })
    expect(JSON.parse(/** @type {string} */ (storage.getItem(OUTBOX_KEY)))).toHaveLength(0) // acked
  })

  it('flush() is a no-op when offline (outbox retained)', async () => {
    const storage = fakeStorage()
    const api = fakeApi()
    const { repos, flush } = makeRepositories(/** @type {any} */ (storage), { api, connectivity: manualConnectivity(false) })
    await repos.notes.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
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
    await repos.notes.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'a' }))
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
