import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { DayKey, Money, Possession } from '@oyl/all-of-oyl'
import { CURRENCIES } from '../../finance/format.js'
import { clearFields, fieldValue } from '../../vault/format.js'

export interface PossessionsWriter {
  addPossession(p: Possession): Promise<unknown>
}

/** Add a possession: name plus optional location, warranty, price and purchase day. */
@Component({ tag: 'oyl-possession-form', styleUrl: 'oyl-possession-form.css', shadow: true })
export class OylPossessionForm {
  @Element() host!: HTMLElement

  @Prop() store!: PossessionsWriter

  /** A possession was added through the store. */
  @Event() added!: EventEmitter<void>

  @State() currency: string = CURRENCIES[0]!
  @State() error = ''

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private async submit() {
    this.error = ''
    const sr = this.host.shadowRoot
    try {
      const props: ConstructorParameters<typeof Possession>[0] = { name: fieldValue(sr, 'name') }
      const location = fieldValue(sr, 'location')
      if (location) props.location = location
      const warranty = fieldValue(sr, 'warrantyUntil')
      if (warranty) props.warrantyUntil = DayKey.of(warranty)
      const amount = fieldValue(sr, 'amount')
      const amt = Number(amount)
      if (amount && amt > 0) props.purchasePrice = Money.fromMajor(amt, this.currency)
      const purchasedOn = fieldValue(sr, 'purchasedOn')
      if (purchasedOn) props.purchasedOn = DayKey.of(purchasedOn)
      await this.store.addPossession(new Possession(props))
      clearFields(sr)
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <ui-field name="name" label="Name" error={this.error || undefined} />
        <div class="row2">
          <ui-field name="location" label="Location (optional)" />
          <ui-field name="warrantyUntil" label="Warranty until (optional)" type="date" />
        </div>
        <div class="row2">
          <div class="price">
            <ui-field name="amount" label="Price (optional)" type="number" />
            <ui-select
              name="currency"
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              value={this.currency}
              onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.currency = e.detail.value }}
            />
          </div>
          <ui-field name="purchasedOn" label="Purchased (optional)" type="date" />
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add to vault</ui-button>
        </div>
      </form>
    )
  }
}
