import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineConnection } from './oyl-connection.js'
/** @typedef {import('./oyl-sync-status.js').SyncState} SyncState */

/** @typedef {{ status: string, version?: number }} SchemaInfo */
/** @typedef {{ theme: string, mode: string }} ThemeInfo */
/** @typedef {{ usage: number, quota: number } | null} StorageEstimate */
/** @typedef {{ schema: SchemaInfo, counts: Record<string, number>, theme: ThemeInfo, build?: string, storage?: StorageEstimate }} Diagnostics */
/** @typedef {{ onSeed?: () => void, onExport?: () => void, onImport?: () => void, onReset?: () => void }} Actions */

const styles = sheet(`
  :host { display: block; container-type: inline-size; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .grid { display: grid; gap: var(--space-3); }
  @container (min-width: 40rem) { .grid { grid-template-columns: repeat(2, 1fr); } }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: var(--space-4); }
  dt { color: var(--color-muted); font-size: var(--step--1); }
  dd { font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block-start: var(--space-6); }
  /* secondary by default; one primary (seed); danger is a quiet outline */
  button { background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: var(--space-2) var(--space-3); cursor: pointer; }
  button:hover { background: color-mix(in oklch, var(--color-surface-2), var(--color-text) 7%); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.primary { background: var(--color-accent); color: white; border-color: transparent; }
  button.primary:hover { background: var(--color-accent-hover); }
  button.danger { background: transparent; color: var(--color-danger); border-color: color-mix(in oklch, var(--color-danger) 40%, var(--color-border)); }
  button.danger:hover { background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
`)

export class OylStatusPanel extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Diagnostics | null} */
    this._diagnostics = null
    /** @type {Actions} */
    this.actions = {}
    /** @type {import('./oyl-connection.js').ConnectionConfig | null} */
    this.connection = null
    /** @type {{ state: import('../lib/reactive/signal.js').Signal<SyncState | null>, onResync: () => void, onRetryFailed?: () => void, onDiscardFailed?: () => void } | null} */
    this.sync = null
    /** @type {{ count: number, onUpload: () => void } | null} */
    this.migration = null
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
    defineConnection()

    const h2 = document.createElement('h2')
    h2.textContent = 'Status'
    h2.setAttribute('tabindex', '-1')

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
      this._button('Load demo data', 'seed', () => this.actions.onSeed?.(), 'primary'),
      this._button('Download backup', 'export', () => this.actions.onExport?.()),
      this._button('Import backup', 'import', () => this.actions.onImport?.()),
      this._button('Reset local data', 'reset', () => this.actions.onReset?.(), 'danger'),
    )

    if (this.connection?.mode === 'remote') {
      for (const b of actions.querySelectorAll('button')) /** @type {HTMLButtonElement} */ (b).disabled = true
      const note = document.createElement('p')
      note.id = 'local-tools-note'
      note.textContent = 'Local-data tools — unavailable in Remote mode.'
      actions.append(note)
      actions.setAttribute('aria-describedby', 'local-tools-note')
    }

    const connLabel = document.createElement('h2')
    connLabel.textContent = 'Connection'
    const connEl = /** @type {import('./oyl-connection.js').OylConnection} */ (document.createElement('oyl-connection'))
    connEl.connection = this.connection

    /** @type {Node[]} */
    let syncNodes = []
    if (this.sync) {
      const syncLabel = document.createElement('h2')
      syncLabel.textContent = 'Sync'
      const syncInfo = document.createElement('p')
      const resyncBtn = document.createElement('button')
      resyncBtn.textContent = 'Resync now'
      resyncBtn.dataset.act = 'resync'
      resyncBtn.addEventListener('click', () => this.sync?.onResync(), { signal: this.lifecycle })
      // Failed-writes group: shown (not just disabled) only when there's something to act on.
      // Retry stays enabled offline by design — it un-quarantines so the ops flush on reconnect,
      // and the user sees feedback immediately (failed → pending).
      const failedInfo = document.createElement('p')
      const retryBtn = document.createElement('button')
      retryBtn.textContent = 'Retry'
      retryBtn.dataset.act = 'retry-failed'
      retryBtn.addEventListener('click', () => this.sync?.onRetryFailed?.(), { signal: this.lifecycle })
      const discardBtn = document.createElement('button')
      discardBtn.textContent = 'Discard'
      discardBtn.dataset.act = 'discard-failed'
      discardBtn.addEventListener('click', () => this.sync?.onDiscardFailed?.(), { signal: this.lifecycle })
      this.track(() => {
        const s = this.sync ? this.sync.state.get() : null
        if (!s) { syncInfo.textContent = ''; return }
        const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
        const parts = [`Last synced ${when}`]
        if (s.pending > 0) parts.push(`${s.pending} pending`)
        if (s.conflicts > 0) parts.push(`${s.conflicts} reconciled this session`)
        syncInfo.textContent = parts.join(' · ')
        resyncBtn.disabled = !s.online || s.status === 'offline'
        const hasFailed = s.failed > 0
        failedInfo.textContent = hasFailed ? `${s.failed} write${s.failed === 1 ? '' : 's'} couldn't sync` : ''
        failedInfo.hidden = !hasFailed
        retryBtn.hidden = !hasFailed
        discardBtn.hidden = !hasFailed
      })
      syncNodes = [syncLabel, syncInfo, resyncBtn, failedInfo, retryBtn, discardBtn]
    }

    /** @type {Node[]} */
    let migrateNodes = []
    if (this.migration && this.migration.count > 0) {
      const upBtn = document.createElement('button')
      upBtn.textContent = `Upload local data (${this.migration.count})`
      upBtn.dataset.act = 'upload-local'
      upBtn.addEventListener('click', () => { this.migration?.onUpload(); upBtn.hidden = true }, { signal: this.lifecycle })
      migrateNodes = [upBtn]
    }

    root.append(h2, grid, actions, connLabel, connEl, ...syncNodes, ...migrateNodes)

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

  /** @param {string} label @param {string} act @param {() => void} onClick @param {'primary'|'secondary'|'danger'} [variant] @returns {HTMLButtonElement} */
  _button(label, act, onClick, variant = 'secondary') {
    const b = document.createElement('button')
    b.textContent = label
    b.dataset.act = act
    if (variant !== 'secondary') b.classList.add(variant)
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
