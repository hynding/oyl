import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineAuthForm } from './oyl-auth-form.js'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .alt { margin-block-start: var(--space-4); }
  a { color: var(--color-accent); }
`)

export class OylLogin extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {any} */ this.auth = undefined
    /** @type {() => void} */ this.onAuthenticated = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineAuthForm()
    const h2 = document.createElement('h2'); h2.textContent = 'Sign in'; h2.setAttribute('tabindex', '-1')
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = this.auth; form.mode = 'login'; form.onSuccess = () => this.onAuthenticated()
    const alt = document.createElement('div'); alt.className = 'alt'
    const reg = document.createElement('a'); reg.href = '/register'; reg.textContent = 'Create an account'
    alt.append(reg)
    root.append(h2, form, alt)
  }
}

/** Register the element (idempotent). */
export function defineLogin() {
  if (!customElements.get('oyl-login')) customElements.define('oyl-login', OylLogin)
}
