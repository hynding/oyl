import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  :host { display: inline-flex; align-items: center; }
  :host([hidden]) { display: none; }
  .chip { display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; color: var(--color-muted);
    padding: .15rem .55rem; border-radius: 999px; background: color-mix(in oklch, var(--color-text) 7%, transparent); }
  .dot { inline-size: .5rem; block-size: .5rem; border-radius: 50%; background: var(--color-muted); }
  .dot.accent { background: var(--color-accent); }
  .dot.warn { background: color-mix(in oklch, #f59e0b 85%, var(--color-text)); }
  .dot.danger { background: var(--color-danger); }
`)

export class OylSyncStatus extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<import('@oyl/all-of-oyl').SyncState | null> | null} */
    this.syncState = null
  }
  render() {
    if (!this.syncState) return
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const chip = document.createElement('span')
    chip.className = 'chip'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const label = document.createElement('span')
    chip.append(dot, label)
    root.append(chip)
    this.track(() => {
      const v = toChip(this.syncState ? this.syncState.get() : null)
      if (!v) { this.toggleAttribute('hidden', true); return }
      this.toggleAttribute('hidden', false)
      dot.className = `dot ${v.tone}`
      label.textContent = v.text
      this.setAttribute('aria-label', `Sync: ${v.text}`)
      chip.title = v.title ?? ''
    })
  }
}

/**
 * Map a SyncState (or null) to a chip descriptor, or null when the chip should be hidden.
 * @param {import('@oyl/all-of-oyl').SyncState | null} s
 * @returns {{ tone: string, text: string, title?: string } | null}
 */
function toChip(s) {
  if (!s) return null
  if (s.status === 'syncing') return { tone: 'accent', text: 'Syncing…' }
  if (s.status === 'error') return { tone: 'danger', text: 'Sync error', ...(s.lastError ? { title: s.lastError } : {}) }
  if (s.status === 'offline' || !s.online) return { tone: 'warn', text: s.pending > 0 ? `Offline · ${s.pending}` : 'Offline' }
  if (s.pending > 0) return { tone: 'warn', text: `${s.pending} pending` }
  return null
}

/** Register the element (idempotent). */
export function defineSyncStatus() {
  if (!customElements.get('oyl-sync-status')) customElements.define('oyl-sync-status', OylSyncStatus)
}
