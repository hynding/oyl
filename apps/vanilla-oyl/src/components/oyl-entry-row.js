import { Note, Measurement } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { formatClockTime } from '@oyl/all-of-oyl/format'
import { measurementUnit } from '../journal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; container-type: inline-size; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 4.2rem 1fr auto; gap: .25rem 1rem; align-items: baseline; padding: .85rem 0; }
  .time { font-family: var(--font-mono); font-size: .85rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }
  .kind { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-muted); font-weight: 700; }
  .text { color: var(--color-text); }
  .measure { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .annot { color: var(--color-muted); font-size: .85rem; font-style: italic; margin-block-start: .25rem; }
  .tags { display: flex; gap: .35rem; flex-wrap: wrap; margin-block-start: .3rem; }
  .chip { font-size: .72rem; font-weight: 600; color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); border-radius: 999px; padding: .12rem .55rem; }
  button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; }
  .del { color: var(--color-muted); font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  @container (max-width: 26rem) { .row { grid-template-columns: 1fr auto; } .time { grid-column: 1; } }
`)

export class OylEntryRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Entry} */
    this.entry = /** @type {Entry} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const time = document.createElement('span')
    time.className = 'time'
    time.textContent = formatClockTime(this.entry.occurredAt)

    const body = document.createElement('div')
    const kind = document.createElement('div')
    kind.className = 'kind'
    const content = document.createElement('div')

    if (this.entry instanceof Note) {
      kind.textContent = 'Note'
      content.className = 'text'
      content.textContent = this.entry.text
      body.append(kind, content)
      if (this.entry.tags.length) {
        const tags = document.createElement('div')
        tags.className = 'tags'
        for (const t of this.entry.tags) {
          const chip = document.createElement('span')
          chip.className = 'chip'
          chip.textContent = t
          tags.append(chip)
        }
        body.append(tags)
      }
    } else if (this.entry instanceof Measurement) {
      kind.textContent = 'Measurement'
      content.className = 'text measure'
      const unit = measurementUnit(this.entry.metric)
      content.textContent = `${this.entry.metric} = ${this.entry.value}${unit ? ' ' + unit : ''}`
      body.append(kind, content)
    } else {
      kind.textContent = 'Entry'
      body.append(kind)
    }

    if (this.entry.note) {
      const annot = document.createElement('div')
      annot.className = 'annot'
      annot.textContent = this.entry.note
      body.append(annot)
    }

    const actions = document.createElement('div')
    this._renderDelete(actions)

    row.append(time, body, actions)
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
        onYes: () => this.onDelete(this.entry.id),
        restore: () => this._renderDelete(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(del)
  }
}

/** Register the element (idempotent). */
export function defineEntryRow() {
  if (!customElements.get('oyl-entry-row')) customElements.define('oyl-entry-row', OylEntryRow)
}
