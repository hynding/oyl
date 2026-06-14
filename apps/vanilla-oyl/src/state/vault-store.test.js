import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Document, Possession, DayKey, DayRange } from '@oyl/all-of-oyl'
import { createVaultStore } from './vault-store.js'

const today = DayKey.of('2026-06-13')
const range = DayRange.of(today, today.addDays(90))

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
})
