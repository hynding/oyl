import { Transaction, Money } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']
const EXPENSE_CATEGORIES = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']
const INCOME_CATEGORIES = ['salary', 'freelance', 'gift', 'refund', 'other']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .price { display: grid; grid-template-columns: 1fr auto; gap: .5rem; }
  .price select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylFinanceComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {(direction?: 'expense' | 'income') => void} */
    this.onAdded = () => {}
    /** @type {AccountsStore} */
    this.accounts = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
    this._direction = /** @type {import('../lib/reactive/signal.js').Signal<'expense' | 'income'>} */ (signal('expense'))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Direction')
    const expenseBtn = this._segButton('expense', 'Expense')
    const incomeBtn = this._segButton('income', 'Income')
    seg.append(expenseBtn, incomeBtn)

    const amount = this._input('amount', 'number')
    amount.min = '0'
    amount.step = 'any'
    amount.setAttribute('aria-label', 'Amount')
    const currency = document.createElement('select')
    currency.name = 'currency'
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    currency.setAttribute('aria-label', 'Currency')
    const priceWrap = document.createElement('div')
    priceWrap.className = 'price'
    priceWrap.append(amount, currency)

    const category = document.createElement('select')
    category.name = 'category'
    for (const c of EXPENSE_CATEGORIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      category.append(o)
    }

    const account = document.createElement('select')
    account.name = 'account'
    const syncCurrencyVisibility = () => { currency.hidden = account.value !== '' }
    account.addEventListener('change', syncCurrencyVisibility, { signal: this.lifecycle })

    const date = this._input('date', 'date')
    date.value = now().toISOString().slice(0, 10)
    const note = this._input('note', 'text')

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add expense'
    actions.append(submit)

    formEl.append(
      seg,
      this._labeled('amount', 'Amount', priceWrap),
      this._labeled('account', 'Account', account),
      this._labeled('category', 'Category', category),
      this._labeled('date', 'Date', date),
      this._labeled('note', 'Note (optional)', note),
      error, actions,
    )
    root.append(formEl)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, amount, currency, category, date, note, account })
    }, { signal: this.lifecycle })

    this.track(() => {
      const list = this.accounts.all()
      const prev = account.value
      account.replaceChildren()
      const cash = document.createElement('option')
      cash.value = ''
      cash.textContent = 'Cash (no account)'
      account.append(cash)
      for (const a of list) {
        const o = document.createElement('option')
        o.value = a.id
        o.textContent = `${a.name} · ${a.currency}`
        account.append(o)
      }
      account.value = list.some((a) => a.id === prev) ? prev : ''
      syncCurrencyVisibility()
      const dir = this._direction.get()
      const cats = dir === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
      const prevCat = category.value
      category.replaceChildren()
      for (const c of cats) {
        const o = document.createElement('option')
        o.value = c
        o.textContent = c
        category.append(o)
      }
      category.value = cats.includes(prevCat) ? prevCat : (cats[0] ?? '')
      expenseBtn.setAttribute('aria-pressed', String(dir === 'expense'))
      incomeBtn.setAttribute('aria-pressed', String(dir === 'income'))
      submit.textContent = dir === 'income' ? 'Add income' : 'Add expense'
    })
  }

  /** @param {{ error: HTMLElement, amount: HTMLInputElement, currency: HTMLSelectElement, category: HTMLSelectElement, date: HTMLInputElement, note: HTMLInputElement, account: HTMLSelectElement }} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    if (!ctx.date.value) { ctx.error.textContent = 'Pick a date'; return }
    const amt = Number(ctx.amount.value)
    if (!(amt > 0)) { ctx.error.textContent = 'Amount must be positive'; return }
    try {
      const selectedId = ctx.account.value
      const acc = selectedId ? this.accounts.all().find((a) => a.id === selectedId) : undefined
      const currency = acc ? acc.currency : ctx.currency.value
      const props = /** @type {{ occurredAt: Date, amount: Money, category: string, direction: 'expense' | 'income', note?: string, account?: { id: import('@oyl/all-of-oyl').Id, currency: string } }} */ ({
        occurredAt: new Date(`${ctx.date.value}T12:00:00`),
        amount: Money.fromMajor(amt, currency),
        category: ctx.category.value,
        direction: this._direction.get(),
      })
      if (acc) props.account = { id: acc.id, currency: acc.currency }
      if (ctx.note.value) props.note = ctx.note.value
      await this.store.add(new Transaction(props))
      ctx.amount.value = ''
      ctx.note.value = ''
      this.onAdded(this._direction.get())
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {'expense' | 'income'} value @param {string} label @returns {HTMLButtonElement} */
  _segButton(value, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.value = value
    b.textContent = label
    b.addEventListener('click', () => this._direction.set(value), { signal: this.lifecycle })
    return b
  }

  /** @param {string} name @param {string} type @returns {HTMLInputElement} */
  _input(name, type) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    return i
  }

  /** @param {string} forName @param {string} text @param {HTMLElement} control @returns {HTMLElement} */
  _labeled(forName, text, control) {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const label = document.createElement('label')
    label.textContent = text
    label.htmlFor = forName
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineFinanceComposer() {
  if (!customElements.get('oyl-finance-composer')) customElements.define('oyl-finance-composer', OylFinanceComposer)
}
