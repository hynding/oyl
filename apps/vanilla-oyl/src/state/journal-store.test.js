import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Note, Consumption, Measurement, Goal, Transaction, Budget, Money, DayKey, DayRange, Account } from '@oyl/all-of-oyl'
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

  it('progressOf computes a goal\'s current-period progress from entries', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const goal = new Goal({ metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' })
    expect(store.progressOf(goal, dayOf()).empty).toBe(true)
    await store.add(new Measurement({ occurredAt: new Date(ISO), metric: 'sleep.hours', value: 7 }))
    const p = store.progressOf(goal, dayOf())
    expect(p.current).toBe(7)
    expect(p.met).toBe(true)
    expect(p.empty).toBe(false)
  })

  it('peek exposes the live Journal aggregate', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    await store.add(aNote())
    expect(store.peek().entriesOn(dayOf())).toHaveLength(1)
  })

  it('transactionsIn returns only transactions whose day is in range', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    await store.add(new Note({ occurredAt: new Date(ISO), text: 'a note' }))
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const range = DayRange.of(dayOf(), dayOf())
    const txs = store.transactionsIn(range)
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('groceries')
  })

  it('budgetStatus reports spent + progress, reflecting transactions', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const budget = new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) }) // $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const under = store.budgetStatus(budget, dayOf())
    expect(under.spent.minor).toBe(6000)
    expect(under.progress.met).toBe(true)            // $60 ≤ $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(5000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    expect(store.budgetStatus(budget, dayOf()).progress.met).toBe(false) // $110 > $100
  })
})

describe('accountSpend (delegates to Account.spentIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountSpend(checking, DayKey.from(new Date(), 'UTC')).minor).toBe(6500)
  })
})

describe('accountBalance (delegates to Account.balanceIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income', accountId: checking.id }))
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(50000, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountBalance(checking).minor).toBe(150000)
  })
})

describe('consumptionsOn / dailyNutrients', () => {
  it('lists the day consumptions and sums their nutrients, ignoring other kinds', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
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
