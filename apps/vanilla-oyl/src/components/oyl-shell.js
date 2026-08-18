import { OylElement, baseStyles } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { byId, ORIENTATION, DEFAULT_LAYOUT } from '../layouts/layout-catalog.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string>} LayoutSignal */

/*
 * The shared frame every layout builds on. Contains ALL sub-641px rules: below that
 * width no per-layout sheet applies (they are media-scoped by rule), so this IS the
 * mobile arrangement — the fixed bottom tab bar comes from oyl-nav's own stylesheet.
 * No container-type on :host — layout containment would trap the slotted nav's
 * position:fixed bottom bar (it must position against the viewport on mobile).
 */
const baseSheet = sheet(`
  :host {
    display: grid;
    min-block-size: 100dvh;
    /* auto + minmax(0,1fr): an 'auto' toolbar track takes its max-content width and
       never shrinks, so a long picker label pushes the whole document sideways on a
       phone (which widens the layout viewport and drops the fixed tab bar below it).
       Giving the toolbar the flexible track lets it wrap instead. */
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      "title toolbar"
      "nav nav"
      "widgets widgets"
      "page page";
  }
  .title { grid-area: title; }
  .nav-dock { grid-area: nav; }
  .toolbar { grid-area: toolbar; }
  .widgets { grid-area: widgets; }
  .page { grid-area: page; }
  :host([widgets="none"]) .widgets { display: none; }

  .title, .toolbar {
    display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-4);
    background: var(--color-surface);
    border-block-end: 1px solid var(--color-border);
    padding-block: var(--space-2);
  }
  .title { padding-inline-start: max(var(--space-4), env(safe-area-inset-left)); }
  .toolbar { justify-content: flex-end; padding-inline-end: max(var(--space-4), env(safe-area-inset-right)); }
  h1 { font-size: var(--step-1); margin-block: 0; }

  .page {
    inline-size: 100%;
    padding: clamp(var(--space-4), 4vw, var(--space-8)) var(--space-4) 4rem;
  }
  /* Mobile: oyl-nav docks as a fixed bottom tab bar — keep the page clear of it. */
  @media (max-width: 640px) {
    .page { padding-block-end: calc(5rem + env(safe-area-inset-bottom)); }
  }
  ::slotted([slot="main"]) { display: block; }
`)

export class OylShell extends OylElement {
  static styles = [baseSheet]

  constructor() {
    super()
    /** Assigned by the host before append; without it the shell renders DEFAULT_LAYOUT statically. @type {LayoutSignal | undefined} */
    this.layoutSignal = undefined
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const title = document.createElement('div')
    title.className = 'title'
    const h1 = document.createElement('h1')
    h1.textContent = 'OYL'
    title.append(h1)

    const navDock = document.createElement('div')
    navDock.className = 'nav-dock'
    const navSlot = document.createElement('slot')
    navSlot.setAttribute('name', 'nav')
    navDock.append(navSlot)

    const toolbar = document.createElement('div')
    toolbar.className = 'toolbar'
    const toolbarSlot = document.createElement('slot')
    toolbarSlot.setAttribute('name', 'toolbar')
    toolbar.append(toolbarSlot)

    const widgets = document.createElement('div')
    widgets.className = 'widgets'
    const widgetsSlot = document.createElement('slot')
    widgetsSlot.setAttribute('name', 'widgets')
    widgets.append(widgetsSlot)

    const page = document.createElement('div')
    page.className = 'page'
    const mainSlot = document.createElement('slot')
    mainSlot.setAttribute('name', 'main')
    page.append(mainSlot)

    root.append(title, navDock, toolbar, widgets, page)

    // Late-slotted children (append order in main.js is not guaranteed relative to
    // the first layout track) still get their reflected attributes.
    navSlot.addEventListener('slotchange', () => this._reflect(), { signal: this.lifecycle })
    widgetsSlot.addEventListener('slotchange', () => this._reflect(), { signal: this.lifecycle })

    let first = true
    this.track(() => {
      const active = byId(this.layoutSignal ? this.layoutSignal.get() : DEFAULT_LAYOUT)
      const swap = () => {
        this.setAttribute('layout', active.id)
        this.setAttribute('widgets', active.widgets)
        if ('adoptedStyleSheets' in root) root.adoptedStyleSheets = [baseStyles, baseSheet, active.styles]
        this._reflect()
      }
      // Same View Transition policy as the router/theme applier: instant on first
      // paint, under reduced motion, and without the API; rapid re-switches may
      // reject the in-flight transition's promises — benign, swallow them.
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (first || reduce || typeof document.startViewTransition !== 'function') {
        first = false
        swap()
      } else {
        const transition = document.startViewTransition(swap)
        transition.ready.catch(() => {})
        transition.finished.catch(() => {})
      }
    })
  }

  /** Push layout-derived attributes onto slotted children (nav orientation, deck mode). */
  _reflect() {
    const active = byId(this.layoutSignal ? this.layoutSignal.get() : DEFAULT_LAYOUT)
    this.querySelector('[slot="nav"]')?.setAttribute('orientation', ORIENTATION[active.navMode])
    const deck = this.querySelector('[slot="widgets"]')
    if (deck) {
      if (active.widgets === 'none') deck.removeAttribute('mode')
      else deck.setAttribute('mode', active.widgets)
    }
  }
}

/** Register the element (idempotent). */
export function defineShell() {
  if (!customElements.get('oyl-shell')) customElements.define('oyl-shell', OylShell)
}
