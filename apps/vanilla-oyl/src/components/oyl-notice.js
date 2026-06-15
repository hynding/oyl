import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string | null>} NoticeSignal */

const styles = sheet(`
  :host { position: fixed; inset-block-start: 0; inset-inline: 0; z-index: 50; }
  [role="alert"] { display: flex; align-items: center; gap: var(--space-3); justify-content: center; background: var(--color-warn); color: var(--color-text); padding: var(--space-2) var(--space-3); font: inherit; }
  [role="alert"][hidden] { display: none; }
  button { font: inherit; background: transparent; border: 1px solid currentColor; border-radius: var(--radius-1); padding: .1rem .5rem; cursor: pointer; color: inherit; }
`)

export class OylNotice extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {NoticeSignal} */
    this.notice = /** @type {NoticeSignal} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onDismiss = () => {}
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const alert = document.createElement('div')
    alert.setAttribute('role', 'alert')
    const msg = document.createElement('span')
    const dismiss = document.createElement('button')
    dismiss.dataset.act = 'dismiss'
    dismiss.textContent = 'Dismiss'
    dismiss.addEventListener('click', () => this.onDismiss(), { signal: this.lifecycle })
    alert.append(msg, dismiss)
    root.append(alert)
    this.track(() => {
      const m = this.notice.get()
      alert.hidden = m == null
      msg.textContent = m ?? ''
    })
  }
}

/** Register the element (idempotent). */
export function defineNotice() {
  if (!customElements.get('oyl-notice')) customElements.define('oyl-notice', OylNotice)
}
