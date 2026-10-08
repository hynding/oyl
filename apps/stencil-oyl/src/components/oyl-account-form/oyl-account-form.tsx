import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Account } from '@oyl/all-of-oyl'
import { CURRENCIES } from '../../finance/format.js'

export interface AccountsWriter {
  add(a: Account): Promise<unknown>
}

/** Add an account: a name and its currency. */
@Component({ tag: 'oyl-account-form', styleUrl: 'oyl-account-form.css', shadow: true })
export class OylAccountForm {
  @Element() host!: HTMLElement

  @Prop() store!: AccountsWriter

  /** An account was added through the store. */
  @Event() added!: EventEmitter<void>

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
      const name = (this.field('name')?.value ?? '').trim()
      await this.store.add(new Account({ name, currency: this.currency }))
      const f = this.field('name')
      if (f) f.value = ''
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <div class="row2">
          <ui-field name="name" label="Name" error={this.error || undefined} />
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
          <ui-button type="submit" variant="primary">Add account</ui-button>
        </div>
      </form>
    )
  }
}
