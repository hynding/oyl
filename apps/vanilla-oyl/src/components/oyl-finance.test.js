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

  it('shows a + sign on income ledger rows, not on expenses', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income' }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const salary = items.find((i) => i.label.includes('salary'))
    const dining = items.find((i) => i.label.includes('dining'))
    expect(salary.label).toContain('+')
    expect(dining.label).not.toContain('+')
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

  it('shows the account balance (income minus expense) as the headline, with spend below', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(50000, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const item = /** @type {any} */ ([...root(el).querySelectorAll('oyl-vault-item')].find((i) => /** @type {any} */ (i).label === 'Checking'))
    expect(item.lines[0]).toContain('$1500.00')
    expect(item.lines.join(' ')).toContain('this month')
    el.remove()
  })
})

describe('<oyl-finance> ledger filter', () => {
  /** @param {any} el */
  const ledgerRows = (el) => [...root(el).querySelectorAll('.ledger oyl-vault-item')]
  /** @param {any} el @param {string} value */
  const setFilter = async (el, value) => {
    const f = /** @type {any} */ (root(el).querySelector('select.ledger-filter'))
    f.value = value
    f.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  }

  async function seeded() {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    return { accounts, acc, store }
  }

  it('shows all ledger rows by default', async () => {
    const { accounts, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    expect(ledgerRows(el)).toHaveLength(2)
    el.remove()
  })

  it('filters to a single account', async () => {
    const { accounts, acc, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    const rows = ledgerRows(el)
    expect(rows).toHaveLength(1)
    expect(/** @type {any} */ (rows[0]).label).toContain('groceries')
    el.remove()
  })

  it('filters to Cash (no-account transactions)', async () => {
    const { accounts, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, 'cash')
    const rows = ledgerRows(el)
    expect(rows).toHaveLength(1)
    expect(/** @type {any} */ (rows[0]).label).toContain('dining')
    el.remove()
  })

  it('reverts to All when the selected account is deleted (R-K)', async () => {
    const { accounts, acc, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    expect(ledgerRows(el)).toHaveLength(1)
    await accounts.remove(acc.id)
    await Promise.resolve()
    expect(/** @type {any} */ (root(el).querySelector('select.ledger-filter')).value).toBe('')
    expect(ledgerRows(el)).toHaveLength(2)
    el.remove()
  })

  it('shows an empty message when the filter yields nothing', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Visa', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    expect(ledgerRows(el)).toHaveLength(0)
    expect(root(el).textContent).toContain('No transactions for this view.')
    el.remove()
  })

  it('hides the filter when there are no accounts (R-A)', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    const noAccts = screen(store)
    await Promise.resolve()
    expect(/** @type {any} */ (root(noAccts).querySelector('select.ledger-filter')).hidden).toBe(true)
    noAccts.remove()

    const { accounts, store: s2 } = await seeded()
    const withAccts = screen(s2, undefined, accounts)
    await Promise.resolve()
    expect(/** @type {any} */ (root(withAccts).querySelector('select.ledger-filter')).hidden).toBe(false)
    withAccts.remove()
  })
})
