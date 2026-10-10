import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { RowAction } from '../oyl-item-row/oyl-item-row.js'

export type ProgressTone = 'met' | 'warn' | 'muted'

/**
 * One tracked thing (a goal, a budget): name (+ optional met check), a progress bar with a
 * tone, a status label, an optional secondary action (Pause / Resume) and the inline
 * Delete → Yes/No confirm. Purely presentational: every prop is a primitive the screen
 * derives per render, so in-place domain mutations still re-render the row. `act` and
 * `remove` carry `itemId`, so a screen keeps one stable handler per list.
 */
@Component({ tag: 'oyl-progress-row', styleUrl: 'oyl-progress-row.css', shadow: true })
export class OylProgressRow {
  @Element() host!: HTMLElement

  @Prop() itemId!: string
  /** The heading (user text — rendered verbatim). */
  @Prop() name!: string
  /** Renders a check after the name. */
  @Prop() met?: boolean
  /** 0–1 fill of the bar. */
  @Prop() ratio = 0
  @Prop() tone?: ProgressTone
  /** The status line under the bar. */
  @Prop() label = ''
  /** An optional secondary action rendered before Delete. */
  @Prop() action?: RowAction
  /** aria-label for the Delete button; defaults to "Delete {name}". */
  @Prop() removeLabel?: string

  /** The user confirmed deletion; detail = `itemId`. */
  @Event() remove!: EventEmitter<string>
  /** The secondary action was clicked. */
  @Event() act!: EventEmitter<{ act: string; itemId: string }>

  @State() confirming = false

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  private onAct = () => {
    if (this.action) this.act.emit({ act: this.action.act, itemId: this.itemId })
  }

  private onYes = () => {
    this.confirming = false
    this.remove.emit(this.itemId)
  }

  render() {
    const pct = String(Math.round(this.ratio * 100))
    const warn = this.tone === 'warn'
    return (
      <div class="row">
        <div class="title">
          {this.name}
          {this.met ? <span class="ok"> ✓</span> : null}
        </div>
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label="Delete?">
              <span>Delete?</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={this.onYes}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = false)}>No</button>
            </span>
          ) : (
            [
              this.action ? <button type="button" data-act={this.action.act} onClick={this.onAct}>{this.action.label}</button> : null,
              <button type="button" class="del" data-act="delete" aria-label={this.removeLabel ?? `Delete ${this.name}`} onClick={() => (this.confirming = true)}>Delete</button>,
            ]
          )}
        </div>
        <div class={{ bar: true, [this.tone ?? '']: !!this.tone }} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
          <div class="fill" style={{ 'inline-size': `${pct}%` }} />
        </div>
        <div class={{ label: true, warn }}>{this.label}</div>
      </div>
    )
  }
}
