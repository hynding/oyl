import { Document, Possession, Money, DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .price { display: grid; grid-template-columns: 1fr auto; gap: .5rem; }
  .price select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylVaultComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
    this._type = signal('document')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Item type')
    const docBtn = document.createElement('button')
    docBtn.type = 'button'
    docBtn.dataset.type = 'document'
    docBtn.textContent = 'Document'
    const posBtn = document.createElement('button')
    posBtn.type = 'button'
    posBtn.dataset.type = 'possession'
    posBtn.textContent = 'Possession'
    seg.append(docBtn, posBtn)

    const name = this._input('name', 'text')

    // Document-only fields
    const kind = this._input('kind', 'text')
    const expiresOn = this._input('expiresOn', 'date')
    const kindField = this._labeled('kind', 'Kind', kind)
    const expiresField = this._labeled('expiresOn', 'Expires (optional)', expiresOn)

    // Possession-only fields
    const location = this._input('location', 'text')
    const warrantyUntil = this._input('warrantyUntil', 'date')
    const amount = this._input('amount', 'number')
    amount.min = '0'
    amount.step = '0.01'
    const currency = document.createElement('select')
    currency.name = 'currency'
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const purchasedOn = this._input('purchasedOn', 'date')
    const priceWrap = document.createElement('div')
    priceWrap.className = 'price'
    priceWrap.append(amount, currency)
    const locationField = this._labeled('location', 'Location (optional)', location)
    const warrantyField = this._labeled('warrantyUntil', 'Warranty until (optional)', warrantyUntil)
    const priceField = this._labeled('amount', 'Price (optional)', priceWrap)
    const purchasedField = this._labeled('purchasedOn', 'Purchased (optional)', purchasedOn)

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add to vault'
    actions.append(submit)

    formEl.append(
      seg,
      this._labeled('name', 'Name', name),
      kindField, expiresField,
      locationField, warrantyField, priceField, purchasedField,
      error, actions,
    )
    root.append(formEl)

    /** @param {string} type */
    const applyType = (type) => {
      const isDoc = type === 'document'
      kindField.hidden = !isDoc
      expiresField.hidden = !isDoc
      locationField.hidden = isDoc
      warrantyField.hidden = isDoc
      priceField.hidden = isDoc
      purchasedField.hidden = isDoc
      docBtn.setAttribute('aria-pressed', String(isDoc))
      posBtn.setAttribute('aria-pressed', String(!isDoc))
    }
    applyType(this._type.get())
    docBtn.addEventListener('click', () => { this._type.set('document'); applyType('document') }, { signal: this.lifecycle })
    posBtn.addEventListener('click', () => { this._type.set('possession'); applyType('possession') }, { signal: this.lifecycle })

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, name, kind, expiresOn, location, warrantyUntil, amount, currency, purchasedOn, formEl })
    }, { signal: this.lifecycle })
  }

  /**
   * @param {{ error: HTMLElement, name: HTMLInputElement, kind: HTMLInputElement, expiresOn: HTMLInputElement,
   *   location: HTMLInputElement, warrantyUntil: HTMLInputElement, amount: HTMLInputElement,
   *   currency: HTMLSelectElement, purchasedOn: HTMLInputElement, formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    try {
      if (this._type.get() === 'document') {
        const props = /** @type {{ name: string, kind: string, expiresOn?: DayKey }} */ ({ name: ctx.name.value, kind: ctx.kind.value })
        if (ctx.expiresOn.value) props.expiresOn = DayKey.of(ctx.expiresOn.value)
        await this.store.addDocument(new Document(props))
      } else {
        const props = /** @type {{ name: string, location?: string, warrantyUntil?: DayKey, purchasePrice?: Money, purchasedOn?: DayKey }} */ ({ name: ctx.name.value })
        if (ctx.location.value) props.location = ctx.location.value
        if (ctx.warrantyUntil.value) props.warrantyUntil = DayKey.of(ctx.warrantyUntil.value)
        const amt = Number(ctx.amount.value)
        if (ctx.amount.value && amt > 0) props.purchasePrice = Money.fromMajor(amt, ctx.currency.value)
        if (ctx.purchasedOn.value) props.purchasedOn = DayKey.of(ctx.purchasedOn.value)
        await this.store.addPossession(new Possession(props))
      }
      ctx.formEl.reset()
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {string} type @param {string} label @returns {HTMLButtonElement} */
  _segButton(type, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.type = type
    b.textContent = label
    b.addEventListener('click', () => this._type.set(type), { signal: this.lifecycle })
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
    control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineVaultComposer() {
  if (!customElements.get('oyl-vault-composer')) customElements.define('oyl-vault-composer', OylVaultComposer)
}
