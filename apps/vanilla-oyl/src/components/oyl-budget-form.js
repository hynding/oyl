import { Budget, Money } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/budgets-store.js').createBudgetsStore>} BudgetsStore */

const CATEGORIES = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']
const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr 6rem auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylBudgetForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {BudgetsStore} */
    this.store = /** @type {BudgetsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const category = document.createElement('select')
    category.name = 'category'
    category.setAttribute('aria-label', 'Category')
    for (const c of CATEGORIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      category.append(o)
    }
    const limit = document.createElement('input')
    limit.name = 'limit'
    limit.type = 'number'
    limit.min = '0'
    limit.step = 'any'
    limit.placeholder = 'Limit'
    const currency = document.createElement('select')
    currency.name = 'currency'
    currency.setAttribute('aria-label', 'Currency')
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add budget'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(category, limit, currency, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const budget = new Budget({ category: category.value, limit: Money.fromMajor(Number(limit.value), currency.value) })
        await this.store.add(budget)
        limit.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineBudgetForm() {
  if (!customElements.get('oyl-budget-form')) customElements.define('oyl-budget-form', OylBudgetForm)
}
