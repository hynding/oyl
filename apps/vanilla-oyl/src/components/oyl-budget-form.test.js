import { describe, expect, it, beforeAll } from 'vitest'
import { Budget } from '@oyl/all-of-oyl'
import { defineBudgetForm } from './oyl-budget-form.js'

beforeAll(() => defineBudgetForm())
/** @param {{ add?: (b: any) => Promise<any> }} store */
function form(store) {
  const el = /** @type {import('./oyl-budget-form.js').OylBudgetForm} */ (document.createElement('oyl-budget-form'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-budget-form>', () => {
  it('adds a budget with category + limit', async () => {
    const added = /** @type {any[]} */ ([])
    const el = form({ add: async (b) => { added.push(b); return b } })
    q(el, 'select[name="category"]').value = 'groceries'
    q(el, 'input[name="limit"]').value = '500'
    q(el, 'select[name="currency"]').value = 'USD'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Budget)
    expect(added[0].category).toBe('groceries')
    expect(added[0].limit.minor).toBe(50000)
    el.remove()
  })

  it('rejects a non-positive limit with an inline error', async () => {
    const added = /** @type {any[]} */ ([])
    const el = form({ add: async (b) => { added.push(b); return b } })
    q(el, 'input[name="limit"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
