import { describe, expect, it, beforeAll, vi } from 'vitest'
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey } from '@oyl/all-of-oyl'
import { createVaultStore } from '../state/vault-store.js'
import { now } from '../storage/clock.js'
import { defineVault } from './oyl-vault.js'

beforeAll(() => defineVault())

const TZ = 'UTC'
const today = () => DayKey.from(now(), TZ)

/** Build a hydrated vault store: a document at +60d and a possession warranty at +10d. */
async function seededStore() {
  const repos = {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
  await repos.documents.save(new Document({ name: 'Passport', kind: 'passport', expiresOn: today().addDays(60) }))
  await repos.possessions.save(new Possession({ name: 'Espresso', warrantyUntil: today().addDays(10) }))
  await repos.subscriptions.save(new Subscription({ name: 'Spotify', amount: Money.of(999, 'USD', 2), cadence: Cadence.of(1, 'months'), anchor: today(), category: 'entertainment' }))
  const store = createVaultStore(repos)
  await store.hydrate()
  return store
}

/** @param {any} store */
function screen(store) {
  const el = /** @type {import('./oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
  el.store = store
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-vault>', () => {
  it('renders the upcoming feed plus Documents and Possessions', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Upcoming')
    expect(text).toContain('Passport')
    expect(text).toContain('Espresso')
    expect(root(el).querySelectorAll('oyl-vault-item')).toHaveLength(2) // 1 doc + 1 possession
    el.remove()
  })

  it('horizon change re-filters the feed', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const sel = /** @type {HTMLSelectElement} */ (root(el).querySelector('select'))
    sel.value = '30'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve() // let the reactive scheduler repaint the feed
    const feed = root(el).querySelector('.upcoming-list')?.textContent ?? ''
    expect(feed).toContain('Espresso')   // warranty +10d, inside 30
    expect(feed).not.toContain('Passport') // expiry +60d, outside 30
    el.remove()
  })

  it('adding through the store repaints the lists', async () => {
    const store = await seededStore()
    const el = screen(store)
    await Promise.resolve()
    await store.addDocument(new Document({ name: 'Will', kind: 'legal' }))
    await Promise.resolve() // let the reactive scheduler repaint the lists
    // 'Will' has no due date, so it appears only in the Documents list (its own
    // shadow DOM), not the upcoming feed — assert via the item's label property.
    const labels = [...root(el).querySelectorAll('oyl-vault-item')].map((i) => /** @type {any} */ (i).label)
    expect(labels).toContain('Will')
    el.remove()
  })

  it('deleting an item calls the store and removes it', async () => {
    const store = await seededStore()
    const removeSpy = vi.spyOn(store, 'removePossession')
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const espresso = items.find((i) => (i.label ?? '').includes('Espresso'))
    const r = /** @type {ShadowRoot} */ (espresso.shadowRoot)
    ;/** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]')).click()
    await Promise.resolve(); await Promise.resolve()
    expect(removeSpy).toHaveBeenCalled()
    el.remove()
  })

  it('renders the Subscriptions section with a monthly total', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Subscriptions')
    expect(text).toContain('Spotify')
    expect(root(el).querySelectorAll('oyl-subscription-row')).toHaveLength(1)
    const total = root(el).querySelector('.monthly-total')?.textContent ?? ''
    expect(total).toContain('$9.99')
    el.remove()
  })

  it('renew advances a subscription and delete removes it', async () => {
    const store = await seededStore()
    const renewSpy = vi.spyOn(store, 'renew')
    const removeSpy = vi.spyOn(store, 'removeSubscription')
    const el = screen(store)
    await Promise.resolve()
    const row1 = /** @type {any} */ (root(el).querySelector('oyl-subscription-row'))
    const renewBtn = /** @type {HTMLButtonElement} */ (row1.shadowRoot.querySelector('button[data-act="renew"]'))
    renewBtn.click()
    await Promise.resolve(); await Promise.resolve()
    expect(renewSpy).toHaveBeenCalled()
    const row2 = /** @type {any} */ (root(el).querySelector('oyl-subscription-row'))
    const delBtn = /** @type {HTMLButtonElement} */ (row2.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const yes = /** @type {HTMLButtonElement} */ (row2.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await Promise.resolve(); await Promise.resolve()
    expect(removeSpy).toHaveBeenCalled()
    el.remove()
  })
})
