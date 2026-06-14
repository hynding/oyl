import { Account } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylAccountForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {AccountsStore} */
    this.store = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const name = document.createElement('input')
    name.name = 'name'
    name.placeholder = 'Account name'
    name.setAttribute('aria-label', 'Account name')
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
    add.textContent = 'Add account'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(name, currency, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const account = new Account({ name: name.value.trim(), currency: currency.value })
        await this.store.add(account)
        name.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineAccountForm() {
  if (!customElements.get('oyl-account-form')) customElements.define('oyl-account-form', OylAccountForm)
}
