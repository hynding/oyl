import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Note, Consumption, Measurement, Goal, Transaction, Budget, Money, DayKey, DayRange, Account, ActivitySession, Quantity, Id } from '@oyl/all-of-oyl'
import { createJournalStore } from './journal-store.js'
import { effect } from '../lib/reactive/effect.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */

const TZ = 'America/New_York'
const ISO = '2026-06-10T16:00:00Z' // 12:00 EDT → June 10 in TZ
const dayOf = () => DayKey.from(new Date(ISO), TZ)
const aNote = (text = 'hello') => new Note({ occurredAt: new Date(ISO), text })

/**
 * Build a per-kind repo map with a separate InMemoryRepository for each entry kind.
 * @returns {{ reposByKind: import('./journal-store.js').ReposByKind, noteRepo: InMemoryRepository<Entry>, consumptionRepo: InMemoryRepository<Entry>, transactionRepo: InMemoryRepository<Entry>, measurementRepo: InMemoryRepository<Entry>, activitySessionRepo: InMemoryRepository<Entry> }}
 */
function makeReposByKind() {
  const noteRepo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
  const consumptionRepo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
  const transactionRepo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
  const measurementRepo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
  const activitySessionRepo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
  const reposByKind = {
    'note': noteRepo,
    'consumption': consumptionRepo,
    'transaction': transactionRepo,
    'measurement': measurementRepo,
    'activity-session': activitySessionRepo,
  }
  return { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo }
}

describe('createJournalStore', () => {
  it('add persists to the repo, reflects in entriesOn, and bumps revision', async () => {
    const { reposByKind, noteRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const before = store.revision.get()
    const saved = await store.add(aNote())
    expect(saved.meta?.revision).toBe(1)
    expect(store.entriesOn(dayOf())).toHaveLength(1)
    expect(await noteRepo.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('persist-first: a failing save leaves the Journal untouched and rethrows', async () => {
    const failingRepo = {
      save: async () => { throw new Error('quota') },
      delete: async () => {},
      list: async () => [],
      get: async () => undefined,
      purge: async () => {},
    }
    const { reposByKind } = makeReposByKind()
    const reposByKindWithFail = { ...reposByKind, 'note': /** @type {any} */ (failingRepo) }
    const store = createJournalStore(reposByKindWithFail, TZ)
    await expect(store.add(aNote())).rejects.toThrow('quota')
    expect(store.entriesOn(dayOf())).toHaveLength(0)
  })

  it('remove deletes from the repo and the aggregate', async () => {
    const { reposByKind, noteRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const saved = await store.add(aNote())
    await store.remove(saved.id)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    expect(await noteRepo.list()).toHaveLength(0)
  })

  it('hydrate rebuilds the aggregate from the repo', async () => {
    const { reposByKind, noteRepo } = makeReposByKind()
    await noteRepo.save(aNote('one'))
    await noteRepo.save(new Note({ occurredAt: new Date(ISO), text: 'two' }))
    const store = createJournalStore(reposByKind, TZ)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    await store.hydrate()
    expect(store.entriesOn(dayOf())).toHaveLength(2)
  })

  it('an effect reading entriesOn re-runs when a mutation bumps revision', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const seen = /** @type {number[]} */ ([])
    effect(() => seen.push(store.entriesOn(dayOf()).length))
    await store.add(aNote())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })

  it('progressOf computes a goal\'s current-period progress from entries', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const goal = new Goal({ metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' })
    expect(store.progressOf(goal, dayOf()).empty).toBe(true)
    await store.add(new Measurement({ occurredAt: new Date(ISO), metric: 'sleep.hours', value: 7 }))
    const p = store.progressOf(goal, dayOf())
    expect(p.current).toBe(7)
    expect(p.met).toBe(true)
    expect(p.empty).toBe(false)
  })

  it('peek exposes the live Journal aggregate', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(aNote())
    expect(store.peek().entriesOn(dayOf())).toHaveLength(1)
  })

  it('transactionsIn returns only transactions whose day is in range', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(new Note({ occurredAt: new Date(ISO), text: 'a note' }))
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const range = DayRange.of(dayOf(), dayOf())
    const txs = store.transactionsIn(range)
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('groceries')
  })

  it('budgetStatus reports spent + progress, reflecting transactions', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const budget = new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) }) // $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const under = store.budgetStatus(budget, dayOf())
    expect(under.spent.minor).toBe(6000)
    expect(under.progress.met).toBe(true)            // $60 ≤ $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(5000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    expect(store.budgetStatus(budget, dayOf()).progress.met).toBe(false) // $110 > $100
  })

  it('adding a Note saves to reposByKind.note and NOT to other repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(aNote())
    expect(await noteRepo.list()).toHaveLength(1)
    expect(await consumptionRepo.list()).toHaveLength(0)
    expect(await transactionRepo.list()).toHaveLength(0)
    expect(await measurementRepo.list()).toHaveLength(0)
    expect(await activitySessionRepo.list()).toHaveLength(0)
  })

  it('adding a Consumption saves to reposByKind.consumption and NOT to other repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(new Consumption({ occurredAt: new Date(ISO), nutrients: { calories: 300 } }))
    expect(await consumptionRepo.list()).toHaveLength(1)
    expect(await noteRepo.list()).toHaveLength(0)
    expect(await transactionRepo.list()).toHaveLength(0)
    expect(await measurementRepo.list()).toHaveLength(0)
    expect(await activitySessionRepo.list()).toHaveLength(0)
  })

  it('hydrate merges records from multiple kind-repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo } = makeReposByKind()
    await noteRepo.save(aNote('breakfast note'))
    await consumptionRepo.save(new Consumption({ occurredAt: new Date(ISO), nutrients: { calories: 200 } }))
    const store = createJournalStore(reposByKind, TZ)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    await store.hydrate()
    expect(store.entriesOn(dayOf())).toHaveLength(2)
    expect(store.consumptionsOn(dayOf())).toHaveLength(1)
  })

  it('adding a Transaction saves to reposByKind.transaction and NOT to other repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    expect(await transactionRepo.list()).toHaveLength(1)
    expect(await noteRepo.list()).toHaveLength(0)
    expect(await consumptionRepo.list()).toHaveLength(0)
    expect(await measurementRepo.list()).toHaveLength(0)
    expect(await activitySessionRepo.list()).toHaveLength(0)
  })

  it('adding a Measurement saves to reposByKind.measurement and NOT to other repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(new Measurement({ occurredAt: new Date(ISO), metric: 'body.weight_kg', value: 82.5 }))
    expect(await measurementRepo.list()).toHaveLength(1)
    expect(await noteRepo.list()).toHaveLength(0)
    expect(await consumptionRepo.list()).toHaveLength(0)
    expect(await transactionRepo.list()).toHaveLength(0)
    expect(await activitySessionRepo.list()).toHaveLength(0)
  })

  it('adding an ActivitySession saves to reposByKind[activity-session] and NOT to other repos', async () => {
    const { reposByKind, noteRepo, consumptionRepo, transactionRepo, measurementRepo, activitySessionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    await store.add(new ActivitySession({ occurredAt: new Date(ISO), activity: { id: Id.create(), slug: 'run' }, quantities: [Quantity.of(30, 'minutes')] }))
    expect(await activitySessionRepo.list()).toHaveLength(1)
    expect(await noteRepo.list()).toHaveLength(0)
    expect(await consumptionRepo.list()).toHaveLength(0)
    expect(await transactionRepo.list()).toHaveLength(0)
    expect(await measurementRepo.list()).toHaveLength(0)
  })

  it('a negative-amount refund Transaction round-trips through the store and appears in transactionsIn', async () => {
    const { reposByKind, transactionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const refund = new Transaction({ occurredAt: new Date(ISO), amount: Money.usd(-1500), category: 'groceries', direction: 'expense' })
    await store.add(refund)
    const range = DayRange.of(dayOf(), dayOf())
    const txs = store.transactionsIn(range)
    expect(txs).toHaveLength(1)
    expect(txs[0]?.amount.minor).toBe(-1500)
    expect(txs[0]?.direction).toBe('expense')
    const persisted = /** @type {Transaction[]} */ (await transactionRepo.list())
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.amount.minor).toBe(-1500)
  })

  it('remove(id) of a consumption deletes from reposByKind.consumption and leaves others untouched', async () => {
    const { reposByKind, noteRepo, consumptionRepo } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const savedNote = await store.add(aNote())
    const savedCons = await store.add(new Consumption({ occurredAt: new Date(ISO), nutrients: { calories: 300 } }))
    expect(store.entriesOn(dayOf())).toHaveLength(2)
    await store.remove(savedCons.id)
    expect(await consumptionRepo.list()).toHaveLength(0)
    expect(await noteRepo.list()).toHaveLength(1)
    expect(store.entriesOn(dayOf())).toHaveLength(1)
    expect(store.entriesOn(dayOf())[0]?.id).toBe(savedNote.id)
  })

  it('add throws for unknown entry kind before mutating the journal', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const unknown = /** @type {any} */ ({ kind: 'bogus-kind', id: { value: 'x' }, occurredAt: new Date(ISO) })
    await expect(store.add(unknown)).rejects.toThrow('unknown entry kind: bogus-kind')
    expect(store.entriesOn(dayOf())).toHaveLength(0)
  })
})

describe('accountSpend (delegates to Account.spentIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountSpend(checking, DayKey.from(new Date(), 'UTC')).minor).toBe(6500)
  })
})

describe('accountBalance (delegates to Account.balanceIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income', accountId: checking.id }))
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(50000, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountBalance(checking).minor).toBe(150000)
  })
})

describe('consumptionsOn / dailyNutrients', () => {
  it('lists the day consumptions and sums their nutrients, ignoring other kinds', async () => {
    const { reposByKind } = makeReposByKind()
    const store = createJournalStore(reposByKind, 'UTC')
    const iso = new Date().toISOString().split('T')[0] + 'T12:00:00Z'
    const date = new Date(iso)
    const today = DayKey.from(date, 'UTC')
    await store.add(new Consumption({ occurredAt: date, nutrients: { calories: 150, protein: 5 }, servings: 2 }))
    await store.add(new Consumption({ occurredAt: date, nutrients: { calories: 550 } }))
    await store.add(new Note({ occurredAt: date, text: 'walk' }))
    expect(store.consumptionsOn(today)).toHaveLength(2)
    expect(store.dailyNutrients(today)).toEqual({ calories: 150 * 2 + 550, protein: 5 * 2 })
  })
})
