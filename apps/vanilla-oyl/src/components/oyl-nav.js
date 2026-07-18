import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string>} RouteSignal */

const ITEMS = /** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['status', 'Status'],
  ['journal', 'Journal'],
  ['nutrition', 'Nutrition'],
  ['planner', 'Planner'],
  ['vault', 'Vault'],
  ['goals', 'Goals'],
  ['insights', 'Insights'],
  ['finance', 'Finance'],
])

const styles = sheet(`
  nav { display: flex; flex-wrap: wrap; gap: .25rem; }
  a {
    text-decoration: none; color: var(--color-muted); font-weight: 550;
    padding: .35rem .7rem; border-radius: 999px; min-block-size: 44px;
    display: inline-flex; align-items: center;
  }
  a:hover { color: var(--color-text); }
  a[aria-current] { color: var(--color-text); background: color-mix(in oklch, var(--color-accent) 14%, transparent); }
  /* Mobile: dock as a fixed bottom tab bar. The row scrolls horizontally instead of
     wrapping (8 items won't fit a phone), with safe-area padding for notch/home-bar
     devices. oyl-shell reserves matching bottom padding on .page. */
  @media (max-width: 640px) {
    nav {
      position: fixed; inset-inline: 0; inset-block-end: 0; z-index: 10;
      flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;
      background: var(--color-surface); border-block-start: 1px solid var(--color-border);
      padding: .3rem max(.5rem, env(safe-area-inset-left)) calc(.3rem + env(safe-area-inset-bottom)) max(.5rem, env(safe-area-inset-left));
    }
    nav::-webkit-scrollbar { display: none; }
    a { flex: 1 0 auto; justify-content: center; }
  }
`)

export class OylNav extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {RouteSignal} */
    this.routeSignal = /** @type {RouteSignal} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const nav = document.createElement('nav')
    nav.setAttribute('aria-label', 'Primary')
    const links = ITEMS.map(([route, label]) => {
      const a = document.createElement('a')
      a.href = `/${route}`
      a.textContent = label
      a.dataset.route = route
      nav.append(a)
      return a
    })
    root.append(nav)
    this.track(() => {
      const active = this.routeSignal.get()
      for (const a of links) {
        if (a.dataset.route === active) {
          a.setAttribute('aria-current', 'page')
          // Keep the active tab visible when the bar scrolls horizontally (mobile).
          // Guarded: happy-dom (tests) has no scrollIntoView.
          a.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
        } else a.removeAttribute('aria-current')
      }
    })
  }
}

/** Register the element (idempotent). */
export function defineNav() {
  if (!customElements.get('oyl-nav')) customElements.define('oyl-nav', OylNav)
}
