import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Transaction, Budget, Money, Account } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createBudgetsStore } from '../state/budgets-store.js'
import { createAccountsStore } from '../state/accounts-store.js'
import { defineFinance } from './oyl-finance.js'

beforeAll(() => defineFinance())
const TZ = 'UTC'
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {number} h @returns {Date} */
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d }
/** @param {string} cat @param {number} minor @param {Date} when @returns {any} */
const tx = (cat, minor, when) => new Transaction({ occurredAt: when, amount: Money.of(minor, 'USD', 2), category: cat, direction: 'expense' })

/** @param {any} store @param {any} [budgets] @param {any} [accounts] */
function screen(store, budgets = createBudgetsStore(new InMemoryRepository()), accounts = createAccountsStore(new InMemoryRepository())) {
  const el = /** @type {import('./oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
  el.store = store
  el.budgets = budgets
  el.accounts = accounts
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

describe('<oyl-finance> accounts', () => {
  it('renders an account with its this-month spend, and deletes it', async () => {
    const accounts = createAccountsStore(new InMemoryRepository())
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', accountId: acc.id }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()

    const item = /** @type {any} */ ([...root(el).querySelectorAll('oyl-vault-item')].find((i) => /** @type {any} */ (i).label === 'Checking'))
    expect(item).toBeTruthy()
    expect(item.lines.join(' ')).toContain('$65.00')
    expect(item.lines.join(' ')).toContain('this month')

    ;/** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="confirm-yes"]')).click()
    await settle()
    expect([...root(el).querySelectorAll('oyl-vault-item')].some((i) => /** @type {any} */ (i).label === 'Checking')).toBe(false)
    el.remove()
  })

  it('adds an account via the inline form', async () => {
    const accounts = createAccountsStore(new InMemoryRepository())
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const fr = /** @type {any} */ (root(el).querySelector('oyl-account-form')).shadowRoot
    ;/** @type {HTMLInputElement} */ (fr.querySelector('input[name="name"]')).value = 'Visa'
    ;/** @type {HTMLFormElement} */ (fr.querySelector('form')).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect([...root(el).querySelectorAll('oyl-vault-item')].some((i) => /** @type {any} */ (i).label === 'Visa')).toBe(true)
    el.remove()
  })

  it('shows the empty state when there are no accounts', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store)
    await Promise.resolve()
    expect(root(el).textContent).toContain('No accounts yet.')
    el.remove()
  })

  it('shows the account name on a ledger row, and nothing for cash/unknown', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const groceries = items.find((i) => i.label.includes('groceries'))
    const dining = items.find((i) => i.label.includes('dining'))
    expect(groceries.lines.join(' ')).toContain('Checking')
    expect(dining.lines.join(' ')).not.toContain('Checking')
    el.remove()
  })
})
