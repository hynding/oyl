import { describe, expect, it } from 'vitest'
import { Note, Measurement, Goal, DayKey, Task, periodWindowOf, Subscription, Cadence, Money, Account, manualConnectivity, COLLECTIONS, InMemoryRepository } from '@oyl/all-of-oyl'
import { createThemeState } from './theme.js'
import { createDataState } from './data.js'
import { defaultTimezone } from '../storage/clock.js'
import { loadDemoData } from '../storage/seed.js'

/**
 * A COLLECTIONS-keyed map of conformant in-memory repos — used to exercise store/round-trip
 * logic without a server. The online-first server repos (noop api in tests) don't round-trip
 * save→list locally; the store logic under test is Repository-shaped, so an InMemoryRepository
 * is the right test double.
 * @returns {any}
 */
function inMemoryRepos() {
  /** @type {any} */
  const repos = {}
  for (const name of Object.keys(COLLECTIONS)) repos[name] = new InMemoryRepository()
  return repos
}

/** Seed localStorage data keys into a COLLECTIONS-keyed in-memory repos map. @param {any} storage @returns {Promise<any>} */
async function reposFromSeed(storage) {
  const repos = inMemoryRepos()
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(`oyl/data/${name}`)
    if (!raw) continue
    const codec = /** @type {any} */ (COLLECTIONS[/** @type {keyof typeof COLLECTIONS} */ (name)])
    for (const shape of JSON.parse(raw)) await repos[name].save(codec.fromJSON(shape))
  }
  return repos
}

/** @param {Record<string,string>} [seed] */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => void map.set(k, v),
    /** @param {string} k */ removeItem: (k) => void map.delete(k),
    /** @param {number} i */ key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('data state', () => {
  it('refresh populates schema + counts; readDiagnostics composes them', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await ds.refresh()
    expect(ds.schema.get().status).toBe('fresh')
    expect(ds.counts.get()).toBeTypeOf('object')
    const diag = ds.readDiagnostics()
    expect(diag.schema.status).toBe('fresh')
    expect(diag.theme.theme).toBe('classic')
    expect(typeof diag.build).toBe('string')
  })

  it('exposes a journal store hydrated from the entries repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { repos: inMemoryRepos() })
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.entries.save(new Note({ occurredAt: new Date(iso), text: 'hi' }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    expect(ds.journal.entriesOn(day)).toHaveLength(1)
  })

  it('exposes a planner store hydrated from the plans repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { repos: inMemoryRepos() })
    const due = DayKey.of('2026-06-16')
    await ds.repos.plans.save(/** @type {any} */ (new Task({ title: 'plan it', due })))
    await ds.refresh()
    expect(ds.planner.agendaFor(due)).toHaveLength(1)
  })

  it('readDiagnostics includes a storage estimate when the Storage API is available', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage')
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: { estimate: async () => ({ usage: 1234, quota: 5_000_000 }) },
    })
    try {
      const storage = fakeStorage()
      const ds = createDataState(storage, createThemeState(storage))
      await ds.refresh()
      expect(ds.readDiagnostics().storage).toEqual({ usage: 1234, quota: 5_000_000 })
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'storage', original)
      else Reflect.deleteProperty(globalThis.navigator, 'storage')
    }
  })

  it('exposes a vault store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.vault.hydrate).toBe('function')
    expect(typeof ds.vault.upcoming).toBe('function')
  })

  it('exposes a goals store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.goals.all).toBe('function')
  })

  it('exposes a budgets store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.budgets.all).toBe('function')
  })

  it('exposes an accounts store hydrated by refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { repos: inMemoryRepos() })
    await ds.repos.accounts.save(new Account({ name: 'Checking', currency: 'USD' }))
    await ds.refresh()
    expect(ds.accounts.all().map((a) => a.name)).toContain('Checking')
  })

  it('reviewOn composes a review for a period', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { repos: inMemoryRepos() })
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.goals.save(new Goal({ name: 'Sleep', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' }))
    await ds.repos.entries.save(new Measurement({ occurredAt: new Date(iso), metric: 'sleep.hours', value: 7 }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('day', day))
    expect(r.goals).toHaveLength(1)
    expect(r.goals[0]?.progress.current).toBe(7)
    expect(r.totals).toBeDefined()
  })

  it('readDiagnostics storage is null when the Storage API is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage')
    Reflect.deleteProperty(globalThis.navigator, 'storage')
    try {
      const storage = fakeStorage()
      const ds = createDataState(storage, createThemeState(storage))
      await ds.refresh()
      expect(ds.readDiagnostics().storage).toBeNull()
    } finally {
      if (original) Object.defineProperty(globalThis.navigator, 'storage', original)
    }
  })

  it('reviewOn includes named life areas from the loaded catalogs', async () => {
    const storage = fakeStorage()
    await loadDemoData(storage)
    const ds = createDataState(storage, createThemeState(storage), { repos: await reposFromSeed(storage) })
    await ds.refresh()
    const day = DayKey.from(new Date(), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('month', day))
    expect(r.areas.map((a) => a.name)).toContain('Health')
  })

  it('reads through the api client when one is provided', async () => {
    let called = false
    /** @type {any} */
    const api = {
      find: async () => { called = true; return { data: [], meta: {} } },
      findOne: async () => undefined,
      create: async (/** @type {any} */ _p, /** @type {any} */ d) => d,
      update: async (/** @type {any} */ _p, /** @type {any} */ _i, /** @type {any} */ d) => d,
      remove: async () => {},
    }
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { api, connectivity: manualConnectivity(true) })
    await ds.refresh()
    expect(called).toBe(true) // the journal/catalog hydrate hit api.find
  })

  it('exposes a pending signal derived from the outbox (grows on save)', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), {})
    expect(ds.pending.get()).toBe(0)
    await ds.repos.entries.save(new Note({ occurredAt: new Date('2026-06-10T16:00:00Z'), text: 'hi' }))
    ds.refreshPending()
    expect(ds.pending.get()).toBe(1)
  })
})

describe('renewSubscription (subscription→transaction seam)', () => {
  it('posts the charge as an expense transaction in the current month', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { repos: inMemoryRepos() })
    const today = DayKey.from(new Date(), defaultTimezone())
    const sub = new Subscription({
      name: 'Netflix',
      amount: Money.of(1599, 'USD', 2),
      cadence: Cadence.of(1, 'months'),
      anchor: today,
      category: 'entertainment',
    })
    await ds.repos.subscriptions.save(sub)
    await ds.refresh()

    const charge = await ds.renewSubscription(sub.id, today)

    expect(charge?.category).toBe('entertainment')
    const txs = ds.journal.transactionsIn(periodWindowOf('month', today))
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('entertainment')
    expect(txs[0]?.amount.minor).toBe(1599)
    expect(txs[0]?.direction).toBe('expense')
  })

  it('does nothing for an unknown subscription id', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const today = DayKey.from(new Date(), defaultTimezone())
    await ds.refresh()

    const charge = await ds.renewSubscription(/** @type {any} */ ('nope'), today)

    expect(charge).toBeUndefined()
    expect(ds.journal.transactionsIn(periodWindowOf('month', today))).toHaveLength(0)
  })
})

describe('createDataState injected repos + timezone', () => {
  it('uses injected repos and the provided timezone for the journal store', async () => {
    const storage = fakeStorage()
    const { makeRepositories } = await import('../storage/bootstrap.js')
    const { repos, outbox } = makeRepositories(storage)
    const ds = createDataState(storage, createThemeState(storage), { repos, outbox, timezone: 'Asia/Tokyo' })
    expect(ds.repos).toBe(repos)
    // A note added at this instant lands on the Tokyo civil day.
    await ds.journal.add(new Note({ text: 'hi', occurredAt: new Date('2026-06-17T16:00:00Z') }))
    const tokyoDay = DayKey.from(new Date('2026-06-17T16:00:00Z'), 'Asia/Tokyo')
    expect(ds.journal.entriesOn(tokyoDay).length).toBe(1)
  })
})
