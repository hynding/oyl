import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey, DayRange, Contact, GiftIdea } from '@oyl/all-of-oyl'
import { createVaultStore } from './vault-store.js'

const today = DayKey.of('2026-06-13')
const range = DayRange.of(today, today.addDays(90))

/** @param {string} [name] @param {Record<string, unknown>} [opts] */
const contact = (name = 'Sam', opts = {}) => new Contact({ name, ...opts })

/** @param {Record<string, unknown>} [opts] */
const sub = (opts = {}) => new Subscription({
  name: 'Netflix', amount: Money.of(1399, 'USD', 2), cadence: Cadence.of(1, 'months'),
  anchor: today, category: 'entertainment', ...opts,
})

/** Five in-memory repositories, the shape createVaultStore expects. */
function repos() {
  return {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
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
    const before = /** @type {import('@oyl/all-of-oyl').DayKey} */ (saved.nextDueOn(today)) // never renewed → pending = anchor (today)
    await store.renew(saved.id, today)
    const renewed = /** @type {import('@oyl/all-of-oyl').Subscription} */ (store.subscriptions()[0])
    const after = /** @type {import('@oyl/all-of-oyl').DayKey} */ (renewed.nextDueOn(today))
    expect(after.compare(before)).toBeGreaterThan(0)
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
    const c = /** @type {Contact} */ (store.contacts()[0])
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
