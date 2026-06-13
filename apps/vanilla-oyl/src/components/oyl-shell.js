import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  :host { display: grid; grid-template-rows: auto 1fr; min-block-size: 100dvh; container-type: inline-size; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); padding: var(--space-3) var(--space-4);
    background: var(--color-surface); border-block-end: 1px solid var(--color-border);
  }
  h1 { font-size: var(--step-1); }
  @container (min-width: 48rem) { header { padding-inline: var(--space-8); } }
`)

export class OylShell extends OylElement {
  static styles = [styles]

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const header = document.createElement('header')
    const h1 = document.createElement('h1')
    h1.textContent = 'OYL'
    const navSlot = document.createElement('slot')
    navSlot.setAttribute('name', 'nav')
    const toolbar = document.createElement('slot')
    toolbar.setAttribute('name', 'toolbar')
    header.append(h1, navSlot, toolbar)
    const main = document.createElement('slot')
    main.setAttribute('name', 'main')
    root.append(header, main)
  }
}

/** Register the element (idempotent). */
export function defineShell() {
  if (!customElements.get('oyl-shell')) customElements.define('oyl-shell', OylShell)
}
