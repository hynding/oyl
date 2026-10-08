import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Budget, Money } from '@oyl/all-of-oyl'
import { CURRENCIES, EXPENSE_CATEGORIES } from '../../finance/format.js'

export interface BudgetsWriter {
  add(b: Budget): Promise<unknown>
}

/** Add a monthly budget: an expense category, a limit and its currency. */
@Component({ tag: 'oyl-budget-form', styleUrl: 'oyl-budget-form.css', shadow: true })
export class OylBudgetForm {
  @Element() host!: HTMLElement

  @Prop() store!: BudgetsWriter

  /** A budget was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() category: string = EXPENSE_CATEGORIES[0]!
  @State() currency: string = CURRENCIES[0]!
  @State() error = ''

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private async submit() {
    this.error = ''
    try {
      const limit = Number(this.field('limit')?.value ?? '')
      const budget = new Budget({ category: this.category, limit: Money.fromMajor(limit, this.currency) })
      await this.store.add(budget)
      const f = this.field('limit')
      if (f) f.value = ''
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <div class="row3">
          <ui-select
            name="category"
            label="Category"
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={this.category}
            onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.category = e.detail.value }}
          />
          <ui-field name="limit" label="Monthly limit" type="number" error={this.error || undefined} />
          <ui-select
            name="currency"
            label="Currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={this.currency}
            onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.currency = e.detail.value }}
          />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add budget</ui-button>
        </div>
      </form>
    )
  }
}
