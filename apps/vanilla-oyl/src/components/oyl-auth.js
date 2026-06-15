import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/auth.js').createAuthState>} AuthState */

const styles = sheet(`
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  form { display: grid; gap: .5rem; max-inline-size: 22rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  input[hidden] { display: none; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.primary:disabled { opacity: .6; cursor: default; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
  .who { display: flex; align-items: center; gap: .75rem; }
  .who button { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; color: var(--color-text); }
`)

export class OylAuth extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {AuthState} */
    this.auth = /** @type {AuthState} */ (/** @type {unknown} */ (undefined))
    /** @type {import('../lib/reactive/signal.js').Signal<'login'|'register'>} */
    this._mode = /** @type {any} */ (signal('login'))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const out = document.createElement('div')
    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Auth mode')
    const loginBtn = this._segButton('login', 'Sign in')
    const registerBtn = this._segButton('register', 'Register')
    seg.append(loginBtn, registerBtn)

    const form = document.createElement('form')
    const identifier = this._input('identifier', 'text', 'Username or email', /** @type {AutoFill} */ ('username'))
    const username = this._input('username', 'text', 'Username', /** @type {AutoFill} */ ('username'))
    const email = this._input('email', 'email', 'Email', /** @type {AutoFill} */ ('email'))
    const password = this._input('password', 'password', 'Password', /** @type {AutoFill} */ ('current-password'))
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')
    form.append(identifier, username, email, password, submit, error)
    out.append(seg, form)

    const inn = document.createElement('div')
    inn.className = 'who'
    const who = document.createElement('span')
    const signout = document.createElement('button')
    signout.dataset.act = 'signout'
    signout.textContent = 'Sign out'
    signout.addEventListener('click', () => this.auth.logout(), { signal: this.lifecycle })
    inn.append(who, signout)

    root.append(out, inn)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      submit.disabled = true
      try {
        if (this._mode.get() === 'login') await this.auth.login(identifier.value, password.value)
        else await this.auth.register(username.value, email.value, password.value)
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      } finally {
        submit.disabled = false
      }
    }, { signal: this.lifecycle })

    this.track(() => {
      const s = this.auth.session.get()
      out.hidden = !!s
      inn.hidden = !s
      if (s) who.textContent = `Signed in as ${s.user.username}`

      const isLogin = this._mode.get() === 'login'
      identifier.hidden = !isLogin
      username.hidden = isLogin
      email.hidden = isLogin
      password.autocomplete = /** @type {AutoFill} */ (isLogin ? 'current-password' : 'new-password')
      submit.textContent = isLogin ? 'Sign in' : 'Create account'
      loginBtn.setAttribute('aria-pressed', String(isLogin))
      registerBtn.setAttribute('aria-pressed', String(!isLogin))
    })
  }

  /** @param {string} name @param {string} type @param {string} label @param {AutoFill} autocomplete @returns {HTMLInputElement} */
  _input(name, type, label, autocomplete) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    i.placeholder = label
    i.setAttribute('aria-label', label)
    i.autocomplete = autocomplete
    return i
  }

  /** @param {'login'|'register'} value @param {string} label @returns {HTMLButtonElement} */
  _segButton(value, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.value = value
    b.textContent = label
    b.addEventListener('click', () => this._mode.set(value), { signal: this.lifecycle })
    return b
  }
}

/** Register the element (idempotent). */
export function defineAuth() {
  if (!customElements.get('oyl-auth')) customElements.define('oyl-auth', OylAuth)
}
