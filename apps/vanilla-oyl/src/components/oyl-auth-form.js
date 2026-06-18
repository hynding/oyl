import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  form { display: grid; gap: .5rem; max-inline-size: 22rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.primary:disabled { opacity: .6; cursor: default; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylAuthForm extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {{ login(i: string, p: string): Promise<unknown>, register(u: string, e: string, p: string): Promise<unknown> }} */
    this.auth = /** @type {any} */ (undefined)
    /** @type {'login'|'register'} */
    this.mode = 'login'
    /** @type {() => void} */
    this.onSuccess = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const isLogin = this.mode === 'login'
    const form = document.createElement('form')
    const fields = isLogin
      ? [this._input('identifier', 'text', 'Username or email', 'username')]
      : [this._input('username', 'text', 'Username', 'username'), this._input('email', 'email', 'Email', 'email')]
    const password = this._input('password', 'password', 'Password', isLogin ? 'current-password' : 'new-password')
    const submit = document.createElement('button')
    submit.type = 'submit'; submit.className = 'primary'
    submit.textContent = isLogin ? 'Sign in' : 'Create account'
    const error = document.createElement('div')
    error.dataset.role = 'error'; error.setAttribute('aria-live', 'polite')
    form.append(...fields, password, submit, error)
    root.append(form)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''; submit.disabled = true
      try {
        if (isLogin) {
          const id = /** @type {HTMLInputElement} */ (form.querySelector('input[name="identifier"]'))
          await this.auth.login(id.value, password.value)
        } else {
          const u = /** @type {HTMLInputElement} */ (form.querySelector('input[name="username"]'))
          const em = /** @type {HTMLInputElement} */ (form.querySelector('input[name="email"]'))
          await this.auth.register(u.value, em.value, password.value)
        }
        this.onSuccess()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      } finally {
        submit.disabled = false
      }
    }, { signal: this.lifecycle })
  }

  /** @param {string} name @param {string} type @param {string} label @param {string} autocomplete @returns {HTMLInputElement} */
  _input(name, type, label, autocomplete) {
    const i = document.createElement('input')
    i.name = name; i.type = type; i.placeholder = label
    i.setAttribute('aria-label', label); i.autocomplete = /** @type {AutoFill} */ (autocomplete)
    return i
  }
}

/** Register the element (idempotent). */
export function defineAuthForm() {
  if (!customElements.get('oyl-auth-form')) customElements.define('oyl-auth-form', OylAuthForm)
}
