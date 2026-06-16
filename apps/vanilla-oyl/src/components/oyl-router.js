import { OylElement } from '../lib/reactive/oyl-element.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string>} RouteSignal */
/** @typedef {Record<string, () => Node>} Routes */

export class OylRouter extends OylElement {
  constructor() {
    super()
    /** @type {RouteSignal} */
    this.routeSignal = /** @type {RouteSignal} */ (/** @type {unknown} */ (undefined))
    /** @type {Routes} */
    this.routes = {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const outlet = document.createElement('main')
    outlet.id = 'outlet'
    // aria-live announces route changes for assistive tech (View Transitions are visual only).
    const live = document.createElement('div')
    live.setAttribute('aria-live', 'polite')
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);'
    root.append(live, outlet)

    this.track(() => {
      const name = this.routeSignal.get()
      const view = this.routes[name]?.() ?? this._notFound(name)
      const swap = () => {
        outlet.replaceChildren(view)
        const heading = /** @type {HTMLElement | null} */ (
          view instanceof Element ? view.querySelector('h1, h2, [role="heading"]') : null
        )
        heading?.setAttribute('tabindex', '-1')
        heading?.focus?.()
        live.textContent = `Navigated to ${name}`
      }
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!reduce && typeof document.startViewTransition === 'function') document.startViewTransition(swap)
      else swap()
    })
  }

  /** @param {string} name @returns {Node} */
  _notFound(name) {
    // `name` derives from the URL path (untrusted) and may be percent-encoded;
    // decode for a readable label, falling back to raw on malformed input.
    let label = name
    try {
      label = decodeURIComponent(name)
    } catch {
      // malformed escape sequence — keep the raw segment
    }
    // Build via DOM APIs (not innerHTML): textContent keeps the (decoded) label inert.
    const d = document.createElement('div')
    const h1 = document.createElement('h1')
    h1.textContent = 'Not found'
    const p = document.createElement('p')
    p.textContent = `No view for route “${label}”.`
    d.append(h1, p)
    return d
  }
}

/** Register the element (idempotent). */
export function defineRouter() {
  if (!customElements.get('oyl-router')) customElements.define('oyl-router', OylRouter)
}
