import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {{ status: string, version?: number }} SchemaInfo */
/** @typedef {{ theme: string, mode: string }} ThemeInfo */
/** @typedef {{ usage: number, quota: number } | null} StorageEstimate */
/** @typedef {{ schema: SchemaInfo, counts: Record<string, number>, theme: ThemeInfo, build?: string, storage?: StorageEstimate }} Diagnostics */
/** @typedef {{ onSeed?: () => void, onExport?: () => void, onImport?: () => void, onReset?: () => void }} Actions */

const styles = sheet(`
  :host { display: block; container-type: inline-size; }
  h1 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .grid { display: grid; gap: var(--space-3); }
  @container (min-width: 40rem) { .grid { grid-template-columns: repeat(2, 1fr); } }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: var(--space-4); }
  dt { color: var(--color-muted); font-size: 0.8rem; }
  dd { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block-start: var(--space-6); }
  button { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: var(--space-2) var(--space-3); cursor: pointer; }
  button:hover { background: var(--color-accent-hover); }
  button.danger { background: var(--color-danger); }
`)

export class OylStatusPanel extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Diagnostics | null} */
    this._diagnostics = null
    /** @type {Actions} */
    this.actions = {}
    /** @type {(() => void) | null} */
    this._paint = null
  }

  /** @param {Diagnostics | null} v */
  set diagnostics(v) {
    this._diagnostics = v
    if (this._paint) this._paint()
  }
  /** @returns {Diagnostics | null} */
  get diagnostics() {
    return this._diagnostics
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h1 = document.createElement('h1')
    h1.textContent = 'Status'
    h1.setAttribute('tabindex', '-1')

    const grid = document.createElement('div')
    grid.className = 'grid'
    const metaCard = document.createElement('section')
    metaCard.className = 'card'
    const metaDl = document.createElement('dl')
    metaCard.append(metaDl)
    const countsCard = document.createElement('section')
    countsCard.className = 'card'
    const countsDl = document.createElement('dl')
    countsDl.className = 'grid'
    countsCard.append(countsDl)
    grid.append(metaCard, countsCard)

    const actions = document.createElement('div')
    actions.className = 'actions'
    actions.append(
      this._button('Load demo data', 'seed', () => this.actions.onSeed?.()),
      this._button('Download backup', 'export', () => this.actions.onExport?.()),
      this._button('Import backup', 'import', () => this.actions.onImport?.()),
      this._button('Reset local data', 'reset', () => this.actions.onReset?.(), true),
    )

    root.append(h1, grid, actions)

    this._paint = () => {
      const d = this._diagnostics
      metaDl.replaceChildren()
      countsDl.replaceChildren()
      if (!d) {
        metaDl.append(this._row('status', 'loading…'))
        return
      }
      metaDl.append(
        this._row('schema', `${d.schema.status}${d.schema.version != null ? ' v' + d.schema.version : ''}`),
        this._row('theme', `${d.theme.theme} / ${d.theme.mode}`),
        this._row('build', d.build ?? '—'),
        this._row('storage', d.storage ? `${formatBytes(d.storage.usage)} / ${formatBytes(d.storage.quota)}` : '—'),
      )
      for (const [name, count] of Object.entries(d.counts)) {
        countsDl.append(this._row(name, String(count)))
      }
    }
    this._paint()
  }

  /** @param {string} term @param {string} value @returns {HTMLElement} */
  _row(term, value) {
    const wrap = document.createElement('div')
    const dt = document.createElement('dt')
    dt.textContent = term
    const dd = document.createElement('dd')
    dd.textContent = value
    wrap.append(dt, dd)
    return wrap
  }

  /** @param {string} label @param {string} act @param {() => void} onClick @param {boolean} [danger] @returns {HTMLButtonElement} */
  _button(label, act, onClick, danger = false) {
    const b = document.createElement('button')
    b.textContent = label
    b.dataset.act = act
    if (danger) b.classList.add('danger')
    b.addEventListener('click', onClick, { signal: this.lifecycle })
    return b
  }
}

/** Human-readable byte size (B/KB/MB/GB). @param {number} n @returns {string} */
function formatBytes(n) {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** Register the element (idempotent). */
export function defineStatusPanel() {
  if (!customElements.get('oyl-status-panel')) customElements.define('oyl-status-panel', OylStatusPanel)
}
