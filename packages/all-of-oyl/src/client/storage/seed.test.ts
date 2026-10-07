import { describe, expect, it } from 'vitest'
import { loadDataset, seedAccount } from './seed.js'
import { makeSeed, Note, Task, Goal, Consumable, DayKey } from '../../index.js'

/**
 * A recording dataState double: every store add() captures the revived domain instance.
 * Shapes mirror the createDataState surface the loader routes to.
 */
function fakeDataState() {
  const got: Record<string, any[]> = {
    journal: [], plans: [], documents: [], possessions: [], subscriptions: [],
    contacts: [], giftIdeas: [], goals: [], budgets: [], accounts: [],
    consumables: [], consumableProducts: [], activities: [],
  }
  const rec = (k: string) => async (x: any) => { (got[k] ??= []).push(x); return x }
  const g = (k: string): any[] => got[k] ?? []
  return {
    got,
    g,
    journal: { add: rec('journal') },
    planner: { add: rec('plans') },
    vault: {
      addDocument: rec('documents'), addPossession: rec('possessions'), addSubscription: rec('subscriptions'),
      addContact: rec('contacts'), addGiftIdea: rec('giftIdeas'),
    },
    goals: { add: rec('goals') },
    budgets: { add: rec('budgets') },
    accounts: { add: rec('accounts') },
    consumables: { add: rec('consumables') },
    consumableProducts: { add: rec('consumableProducts') },
    repos: { activities: { save: rec('activities') } },
  }
}

describe('loadDataset', () => {
  it('revives wire shapes and routes each collection to its store', async () => {
    const ds = fakeDataState()
    const seed = makeSeed()
    const result = await loadDataset(ds as any, seed as any)

    const entryCount = seed.notes.length + seed.consumptions.length + seed.transactions.length + seed.measurements.length + seed.activitySessions.length
    expect(ds.g('journal')).toHaveLength(entryCount)
    expect(ds.g('journal').some((e) => e instanceof Note)).toBe(true)
    expect(ds.g('plans')).toHaveLength(seed.plans.length)
    expect(ds.g('plans')[0]).toBeInstanceOf(Task)
    expect(ds.g('goals')).toHaveLength(seed.goals.length)
    expect(ds.g('goals')[0]).toBeInstanceOf(Goal)
    expect(ds.g('budgets')).toHaveLength(seed.budgets.length)
    expect(ds.g('accounts')).toHaveLength(seed.accounts.length)
    expect(ds.g('consumables')).toHaveLength(seed.consumables.length)
    expect(ds.g('consumables')[0]).toBeInstanceOf(Consumable)
    expect(ds.g('activities')).toHaveLength(seed.activities.length)
    expect(ds.g('documents')).toHaveLength(seed.documents.length)
    expect(ds.g('possessions')).toHaveLength(seed.possessions.length)
    expect(ds.g('subscriptions')).toHaveLength(seed.subscriptions.length)
    expect(ds.g('contacts')).toHaveLength(seed.contacts.length)
    expect(ds.g('giftIdeas')).toHaveLength(seed.giftIdeas.length)
    expect(result.added).toBeGreaterThan(0)
    expect(result.skipped).toBe(0)
  })

  it('tolerates per-item failures (e.g. duplicate ids on a re-run) and keeps going', async () => {
    const ds = fakeDataState()
    const seen = new Set()
    const journalAdd = ds.journal.add
    ds.journal.add = async (e: any) => {
      if (seen.has(String(e.id))) throw new Error('DUPLICATE_ID')
      seen.add(String(e.id))
      return journalAdd(e)
    }
    const seed = makeSeed()
    const first = await loadDataset(ds as any, seed as any)
    const second = await loadDataset(ds as any, seed as any)
    expect(first.skipped).toBe(0)
    // Journal dupes skip; the rest of the dataset still loads.
    expect(second.skipped).toBeGreaterThan(0)
    expect(second.added).toBeGreaterThan(0)
  })
})

describe('seedAccount', () => {
  it('loads the canonical demo dataset re-anchored to the given day', async () => {
    const ds = fakeDataState()
    const today = DayKey.of('2026-07-18')
    await seedAccount(ds as any, today)
    // The rolling slice ends at the requested day — at least one entry lands on it.
    const onToday = ds.g('journal').filter((e) => e.occurredAt.toISOString().startsWith(today.value))
    expect(onToday.length).toBeGreaterThan(0)
  })

  it('mints fresh ids per seeding (recordId is globally unique server-side)', async () => {
    // Two accounts seeding the same fixture dataset must never collide on the server.
    const a = fakeDataState()
    const b = fakeDataState()
    const today = DayKey.of('2026-07-18')
    await seedAccount(a as any, today)
    await seedAccount(b as any, today)
    const idsA = new Set(a.g('journal').map((e) => String(e.id)))
    for (const e of b.g('journal')) expect(idsA.has(String(e.id))).toBe(false)
  })

  it('keeps cross-references consistent after id remapping', async () => {
    const ds = fakeDataState()
    await seedAccount(ds as any, DayKey.of('2026-07-18'))
    const consumableIds = new Set(ds.g('consumables').map((c) => String(c.id)))
    const consumptions = ds.g('journal').filter((e) => e.kind === 'consumption' && e.consumableId !== undefined)
    expect(consumptions.length).toBeGreaterThan(0)
    for (const c of consumptions) expect(consumableIds.has(String(c.consumableId))).toBe(true)
    const accountIds = new Set(ds.g('accounts').map((a) => String(a.id)))
    const accountTx = ds.g('journal').filter((e) => e.kind === 'transaction' && e.accountId !== undefined)
    expect(accountTx.length).toBeGreaterThan(0)
    for (const t of accountTx) expect(accountIds.has(String(t.accountId))).toBe(true)
    const contactIds = new Set(ds.g('contacts').map((c) => String(c.id)))
    for (const g of ds.g('giftIdeas')) expect(contactIds.has(String(g.contactId))).toBe(true)
  })
})
