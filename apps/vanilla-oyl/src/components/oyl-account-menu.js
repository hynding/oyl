import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  nav { display: inline-flex; align-items: center; gap: var(--space-3); }
  a { color: var(--color-muted); text-decoration: none; font-weight: 550; }
  a:hover { color: var(--color-text); }
  button { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .7rem; cursor: pointer; color: var(--color-text); }
`)

export class OylAccountMenu extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */
    this.session = /** @type {any} */ (undefined)
    /** @type {() => void} */ this.onLogout = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Account')
    const profile = document.createElement('a'); profile.href = '/profile'; profile.textContent = 'Profile'
    const signin = document.createElement('a'); signin.href = '/login'; signin.textContent = 'Sign in'
    const logout = document.createElement('button'); logout.dataset.act = 'logout'; logout.textContent = 'Log out'
    logout.addEventListener('click', () => this.onLogout(), { signal: this.lifecycle })
    nav.append(profile)
    root.append(nav)
    this.track(() => {
      const signedIn = !!this.session?.get()
      if (signedIn) { if (!logout.isConnected) nav.append(logout); signin.remove() }
      else { if (!signin.isConnected) nav.append(signin); logout.remove() }
    })
  }
}

/** Register the element (idempotent). */
export function defineAccountMenu() {
  if (!customElements.get('oyl-account-menu')) customElements.define('oyl-account-menu', OylAccountMenu)
}
