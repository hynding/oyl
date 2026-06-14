import { describe, expect, it, beforeAll } from 'vitest'
import { Transaction } from '@oyl/all-of-oyl'
import { InMemoryRepository, Account } from '@oyl/all-of-oyl'
import { defineFinanceComposer } from './oyl-finance-composer.js'
import { createAccountsStore } from '../state/accounts-store.js'

beforeAll(() => defineFinanceComposer())
/** @param {{ add?: (e: any) => Promise<any> }} store @param {any} [accounts] */
function composer(store, accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))) {
  const el = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
  el.store = /** @type {any} */ (store)
  el.accounts = /** @type {any} */ (accounts)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-finance-composer>', () => {
  it('adds an expense transaction with amount, category, date, note', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } })
    q(el, 'input[name="amount"]').value = '65'
    q(el, 'select[name="currency"]').value = 'USD'
    q(el, 'select[name="category"]').value = 'groceries'
    q(el, 'input[name="date"]').value = '2026-06-10'
    q(el, 'input[name="note"]').value = 'market'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Transaction)
    expect(added[0].direction).toBe('expense')
    expect(added[0].amount.minor).toBe(6500)
    expect(added[0].category).toBe('groceries')
    expect(added[0].note).toBe('market')
    expect(added[0].occurredAt.getFullYear()).toBe(2026)
    expect(added[0].occurredAt.getMonth()).toBe(5)
    expect(added[0].occurredAt.getDate()).toBe(10)
    el.remove()
  })

  it('rejects a non-positive amount with an inline error (R-C)', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } })
    q(el, 'input[name="amount"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})

describe('<oyl-finance-composer> account picker', () => {
  it('defaults to Cash with the currency select visible', async () => {
    const el = composer({ add: async (e) => e })
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    expect(acct).toBeTruthy()
    expect(acct.value).toBe('')
    expect([...acct.options].map((o) => o.textContent)).toContain('Cash (no account)')
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })

  it('hides the currency select when an account is selected, shows it for Cash', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    acct.value = acc.id
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(true)
    acct.value = ''
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })

  it('refreshes account options reactively without clobbering a typed amount (R-A)', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    q(el, 'input[name="amount"]').value = '42'
    await accts.add(new Account({ name: 'Visa', currency: 'EUR' }))
    await Promise.resolve()
    const opts = [...q(el, 'select[name="account"]').options].map((o) => o.textContent)
    expect(opts).toContain('Visa · EUR')
    expect(q(el, 'input[name="amount"]').value).toBe('42')
    el.remove()
  })

  it('resets the selection to Cash when the selected account is deleted (R-K)', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    acct.value = acc.id
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(true)
    await accts.remove(acc.id)
    await Promise.resolve()
    expect(acct.value).toBe('')
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })
})
