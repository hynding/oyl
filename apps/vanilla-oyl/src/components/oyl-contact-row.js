import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { monthDayLabel } from '@oyl/all-of-oyl/format'
import { stalenessLabel } from '../vault/format.js'

/** @typedef {import('@oyl/all-of-oyl').Contact} Contact */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .line { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .actions { grid-column: 2; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylContactRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Contact} */
    this.contact = /** @type {Contact} */ (/** @type {unknown} */ (undefined))
    /** @type {DayKey} */
    this.today = /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onLog = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const main = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.contact.name
    main.append(title)
    const stale = document.createElement('div')
    stale.className = 'line'
    stale.textContent = stalenessLabel(this.contact.staleness(this.today))
    main.append(stale)
    for (const o of this.contact.occasions) {
      const occ = document.createElement('div')
      occ.className = 'line'
      occ.textContent = `${o.name.charAt(0).toUpperCase()}${o.name.slice(1)} ${monthDayLabel(o.anchor)}`
      main.append(occ)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    row.append(main, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    const log = document.createElement('button')
    log.dataset.act = 'log'
    log.textContent = 'Log contact'
    log.addEventListener('click', () => this.onLog(this.contact.id), { signal: this.lifecycle })
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.contact.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(log, del)
  }
}

/** Register the element (idempotent). */
export function defineContactRow() {
  if (!customElements.get('oyl-contact-row')) customElements.define('oyl-contact-row', OylContactRow)
}
