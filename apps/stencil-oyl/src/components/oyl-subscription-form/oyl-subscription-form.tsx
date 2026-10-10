import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Cadence, DayKey, Money, Subscription, type CadenceUnit } from '@oyl/all-of-oyl'
import { now } from '@oyl/all-of-oyl/client'
import { CURRENCIES } from '../../finance/format.js'
import { CADENCE_UNITS, SUBSCRIPTION_CATEGORIES, clearFields, fieldValue } from '../../vault/format.js'

export interface SubscriptionsWriter {
  addSubscription(s: Subscription): Promise<unknown>
}

const todayIso = () => now().toISOString().slice(0, 10)

/** Add a subscription: name, amount + currency, cadence, the day it renews on, category. */
@Component({ tag: 'oyl-subscription-form', styleUrl: 'oyl-subscription-form.css', shadow: true })
export class OylSubscriptionForm {
  @Element() host!: HTMLElement

  @Prop() store!: SubscriptionsWriter

  /** A subscription was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() currency: string = CURRENCIES[0]!
  @State() unit = 'months'
  @State() category: string = SUBSCRIPTION_CATEGORIES[0]!
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
    const sr = this.host.shadowRoot
    try {
      const sub = new Subscription({
        name: fieldValue(sr, 'name'),
        amount: Money.fromMajor(Number(fieldValue(sr, 'amount')), this.currency),
        cadence: Cadence.of(Number(fieldValue(sr, 'cadenceN')), this.unit as CadenceUnit),
        anchor: DayKey.of(fieldValue(sr, 'anchor')),
        category: this.category,
      })
      await this.store.addSubscription(sub)
      // vanilla's form.reset(): every control back to its default.
      clearFields(sr)
      const n = this.field('cadenceN'); if (n) n.value = '1'
      const anchor = this.field('anchor'); if (anchor) anchor.value = todayIso()
      this.currency = CURRENCIES[0]!
      this.unit = 'months'
      this.category = SUBSCRIPTION_CATEGORIES[0]!
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  private onSelect = (key: 'currency' | 'unit' | 'category') => (e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this[key] = e.detail.value }
  private onCurrency = this.onSelect('currency')
  private onUnit = this.onSelect('unit')
  private onCategory = this.onSelect('category')

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <ui-field name="name" label="Name" error={this.error || undefined} />
        <div class="row2">
          <div class="price">
            <ui-field name="amount" label="Amount" type="number" />
            <ui-select name="currency" label="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={this.currency} onUiChange={this.onCurrency} />
          </div>
          <div class="cadence">
            <ui-field name="cadenceN" label="Every" type="number" value="1" />
            <ui-select name="cadenceUnit" label="Unit" options={CADENCE_UNITS.map((u) => ({ value: u, label: u }))} value={this.unit} onUiChange={this.onUnit} />
          </div>
        </div>
        <div class="row2">
          <ui-field name="anchor" label="Renews on" type="date" value={todayIso()} />
          <ui-select name="category" label="Category" options={SUBSCRIPTION_CATEGORIES.map((c) => ({ value: c, label: c }))} value={this.category} onUiChange={this.onCategory} />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add to vault</ui-button>
        </div>
      </form>
    )
  }
}
