import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository } from '@oyl/all-of-oyl'
import { createAccountsStore } from '../state/accounts-store.js'
import { defineAccountForm } from './oyl-account-form.js'

beforeAll(() => defineAccountForm())
const settle = () => new Promise((r) => setTimeout(r, 0))

/** @param {any} store */
function form(store) {
  const el = /** @type {any} */ (document.createElement('oyl-account-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-account-form>', () => {
  it('adds an account with the typed name and selected currency', async () => {
    const store = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = 'Visa'
    q(el, 'select[name="currency"]').value = 'EUR'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const accounts = store.all()
    expect(accounts).toHaveLength(1)
    const first = /** @type {NonNullable<typeof accounts[0]>} */ (accounts[0])
    expect(first.name).toBe('Visa')
    expect(first.currency).toBe('EUR')
    el.remove()
  })

  it('shows an inline error and adds nothing for an empty name', async () => {
    const store = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = '   '
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.all()).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
