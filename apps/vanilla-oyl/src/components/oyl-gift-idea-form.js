import { GiftIdea, Id } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  .hint { color: var(--color-muted); font-size: var(--step--1); padding: .5rem 0; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylGiftIdeaForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = 'Add a contact first.'

    const formEl = document.createElement('form')
    const text = document.createElement('input')
    text.name = 'giftText'
    text.type = 'text'
    text.placeholder = 'Gift idea'
    const select = document.createElement('select')
    select.name = 'giftContact'
    select.setAttribute('aria-label', 'Contact')
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')
    formEl.append(text, select, add, error)

    root.append(hint, formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const idea = new GiftIdea({ text: text.value, contactId: Id.of(select.value) })
        await this.store.addGiftIdea(idea)
        text.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })

    // R8: build DOM once; only refresh the <select> options + toggle the guard here.
    this.track(() => {
      const contacts = this.store.contacts()
      const has = contacts.length > 0
      hint.hidden = has
      formEl.hidden = !has
      const prev = select.value
      select.replaceChildren()
      for (const c of contacts) {
        const o = document.createElement('option')
        o.value = c.id
        o.textContent = c.name
        select.append(o)
      }
      if (contacts.some((c) => c.id === prev)) select.value = prev
    })
  }
}

/** Register the element (idempotent). */
export function defineGiftIdeaForm() {
  if (!customElements.get('oyl-gift-idea-form')) customElements.define('oyl-gift-idea-form', OylGiftIdeaForm)
}
