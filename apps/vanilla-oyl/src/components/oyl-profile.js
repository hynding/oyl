import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { defineProfileFields } from './oyl-profile-fields.js'
import { defineConnection } from './oyl-connection.js'
import { defineSyncStatus } from './oyl-sync-status.js'
import { formatWeight, formatHeight, age } from '@oyl/all-of-oyl/format'

const styles = sheet(`
  h2 { font-size: var(--step-2); margin-block: var(--space-6) var(--space-3); }
  h2:first-of-type { margin-block-start: 0; }
  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: var(--space-4); margin-block-end: var(--space-4); }
  .muted { color: var(--color-muted); }
  .body-summary { font-size: var(--step--1); color: var(--color-muted); margin-block-start: var(--space-2); }
  a { color: var(--color-accent); }
  .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-block-end: var(--space-3); }
  button { font: inherit; background: var(--color-surface-2); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; }
  button.danger { background: transparent; color: var(--color-danger); border-color: color-mix(in oklch, var(--color-danger) 40%, var(--color-border)); margin-block-start: var(--space-4); }
`)

export class OylProfile extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */ this.session = /** @type {any} */ (undefined)
    /** @type {import('../lib/reactive/signal.js').Signal<any>} */ this.profile = /** @type {any} */ (undefined)
    /** @type {(patch: Record<string, any>) => void} */ this.onSaveProfile = () => {}
    /** @type {() => void} */ this.onLogout = () => {}
    /** @type {import('./oyl-connection.js').ConnectionConfig | null} */ this.connection = null
    /** @type {{ state: import('../lib/reactive/signal.js').Signal<any>, onResync: () => void } | null} */ this.sync = null
    /** @type {{ mode: 'local'|'remote', canUploadLocal: boolean, onExport: () => void, onImport: () => void, onUploadLocal: () => void } | null} */ this.dataActions = null
    /** @type {string} */ this.today = ''
  }
  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    defineProfileFields()
    const sess = this.session?.get() ?? null
    const prof = this.profile?.get() ?? null

    const h2 = document.createElement('h2'); h2.textContent = 'Profile'; h2.setAttribute('tabindex', '-1')

    const identity = document.createElement('div'); identity.className = 'card'
    if (sess) {
      identity.dataset.role = 'identity'
      identity.textContent = `${sess.user.username} · ${sess.user.email}`
    } else {
      const p = document.createElement('p'); p.className = 'muted'
      const a = document.createElement('a'); a.href = '/login'; a.textContent = 'Sign in to sync'
      p.append('Using local data. ', a, ' to back up and sync across devices.')
      identity.append(p)
    }

    const fields = /** @type {any} */ (document.createElement('oyl-profile-fields'))
    fields.value = prof ? toPatch(prof) : {}
    fields.showSave = true
    fields.onSave = (/** @type {any} */ patch) => this.onSaveProfile(patch)

    const bodyParts = []
    if (prof?.weightKg != null) bodyParts.push(formatWeight(prof.weightKg, prof.units ?? 'metric'))
    if (prof?.heightCm != null) bodyParts.push(formatHeight(prof.heightCm, prof.units ?? 'metric'))
    if (prof?.birthday && this.today) bodyParts.push(`${age(prof.birthday, this.today)} yrs`)

    if (bodyParts.length > 0) {
      const summary = document.createElement('div')
      summary.dataset.role = 'body-summary'
      summary.className = 'body-summary'
      summary.textContent = bodyParts.join(' · ')
      root.append(h2, identity, summary, fields)
    } else {
      root.append(h2, identity, fields)
    }

    if (this.connection) {
      defineConnection()
      const label = document.createElement('h2'); label.textContent = 'Connection'
      const conn = /** @type {any} */ (document.createElement('oyl-connection'))
      conn.connection = this.connection
      root.append(label, conn)
    }

    if (this.sync) {
      defineSyncStatus()
      const label = document.createElement('h2'); label.textContent = 'Sync'
      const rowEl = document.createElement('div'); rowEl.className = 'row'
      const chip = /** @type {any} */ (document.createElement('oyl-sync-status'))
      chip.syncState = this.sync.state
      const resync = this._btn('Resync now', 'resync', () => this.sync?.onResync())
      rowEl.append(chip, resync)
      root.append(label, rowEl)
    }

    if (this.dataActions) {
      const da = this.dataActions
      const label = document.createElement('h2'); label.textContent = 'Data'
      const rowEl = document.createElement('div'); rowEl.className = 'row'
      rowEl.append(this._btn('Download backup', 'export', () => da.onExport()))
      if (da.mode === 'local') rowEl.append(this._btn('Import backup', 'import', () => da.onImport()))
      if (da.canUploadLocal) rowEl.append(this._btn('Upload local data', 'upload-local', () => da.onUploadLocal()))
      root.append(label, rowEl)
    }

    if (sess) {
      const logout = document.createElement('button'); logout.className = 'danger'; logout.dataset.act = 'logout'; logout.textContent = 'Log out'
      logout.addEventListener('click', () => this.onLogout(), { signal: this.lifecycle })
      root.append(logout)
    }
  }

  /** @param {string} text @param {string} act @param {() => void} onClick @returns {HTMLButtonElement} */
  _btn(text, act, onClick) {
    const b = document.createElement('button'); b.textContent = text; b.dataset.act = act
    b.addEventListener('click', onClick, { signal: this.lifecycle })
    return b
  }
}

/** @param {import('@oyl/all-of-oyl').User} u @returns {Record<string, any>} */
function toPatch(u) {
  /** @type {Record<string, any>} */
  const p = { displayName: u.displayName, timezone: u.timezone, defaultCurrency: u.defaultCurrency }
  for (const k of ['units', 'birthday', 'weightKg', 'heightCm', 'gender', 'location']) {
    const v = /** @type {any} */ (u)[k]; if (v !== undefined) p[k] = v
  }
  return p
}

/** Register the element (idempotent). */
export function defineProfile() {
  if (!customElements.get('oyl-profile')) customElements.define('oyl-profile', OylProfile)
}
