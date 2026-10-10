import { Component, Element, Prop, State, h } from '@stencil/core'
import type { Signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from '../../bridge/signal-state.js'
import type { ConnectionSettings, StorageMode } from '../../boot/types.js'
import type { StatusActions } from '../../boot/data-tools.js'

export interface Diagnostics {
  schema: { status: string; version?: number }
  counts: Record<string, number>
  theme: { theme: string; mode: string }
  build?: string
  storage?: { usage: number; quota: number } | null
}

/**
 * The diagnostics/acceptance surface: Connection, Diagnostics (schema/theme/build/storage/
 * pending + per-collection counts) and the account-scoped data tools. Tool gating follows
 * vanilla: seed/export/import act on the signed-in ACCOUNT (Remote mode); reset clears
 * LOCAL storage (Local mode).
 */
@Component({ tag: 'oyl-status', styleUrl: 'oyl-status.css', shadow: true })
export class OylStatus {
  @Element() host!: HTMLElement

  /** Snapshot reader; re-read whenever `pending` or the refresh tick changes. */
  @Prop() diagnostics!: () => Diagnostics
  @Prop() pending!: Signal<number>
  /** A counter the app bumps after refresh() so the snapshot re-reads. */
  @Prop() tick?: Signal<number>
  @Prop() connection!: ConnectionSettings
  @Prop() actions!: StatusActions

  @State() snapshot: Diagnostics | null = null
  @State() pendingCount = 0
  @State() urlError: string | undefined
  private stops: Array<() => void> = []

  connectedCallback() {
    this.stops.push(bindSignal(this.pending, (n) => { this.pendingCount = n; this.snapshot = this.diagnostics() }))
    if (this.tick) this.stops.push(bindSignal(this.tick, () => (this.snapshot = this.diagnostics())))
  }

  disconnectedCallback() {
    for (const stop of this.stops) stop()
    this.stops = []
  }

  private apply = () => {
    const sr = this.host.shadowRoot!
    const mode = (sr.querySelector('select[name="mode"]') as HTMLSelectElement).value as StorageMode
    const url = (sr.querySelector('ui-field[name="apiBaseUrl"]') as HTMLElement & { value: string }).value
    // Vanilla's rule: an http(s) URL, or empty (clears the stored override → the default).
    if (!isHttpUrl(url)) { this.urlError = 'Enter a valid http(s) URL.'; return }
    this.urlError = undefined
    this.connection.onApply(mode, url)
  }

  render() {
    const d = this.snapshot ?? this.diagnostics()
    const remote = this.connection.mode === 'remote'
    const meta: Array<[string, string]> = [
      ['schema', `${d.schema.status}${d.schema.version !== undefined ? ` v${d.schema.version}` : ''}`],
      ['theme', `${d.theme.theme} / ${d.theme.mode}`],
      ['build', d.build ?? 'dev'],
      ['storage', d.storage ? `${fmtBytes(d.storage.usage)} of ${fmtBytes(d.storage.quota)}` : 'n/a'],
      ['pending', String(this.pendingCount)],
    ]
    return (
      <div class="screen">
        <h2 tabindex="-1">Status</h2>

        <ui-card heading="Connection">
          <div class="conn">
            <label class="mode">
              <span>Mode</span>
              <select name="mode">
                <option value="remote" selected={remote}>Remote</option>
                <option value="local" selected={!remote}>Local</option>
              </select>
            </label>
            <ui-field label="Backend URL" name="apiBaseUrl" value={this.connection.apiBaseUrl} hint={`Default: ${this.connection.defaultApiBaseUrl}`} error={this.urlError} />
          </div>
          <ui-button slot="footer" variant="primary" data-act="apply" onClick={this.apply}>Apply &amp; reload</ui-button>
        </ui-card>

        <div class="grid">
          <ui-card heading="Diagnostics">
            <dl>{meta.map(([k, v]) => [<dt>{k}</dt>, <dd>{v}</dd>])}</dl>
          </ui-card>
          <ui-card heading="Collections">
            <dl class="counts">{Object.entries(d.counts).map(([k, v]) => [<dt>{k}</dt>, <dd>{String(v)}</dd>])}</dl>
          </ui-card>
        </div>

        <ui-card heading="Data tools">
          <div class="actions" aria-describedby="tools-note">
            <ui-button variant="primary" data-act="seed" disabled={!remote} onClick={() => this.actions.onSeed()}>Load demo data</ui-button>
            <ui-button data-act="export" disabled={!remote} onClick={() => this.actions.onExport()}>Download backup</ui-button>
            <ui-button data-act="import" disabled={!remote} onClick={() => this.actions.onImport()}>Import backup</ui-button>
            <ui-button variant="danger" data-act="reset" disabled={remote} onClick={() => this.actions.onReset()}>Reset local data</ui-button>
          </div>
          <p id="tools-note" class="note">
            {remote
              ? 'Reset applies to local data — available in Local mode.'
              : 'Demo data, backup, and import operate on your account — available in Remote mode.'}
          </p>
        </ui-card>
      </div>
    )
  }
}

/** Empty (→ default) or an absolute http(s) URL. */
function isHttpUrl(url: string): boolean {
  if (url.trim() === '') return true
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
