import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Transaction, Budget, Money } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createBudgetsStore } from '../state/budgets-store.js'
import { defineFinance } from './oyl-finance.js'

beforeAll(() => defineFinance())
const TZ = 'UTC'
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {number} h @returns {Date} */
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d }
/** @param {string} cat @param {number} minor @param {Date} when @returns {any} */
const tx = (cat, minor, when) => new Transaction({ occurredAt: when, amount: Money.of(minor, 'USD', 2), category: cat, direction: 'expense' })

/** @param {any} store @param {any} [budgets] */
function screen(store, budgets = createBudgetsStore(new InMemoryRepository())) {
  const el = /** @type {import('./oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
  el.store = store
  el.budgets = budgets
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-finance>', () => {
  it("lists this month's transactions newest-first", async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6500, at(9)))
    await store.add(tx('dining', 3000, at(13)))
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    expect(items).toHaveLength(2)
    expect(items[0].label).toContain('dining')
    expect(items[0].label).toContain('$30.00')
    expect(items[1].label).toContain('groceries')
    el.remove()
  })

  it('empty store shows the empty state', async () => {
    const el = screen(createJournalStore(new InMemoryRepository(), TZ))
    await Promise.resolve()
    expect(root(el).textContent).toContain('No transactions this month.')
    el.remove()
  })

  it('renders a Budgets section with per-budget progress', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6000, at(10)))          // $60 spent this month
    const budgets = createBudgetsStore(/** @type {any} */ (new InMemoryRepository()))
    await budgets.add(new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) })) // $100
    const el = screen(store, budgets)
    await Promise.resolve()
    const rowsList = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-budget-row')])
    expect(rowsList).toHaveLength(1)
    expect(rowsList[0].shadowRoot.textContent).toContain('groceries')
    expect(rowsList[0].shadowRoot.textContent).toContain('$40.00 left')   // 100 - 60
    el.remove()
  })

  it('deleting a transaction removes it', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6500, at(10)))
    const el = screen(store)
    await Promise.resolve()
    const item = /** @type {any} */ (root(el).querySelector('oyl-vault-item'))
    const del = /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="delete"]'))
    del.click()
    const yes = /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await settle()
    expect(root(el).querySelectorAll('oyl-vault-item')).toHaveLength(0)
    el.remove()
  })
})
