import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { WIDGETS } from './widget-catalog.js'

/** @typedef {import('./context.js').WidgetContext} WidgetContext */

const styles = sheet(`
  :host { display: block; }
  /* Unkeyed base = the MOBILE presentation (compact horizontal scroll row).
     mode-keyed rules are desktop-only BY RULE: the shell reflects mode at
     every viewport, so an unscoped [mode] rule would restyle phones. The
     structural test in oyl-widgets.test.js enforces this. */
  .deck { display: flex; gap: var(--space-3); overflow-x: auto; scrollbar-width: none; padding: var(--space-2) 0; }
  .deck::-webkit-scrollbar { display: none; }
  .card {
    flex: 0 0 auto; min-inline-size: 11rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-3);
  }
  .card.failed { color: var(--color-muted); font-size: var(--step--1); }
  @media (min-width: 641px) {
    :host([mode="rail"]) .deck { flex-direction: column; overflow: visible; }
    :host([mode="rail"]) .card { flex: 0 0 auto; inline-size: 100%; min-inline-size: 0; }
    :host([mode="band"]) .deck { flex-direction: row; flex-wrap: nowrap; }
  }
`)

export class OylWidgets extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** Assigned by the host before append. @type {WidgetContext} */
    this.context = /** @type {WidgetContext} */ (/** @type {unknown} */ (undefined))
    /** Overridable registry (tests inject stubs); defaults to the catalog. @type {readonly import('./widget-catalog.js').WidgetEntry[]} */
    this.widgets = WIDGETS
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const deck = document.createElement('div')
    deck.className = 'deck'
    // Keyboard access: the row scrolls (mobile base + band mode), and widgets
    // are non-interactive, so the container itself must take focus for
    // keyboard scrolling. Focus ring comes from the shared baseStyles.
    deck.tabIndex = 0
    deck.setAttribute('role', 'group')
    deck.setAttribute('aria-label', 'Highlights')
    // Connect the deck FIRST: custom elements only run connectedCallback (and
    // thus their render) when they reach the document, so each widget must be
    // appended to an already-connected card for connect-time throws to land
    // inside the try/catch below.
    root.append(deck)
    for (const entry of this.widgets) {
      const card = document.createElement('div')
      card.className = 'card'
      deck.append(card)
      try {
        card.append(entry.create(this.context))
      } catch (err) {
        // Isolation protects USERS, not buggy code: the console.error below
        // fails the e2e hygiene fixture, so a crashing widget still fails CI.
        console.error(`widget ${entry.id} failed to render`, err)
        // A widget that threw on connect may already sit in the card —
        // clear it so the failure text isn't shown beside a half-rendered element.
        card.replaceChildren()
        card.classList.add('failed')
        card.textContent = `${entry.label} unavailable`
      }
    }
  }
}

/** Register the element (idempotent). */
export function defineWidgets() {
  if (!customElements.get('oyl-widgets')) customElements.define('oyl-widgets', OylWidgets)
}
