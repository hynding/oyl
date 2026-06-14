import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Contact } from '@oyl/all-of-oyl'
import { createVaultStore } from '../state/vault-store.js'
import { defineGiftIdeaForm } from './oyl-gift-idea-form.js'

beforeAll(() => defineGiftIdeaForm())

function realStore() {
  const repos = {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
  return createVaultStore(repos)
}
/** @param {any} store */
function form(store) {
  const el = /** @type {import('./oyl-gift-idea-form.js').OylGiftIdeaForm} */ (document.createElement('oyl-gift-idea-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('<oyl-gift-idea-form>', () => {
  it('adds a gift idea for the selected contact', async () => {
    const store = realStore()
    const sam = await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'input[name="giftText"]').value = 'kettle'
    q(el, 'select[name="giftContact"]').value = sam.id
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const ideas = /** @type {any[]} */ (store.giftIdeas())
    expect(ideas).toHaveLength(1)
    expect(ideas[0].text).toBe('kettle')
    expect(ideas[0].contactId).toBe(sam.id)
    el.remove()
  })

  it('empty text shows an error and does not add', async () => {
    const store = realStore()
    await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.giftIdeas()).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('with no contacts shows the hint and hides the form', async () => {
    const el = form(realStore())
    await settle()
    expect(q(el, '.hint').hidden).toBe(false)
    expect(q(el, 'form').hidden).toBe(true)
    el.remove()
  })

  it('(R8) preserves typed text across a reactive refresh', async () => {
    const store = realStore()
    await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'input[name="giftText"]').value = 'half-typed'
    await store.addContact(new Contact({ name: 'Alex' })) // bumps revision → form track re-runs
    await settle()
    expect(q(el, 'input[name="giftText"]').value).toBe('half-typed')
    expect(q(el, 'select[name="giftContact"]').options).toHaveLength(2)
    el.remove()
  })
})
