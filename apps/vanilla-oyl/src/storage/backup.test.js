import { describe, expect, it } from 'vitest'
import { exportData, importData } from './backup.js'
import { loadDataset } from './seed.js'
import { makeSeed, Journal, COLLECTIONS, Planner } from '@oyl/all-of-oyl'
import { SETTINGS_KEY } from './keys.js'

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

/**
 * A live-enough dataState double: adds land in real aggregates/arrays and the same
 * read surface exportData consumes (journal.peek/planner.peek/vault getters/.all()).
 */
function fakeDataState() {
  const journal = new Journal('UTC')
  const planner = new Planner()
  /** @type {Record<string, any[]>} */
  const lists = {
    documents: [], possessions: [], subscriptions: [], contacts: [], giftIdeas: [],
    goals: [], budgets: [], accounts: [], consumables: [], consumableProducts: [], activities: [],
  }
  const rec = (/** @type {string} */ k) => async (/** @type {any} */ x) => { (lists[k] ??= []).push(x); return x }
  return {
    journal: { add: async (/** @type {any} */ e) => { journal.add(e); return e }, peek: () => journal },
    planner: { add: async (/** @type {any} */ p) => { planner.add(p); return p }, peek: () => planner },
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
    await loadDataset(/** @type {any} */ (src), /** @type {any} */ (seed))

    const storage = fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ theme: 'forest', mode: 'dark' }) })
    const doc = exportData(storage, /** @type {any} */ (src))
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
      const codec = /** @type {any} */ (COLLECTIONS[/** @type {keyof typeof COLLECTIONS} */ (name)])
      for (const shape of doc.collections[name] ?? []) codec.fromJSON(shape)
    }

    const dest = fakeDataState()
    const result = await importData(/** @type {any} */ (dest), JSON.stringify(doc))
    expect(result.skipped).toBe(0)
    expect(dest.journal.peek().span()).toBeDefined()
    expect(dest.goals.all()).toHaveLength(seed.goals.length)
  })

  it('rejects a corrupt payload before loading anything', async () => {
    const dest = fakeDataState()
    const corrupt = JSON.stringify({ schemaVersion: 1, exportedAt: 'x', collections: { notes: [{ kind: 'not-a-note-kind' }] } })
    await expect(importData(/** @type {any} */ (dest), corrupt)).rejects.toThrow()
    expect(dest.journal.peek().span()).toBeUndefined()
  })

  it('rejects a document from a newer schema', async () => {
    const dest = fakeDataState()
    const future = JSON.stringify({ schemaVersion: 9999, exportedAt: 'x', collections: {} })
    await expect(importData(/** @type {any} */ (dest), future)).rejects.toThrow(/newer/)
  })
})
