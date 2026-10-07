import { describe, expect, it } from 'vitest'
import { exportData, importData } from './backup.js'
import { loadDataset } from './seed.js'
import { makeSeed, Journal, COLLECTIONS, Planner } from '../../index.js'
import { SETTINGS_KEY } from './keys.js'
import { memoryStorage } from './memory-storage-fake.js'

/**
 * A live-enough dataState double: adds land in real aggregates/arrays and the same
 * read surface exportData consumes (journal.peek/planner.peek/vault getters/.all()).
 */
function fakeDataState() {
  const journal = new Journal('UTC')
  const planner = new Planner()
  const lists: Record<string, any[]> = {
    documents: [], possessions: [], subscriptions: [], contacts: [], giftIdeas: [],
    goals: [], budgets: [], accounts: [], consumables: [], consumableProducts: [], activities: [],
  }
  const rec = (k: string) => async (x: any) => { (lists[k] ??= []).push(x); return x }
  return {
    journal: { add: async (e: any) => { journal.add(e); return e }, peek: () => journal },
    planner: { add: async (p: any) => { planner.add(p); return p }, peek: () => planner },
    vault: {
      addDocument: rec('documents'), addPossession: rec('possessions'), addSubscription: rec('subscriptions'),
      addContact: rec('contacts'), addGiftIdea: rec('giftIdeas'),
      documents: () => lists.documents, possessions: () => lists.possessions, subscriptions: () => lists.subscriptions,
      contacts: () => lists.contacts, giftIdeas: () => lists.giftIdeas,
    },
    goals: { add: rec('goals'), all: () => lists.goals },
    budgets: { add: rec('budgets'), all: () => lists.budgets },
    accounts: { add: rec('accounts'), all: () => lists.accounts },
    consumables: { add: rec('consumables'), all: () => lists.consumables },
    consumableProducts: { add: rec('consumableProducts'), all: () => lists.consumableProducts },
    repos: { activities: { save: rec('activities') } },
  }
}

describe('backup (account data over the stores)', () => {
  it('exports the hydrated account and re-imports it intact (round trip)', async () => {
    const src = fakeDataState()
    const seed = makeSeed()
    await loadDataset(src as any, seed as any)

    const storage = memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark' }) })
    const doc = exportData(storage, src as any)
    expect(doc.schemaVersion).toBeGreaterThan(0)
    expect(typeof doc.exportedAt).toBe('string')
    expect(doc.settings).toEqual({ theme: 'forest', mode: 'dark' })
    expect(doc.collections.notes).toHaveLength(seed.notes.length)
    expect(doc.collections.transactions).toHaveLength(seed.transactions.length)
    expect(doc.collections.plans).toHaveLength(seed.plans.length)
    expect(doc.collections.subscriptions).toHaveLength(seed.subscriptions.length)
    expect(doc.collections.goals).toHaveLength(seed.goals.length)
    // Every exported shape revives through its codec — the export IS a loadable dataset.
    for (const name of Object.keys(doc.collections)) {
      const codec = COLLECTIONS[name as keyof typeof COLLECTIONS] as any
      for (const shape of doc.collections[name] ?? []) codec.fromJSON(shape)
    }

    const dest = fakeDataState()
    const result = await importData(dest as any, JSON.stringify(doc))
    expect(result.skipped).toBe(0)
    expect(dest.journal.peek().span()).toBeDefined()
    expect(dest.goals.all()).toHaveLength(seed.goals.length)
  })

  it('rejects a corrupt payload before loading anything', async () => {
    const dest = fakeDataState()
    const corrupt = JSON.stringify({ schemaVersion: 1, exportedAt: 'x', collections: { notes: [{ kind: 'not-a-note-kind' }] } })
    await expect(importData(dest as any, corrupt)).rejects.toThrow()
    expect(dest.journal.peek().span()).toBeUndefined()
  })

  it('rejects a document from a newer schema', async () => {
    const dest = fakeDataState()
    const future = JSON.stringify({ schemaVersion: 9999, exportedAt: 'x', collections: {} })
    await expect(importData(dest as any, future)).rejects.toThrow(/newer/)
  })
})
