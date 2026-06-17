import { DayKey, periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { formatMoney } from '@oyl/all-of-oyl/format'
import { defineFinanceComposer } from './oyl-finance-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'
import { defineBudgetForm } from './oyl-budget-form.js'
import { defineBudgetRow } from './oyl-budget-row.js'
import { defineAccountForm } from './oyl-account-form.js'
import { accountSpendLabel } from '../account/format.js'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/budgets-store.js').createBudgetsStore>} BudgetsStore */
/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  oyl-finance-composer { display: block; margin-block-end: 1.6rem; }
  oyl-budget-form { display: block; margin: .4rem 0 .8rem; }
  oyl-account-form { display: block; margin: .4rem 0 .8rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .2rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  select.ledger-filter { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .35rem .5rem; margin-block-end: .6rem; }
`)

export class OylFinance extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {BudgetsStore} */
    this.budgets = /** @type {BudgetsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {AccountsStore} */
    this.accounts = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
    this._filter = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (signal(''))
  }

  render() {
    defineFinanceComposer()
    defineVaultItem()
    defineBudgetForm()
    defineBudgetRow()
    defineAccountForm()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h2 = document.createElement('h2')
    h2.textContent = 'Finance'
    h2.tabIndex = -1
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    const composer = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
    composer.store = this.store
    composer.accounts = this.accounts
    composer.onAdded = (dir) => { live.textContent = dir === 'income' ? 'Income added' : 'Expense added' }
    const label = document.createElement('div')
    label.className = 'section-label'
    label.textContent = 'This month'
    const list = document.createElement('ol')
    list.className = 'ledger'
    const filterSel = document.createElement('select')
    filterSel.className = 'ledger-filter'
    filterSel.setAttribute('aria-label', 'Filter by account')
    filterSel.addEventListener('change', () => this._filter.set(filterSel.value), { signal: this.lifecycle })
    const empty = document.createElement('div')
    empty.className = 'empty'

    const budgetLabelEl = document.createElement('div')
    budgetLabelEl.className = 'section-label'
    budgetLabelEl.textContent = 'Budgets'
    const budgetForm = /** @type {import('./oyl-budget-form.js').OylBudgetForm} */ (document.createElement('oyl-budget-form'))
    budgetForm.store = this.budgets
    budgetForm.onAdded = () => { live.textContent = 'Budget added' }
    const budgetList = document.createElement('ol')
    const budgetEmpty = document.createElement('div')
    budgetEmpty.className = 'empty'

    const accountLabelEl = document.createElement('div')
    accountLabelEl.className = 'section-label'
    accountLabelEl.textContent = 'Accounts'
    const accountForm = /** @type {import('./oyl-account-form.js').OylAccountForm} */ (document.createElement('oyl-account-form'))
    accountForm.store = this.accounts
    accountForm.onAdded = () => { live.textContent = 'Account added' }
    const accountList = document.createElement('ol')
    const accountEmpty = document.createElement('div')
    accountEmpty.className = 'empty'

    root.append(h2, live, composer, label, filterSel, list, empty, budgetLabelEl, budgetForm, budgetList, budgetEmpty, accountLabelEl, accountForm, accountList, accountEmpty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const accts = this.accounts.all()

      const raw = this._filter.get()
      const filter = raw === '' || raw === 'cash' || accts.some((a) => a.id === raw) ? raw : ''
      const mk = (/** @type {string} */ value, /** @type {string} */ text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o }
      filterSel.replaceChildren(mk('', 'All accounts'), mk('cash', 'Cash'))
      for (const a of accts) filterSel.append(mk(a.id, a.name))
      filterSel.value = filter
      filterSel.hidden = accts.length === 0

      const nameById = new Map(accts.map((a) => [a.id, a.name]))
      const txs = [...this.store.transactionsIn(range)]
        .filter((tx) => (filter === '' ? true : filter === 'cash' ? !tx.accountId : tx.accountId === filter))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const tx of txs) {
        const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
        const sign = tx.direction === 'income' ? '+' : ''
        item.label = `${tx.category} · ${sign}${formatMoney(tx.amount)}`
        const acctName = tx.accountId ? nameById.get(tx.accountId) : undefined
        item.lines = [`${DayKey.from(tx.occurredAt, this.tz).value}${acctName ? ` · ${acctName}` : ''}`, tx.note]
        item.onDelete = () => { void this.store.remove(tx.id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(item)
        list.append(li)
      }
      empty.hidden = txs.length > 0
      empty.textContent = txs.length > 0 ? '' : filter === '' ? 'No transactions this month.' : 'No transactions for this view.'

      const budgets = this.budgets.all()
      budgetList.replaceChildren()
      for (const b of budgets) {
        const row = /** @type {import('./oyl-budget-row.js').OylBudgetRow} */ (document.createElement('oyl-budget-row'))
        row.budget = b
        row.status = this.store.budgetStatus(b, today)
        row.onDelete = (id) => { void this.budgets.remove(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(row)
        budgetList.append(li)
      }
      budgetEmpty.hidden = budgets.length > 0
      budgetEmpty.textContent = budgets.length > 0 ? '' : 'No budgets yet.'

      const accounts = this.accounts.all()
      accountList.replaceChildren()
      for (const a of accounts) {
        const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
        item.label = a.name
        item.lines = [
          `${a.currency} · ${formatMoney(this.store.accountBalance(a))}`,
          accountSpendLabel(this.store.accountSpend(a, today)),
        ]
        item.onDelete = () => { void this.accounts.remove(a.id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(item)
        accountList.append(li)
      }
      accountEmpty.hidden = accounts.length > 0
      accountEmpty.textContent = accounts.length > 0 ? '' : 'No accounts yet.'
    })
  }
}

/** Register the element (idempotent). */
export function defineFinance() {
  if (!customElements.get('oyl-finance')) customElements.define('oyl-finance', OylFinance)
}
