import { describe, expect, it, beforeAll } from 'vitest'
import { Transaction } from '@oyl/all-of-oyl'
import { defineFinanceComposer } from './oyl-finance-composer.js'

beforeAll(() => defineFinanceComposer())
/** @param {{ add?: (e: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
  el.store = /** @type {any} */ (store)
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
