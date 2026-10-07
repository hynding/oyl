import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey, DayRange, Contact, GiftIdea } from '../../index.js'
import { createVaultStore } from './vault.js'

const today = DayKey.of('2026-06-13')
const range = DayRange.of(today, today.addDays(90))

const contact = (name = 'Sam', opts: Record<string, unknown> = {}) => new Contact({ name, ...opts })

const sub = (opts: Record<string, unknown> = {}) => new Subscription({
  name: 'Netflix', amount: Money.of(1399, 'USD', 2), cadence: Cadence.of(1, 'months'),
  anchor: today, category: 'entertainment', ...opts,
})

/** Five in-memory repositories, the shape createVaultStore expects. */
function repos() {
  return {
    documents: (new InMemoryRepository() as any),
    possessions: (new InMemoryRepository() as any),
    subscriptions: (new InMemoryRepository() as any),
    contacts: (new InMemoryRepository() as any),
    giftIdeas: (new InMemoryRepository() as any),
  }
}

describe('createVaultStore', () => {
  it('addDocument persists, reflects in documents(), and bumps revision', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const before = store.revision.get()
    await store.addDocument(new Document({ name: 'Passport', kind: 'passport' }))
    expect(store.documents()).toHaveLength(1)
    expect(await r.documents.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('addPossession persists and reflects in possessions()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addPossession(new Possession({ name: 'Espresso machine' }))
    expect(store.possessions()).toHaveLength(1)
    expect(await r.possessions.list()).toHaveLength(1)
  })

  it('a dated item appears in upcoming() after add', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addDocument(new Document({ name: 'Passport', kind: 'passport', expiresOn: today.addDays(30) }))
    const feed = store.upcoming(range)
    expect(feed.map((u) => u.label)).toContain('Passport')
  })

  it('removeDocument deletes from the repo and the aggregate', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addDocument(new Document({ name: 'Passport', kind: 'passport' }))
    await store.removeDocument(saved.id)
    expect(store.documents()).toHaveLength(0)
    expect(await r.documents.list()).toHaveLength(0)
  })

  it('addSubscription persists, reflects in subscriptions(), and in upcoming()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addSubscription(sub())
    expect(store.subscriptions()).toHaveLength(1)
    expect(await r.subscriptions.list()).toHaveLength(1)
    expect(store.upcoming(range).map((u) => u.label)).toContain('Netflix')
  })

  it('removeSubscription deletes from the repo and the aggregate', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addSubscription(sub())
    await store.removeSubscription(saved.id)
    expect(store.subscriptions()).toHaveLength(0)
    expect(await r.subscriptions.list()).toHaveLength(0)
  })

  it('renew advances the next due to the following occurrence', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addSubscription(sub())
    const before = (saved.nextDueOn(today) as import('../../index.js').DayKey) // never renewed → pending = anchor (today)
    await store.renew(saved.id, today)
    const renewed = (store.subscriptions()[0] as import('../../index.js').Subscription)
    const after = (renewed.nextDueOn(today) as import('../../index.js').DayKey)
    expect(after.compare(before)).toBeGreaterThan(0)
  })

  it('renew keeps the aggregate intact when repos are enqueue-only stubs (online-first)', async () => {
    // vault collections are not yet backed: their repos save-as-no-op and list empty.
    // A success-path re-hydrate would wipe the whole in-session vault after a renew.
    const r = repos()
    r.subscriptions = ({
      list: async () => [], get: async () => undefined,
      save: async (s: unknown) => s, saveMany: async (i: unknown[]) => i,
      delete: async () => {}, purge: async () => {},
    } as any)
    const store = createVaultStore(r)
    const saved = await store.addSubscription(sub())
    const charge = await store.renew(saved.id, today)
    expect(charge).toBeDefined()
    expect(store.subscriptions()).toHaveLength(1)
  })

  it('monthlySubscriptionTotals reflects added subscriptions', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addSubscription(sub()) // $13.99 monthly → $13.99/mo
    expect(store.monthlySubscriptionTotals().get('USD')?.minor).toBe(1399)
  })

  it('hydrate rebuilds every registry so upcoming() is complete', async () => {
    const r = repos()
    await r.documents.save(new Document({ name: 'Passport', kind: 'passport', expiresOn: today.addDays(20) }))
    await r.possessions.save(new Possession({ name: 'Espresso', warrantyUntil: today.addDays(10) }))
    const store = createVaultStore(r)
    expect(store.upcoming(range)).toHaveLength(0) // not hydrated yet
    await store.hydrate()
    const labels = store.upcoming(range).map((u) => u.label)
    expect(labels).toContain('Passport')
    expect(labels).toContain('Espresso (warranty)')
  })

  it('addContact persists and reflects in contacts()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addContact(contact())
    expect(store.contacts()).toHaveLength(1)
    expect(await r.contacts.list()).toHaveLength(1)
  })

  it('recordContact sets staleness to 0', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addContact(contact('Sam', { lastContactedOn: today.addDays(-30) }))
    await store.recordContact(saved.id, today)
    const c = (store.contacts()[0] as Contact)
    expect(c.staleness(today)).toBe(0)
  })

  it('removeContact cascade-deletes only that contact\'s gift ideas', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const a = await store.addContact(contact('A'))
    const b = await store.addContact(contact('B'))
    await store.addGiftIdea(new GiftIdea({ text: 'for A', contactId: a.id }))
    await store.addGiftIdea(new GiftIdea({ text: 'for B', contactId: b.id }))
    await store.removeContact(a.id)
    expect(store.contacts().map((c) => c.name)).toEqual(['B'])
    expect(store.giftIdeas().map((g) => g.text)).toEqual(['for B'])
    expect(await r.giftIdeas.list()).toHaveLength(1)
  })

  it('addGiftIdea / removeGiftIdea / giftIdeas()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const c = await store.addContact(contact())
    const g = await store.addGiftIdea(new GiftIdea({ text: 'kettle', contactId: c.id }))
    expect(store.giftIdeas()).toHaveLength(1)
    await store.removeGiftIdea(g.id)
    expect(store.giftIdeas()).toHaveLength(0)
  })
})
