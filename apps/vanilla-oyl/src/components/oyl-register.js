import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineAuthForm } from './oyl-auth-form.js'
import { defineProfileFields } from './oyl-profile-fields.js'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  details { margin-block-start: var(--space-4); }
  summary { cursor: pointer; color: var(--color-muted); margin-block-end: var(--space-3); }
  .alt { margin-block-start: var(--space-4); }
  a { color: var(--color-accent); }
`)

export class OylRegister extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {any} */ this.auth = undefined
    /** @type {(patch: Record<string, any>) => void} */ this.onAuthenticated = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineAuthForm(); defineProfileFields()
    const h2 = document.createElement('h2'); h2.textContent = 'Create account'; h2.setAttribute('tabindex', '-1')
    const fields = /** @type {any} */ (document.createElement('oyl-profile-fields'))
    fields.value = {}; fields.showSave = false
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = this.auth; form.mode = 'register'
    form.onSuccess = () => this.onAuthenticated(fields.getValues())
    const details = document.createElement('details')
    const summary = document.createElement('summary'); summary.textContent = 'Optional details (timezone, body, location)'
    details.append(summary, fields)
    const alt = document.createElement('div'); alt.className = 'alt'
    const login = document.createElement('a'); login.href = '/login'; login.textContent = 'I already have an account'
    alt.append(login)
    root.append(h2, form, details, alt)
  }
}

/** Register the element (idempotent). */
export function defineRegister() {
  if (!customElements.get('oyl-register')) customElements.define('oyl-register', OylRegister)
}
