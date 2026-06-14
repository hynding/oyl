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
  /* The shared page frame: every routed view is centered + padded here, so views
     don't each re-declare their own max-width/margin/padding. */
  .page { inline-size: 100%; max-inline-size: 680px; margin-inline: auto; padding: clamp(var(--space-4), 4vw, var(--space-8)) var(--space-4) 4rem; }
  ::slotted([slot="main"]) { display: block; }
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
    const page = document.createElement('div')
    page.className = 'page'
    page.append(main)
    root.append(header, page)
  }
}

/** Register the element (idempotent). */
export function defineShell() {
  if (!customElements.get('oyl-shell')) customElements.define('oyl-shell', OylShell)
}
