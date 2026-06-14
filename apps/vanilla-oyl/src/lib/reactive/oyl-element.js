import { effect } from './effect.js'

/**
 * Base class for OYL Web Components. Provides a shadow root, fine-grained signal
 * bindings (one effect per dynamic part — no VDOM), and automatic teardown of every
 * effect and listener on disconnect via an AbortController.
 * @abstract
 */
export class OylElement extends HTMLElement {
  /** @type {CSSStyleSheet[]} subclasses override to share adopted stylesheets. */
  static styles = []

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    const styles = /** @type {typeof OylElement} */ (this.constructor).styles
    if (styles.length && this.shadowRoot && 'adoptedStyleSheets' in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = styles
    }
    /** @type {AbortController} */
    this._lifecycle = new AbortController()
    /** @type {Array<() => void>} */
    this._disposers = []
  }

  /** The AbortSignal that fires on disconnect — pass to addEventListener. */
  get lifecycle() {
    return this._lifecycle.signal
  }

  connectedCallback() {
    // Support reconnect: disconnect aborts the lifecycle and leaves the prior render in
    // the shadow root. On a fresh connect, replace the spent controller and clear the old
    // DOM so render() starts clean (no duplicate nodes, live listeners/effects again).
    if (this._lifecycle.signal.aborted) {
      this._lifecycle = new AbortController()
      this._disposers = []
      this.shadowRoot?.replaceChildren()
    }
    this.render()
  }

  disconnectedCallback() {
    this._lifecycle.abort()
    for (const dispose of this._disposers) dispose()
    this._disposers = []
  }

  /** Register a reactive effect owned by this element (auto-disposed on disconnect). @param {() => void} fn */
  track(fn) {
    this._disposers.push(effect(fn))
  }

  /** Bind a node's textContent to a reactive computation. @param {Node} node @param {() => string} compute */
  bindText(node, compute) {
    this.track(() => {
      node.textContent = compute()
    })
  }

  /** Bind an element attribute to a reactive computation (null/false removes it). @param {Element} el @param {string} name @param {() => string | null | boolean} compute */
  bindAttr(el, name, compute) {
    this.track(() => {
      const v = compute()
      if (v === null || v === false) el.removeAttribute(name)
      else el.setAttribute(name, v === true ? '' : v)
    })
  }

  /** Subclasses build their shadow DOM here (called once on connect). @abstract */
  render() {}
}
