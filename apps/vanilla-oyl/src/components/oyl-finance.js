import { DayKey, periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { formatMoney } from '../vault/format.js'
import { defineFinanceComposer } from './oyl-finance-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'
import { defineBudgetForm } from './oyl-budget-form.js'
import { defineBudgetRow } from './oyl-budget-row.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/budgets-store.js').createBudgetsStore>} BudgetsStore */

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  oyl-finance-composer { display: block; margin-block-end: 1.6rem; }
  oyl-budget-form { display: block; margin: .4rem 0 .8rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .2rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
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
  }

  render() {
    defineFinanceComposer()
    defineVaultItem()
    defineBudgetForm()
    defineBudgetRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h2 = document.createElement('h2')
    h2.textContent = 'Finance'
    h2.tabIndex = -1
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    const composer = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Expense added' }
    const label = document.createElement('div')
    label.className = 'section-label'
    label.textContent = 'This month'
    const list = document.createElement('ol')
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

    root.append(h2, live, composer, label, list, empty, budgetLabelEl, budgetForm, budgetList, budgetEmpty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const txs = [...this.store.transactionsIn(range)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const tx of txs) {
        const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
        item.label = `${tx.category} · ${formatMoney(tx.amount)}`
        item.lines = [DayKey.from(tx.occurredAt, this.tz).value, tx.note]
        item.onDelete = () => { void this.store.remove(tx.id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(item)
        list.append(li)
      }
      empty.hidden = txs.length > 0
      empty.textContent = empty.hidden ? '' : 'No transactions this month.'

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
    })
  }
}

/** Register the element (idempotent). */
export function defineFinance() {
  if (!customElements.get('oyl-finance')) customElements.define('oyl-finance', OylFinance)
}
