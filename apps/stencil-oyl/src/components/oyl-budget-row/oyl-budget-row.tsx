import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import type { Budget, GoalProgress, Id, Money } from '@oyl/all-of-oyl'
import { budgetLabel } from '../../finance/format.js'

export interface BudgetStatus {
  progress: GoalProgress
  spent: Money
}

/**
 * One budget: name (or category), a progress bar of the month's spending against the limit
 * (warn tone when over), the "spent of limit · left/over by" line, and the inline Delete.
 * `status` is a fresh object per screen render, which is what re-renders the row.
 */
@Component({ tag: 'oyl-budget-row', styleUrl: 'oyl-budget-row.css', shadow: true })
export class OylBudgetRow {
  @Element() host!: HTMLElement

  @Prop() budget!: Budget
  @Prop() status!: BudgetStatus

  /** The user confirmed deletion of this budget. */
  @Event() remove!: EventEmitter<Id>

  @State() confirming = false

  componentDidRender() {
    if (this.confirming) (this.host.shadowRoot?.querySelector('[data-act="confirm-no"]') as HTMLElement | null)?.focus()
  }

  private onYes = () => {
    this.confirming = false
    this.remove.emit(this.budget.id)
  }

  render() {
    const { progress, spent } = this.status
    const over = progress.met === false
    return (
      <div class="row">
        <div class="title">{this.budget.name ?? this.budget.category}</div>
        <div class="actions">
          {this.confirming ? (
            <span class="confirm" role="group" aria-label="Delete?">
              <span>Delete?</span>
              <button type="button" class="yes" data-act="confirm-yes" onClick={this.onYes}>Yes</button>
              <button type="button" class="no" data-act="confirm-no" onClick={() => (this.confirming = false)}>No</button>
            </span>
          ) : (
            <button type="button" class="del" data-act="delete" aria-label={`Delete ${this.budget.name ?? this.budget.category}`} onClick={() => (this.confirming = true)}>Delete</button>
          )}
        </div>
        <div class={{ bar: true, over }} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={String(Math.round(progress.ratio * 100))}>
          <div class="fill" style={{ 'inline-size': `${Math.round(progress.ratio * 100)}%` }} />
        </div>
        <div class={{ label: true, over }}>{budgetLabel(progress, spent, this.budget.limit)}</div>
      </div>
    )
  }
}
