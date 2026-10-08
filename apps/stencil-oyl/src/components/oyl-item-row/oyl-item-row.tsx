import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'

export type ValueTone = 'ok' | 'warn' | 'danger'

/**
 * A generic list row: label + supporting lines | optional mono value | inline Delete →
 * Yes/No (the shared confirm cluster on native buttons). Used by the ledger and the
 * accounts list; Vault reuses it later. `remove` carries `itemId`, so a screen keeps one
 * stable handler per list.
 */
@Component({ tag: 'oyl-item-row', styleUrl: 'oyl-item-row.css', shadow: true })
export class OylItemRow {
  @Element() host!: HTMLElement

  @Prop() itemId!: string
  @Prop() label!: string
  @Prop() lines: readonly (string | null | undefined)[] = []
  /** Right-aligned mono value (an amount, a balance). */
  @Prop() value?: string
  @Prop() tone?: ValueTone
  /** aria-label for the Delete button; defaults to "Delete {label}". */
  @Prop() removeLabel?: string

  /** The user confirmed deletion; detail = `itemId`. */
  @Event() remove!: EventEmitter<string>

  @State() confirming = false

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  private onYes = () => {
    this.confirming = false
    this.remove.emit(this.itemId)
  }

  render() {
    const lines = this.lines.filter((l): l is string => typeof l === 'string' && l !== '')
    return (
      <div class="row">
        <div class="body">
          <div class="title">{this.label}</div>
          {lines.map((l) => <div class="line">{l}</div>)}
        </div>
        {this.value !== undefined && <div class={{ value: true, [this.tone ?? '']: this.tone !== undefined }}>{this.value}</div>}
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label="Delete?">
              <span>Delete?</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={this.onYes}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = false)}>No</button>
            </span>
          ) : (
            <button type="button" class="del" data-act="delete" aria-label={this.removeLabel ?? `Delete ${this.label}`} onClick={() => (this.confirming = true)}>Delete</button>
          )}
        </div>
      </div>
    )
  }
}
