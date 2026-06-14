import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .line { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .actions { grid-column: 2; align-self: center; display: inline-flex; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylVaultItem extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {string} */
    this.label = ''
    /** @type {ReadonlyArray<string | null | undefined>} */
    this.lines = []
    /** @type {() => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const main = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.label
    main.append(title)
    for (const text of this.lines) {
      if (!text) continue
      const l = document.createElement('div')
      l.className = 'line'
      l.textContent = text
      main.append(l)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderDelete(actions)

    row.append(main, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderDelete(mount) {
    mount.replaceChildren()
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(),
        restore: () => this._renderDelete(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(del)
  }
}

/** Register the element (idempotent). */
export function defineVaultItem() {
  if (!customElements.get('oyl-vault-item')) customElements.define('oyl-vault-item', OylVaultItem)
}
