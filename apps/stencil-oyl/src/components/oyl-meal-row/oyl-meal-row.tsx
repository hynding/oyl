import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Consumption, Id } from '@oyl/all-of-oyl'
import { consumptionMeta } from '../../nutrition/format.js'

/**
 * One logged meal: label + meta | inline Delete → Yes/No (native buttons, the shared
 * confirm cluster, so the e2e `inlineConfirm` helper applies). The screen resolves the
 * label (catalog name / note / "Meal" + servings) because only it sees the catalog.
 */
@Component({ tag: 'oyl-meal-row', styleUrl: 'oyl-meal-row.css', shadow: true })
export class OylMealRow {
  @Element() host!: HTMLElement

  @Prop() consumption!: Consumption
  @Prop() label!: string

  /** The user confirmed deletion of this meal. */
  @Event() remove!: EventEmitter<Id>

  @State() confirming = false

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  render() {
    const c = this.consumption
    return (
      <div class="row">
        <div class="body">
          <div class="title">{this.label}</div>
          <div class="meta">{consumptionMeta(c)}</div>
        </div>
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label="Delete?">
              <span>Delete?</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={() => { this.confirming = false; this.remove.emit(c.id) }}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = false)}>No</button>
            </span>
          ) : (
            <button type="button" class="del" data-act="delete" aria-label={`Delete ${this.label}`} onClick={() => (this.confirming = true)}>Delete</button>
          )}
        </div>
      </div>
    )
  }
}
