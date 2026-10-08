import { Component, Element, Event, Prop, State, h, type EventEmitter } from '@stencil/core'
import { Consumable, toSlug } from '@oyl/all-of-oyl'
import { NUTRIENT_FIELDS, readNutrients } from '../../nutrition/format.js'

export interface ConsumablesWriter {
  add(c: Consumable): Promise<unknown>
}

/** Add a consumable to the shared catalog: name + per-serving facts (slug derived from the name). */
@Component({ tag: 'oyl-consumable-form', styleUrl: 'oyl-consumable-form.css', shadow: true })
export class OylConsumableForm {
  @Element() host!: HTMLElement

  @Prop() store!: ConsumablesWriter

  /** A consumable was added through the store. */
  @Event() added!: EventEmitter<void>

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
      const consumable = new Consumable({ name, slug: toSlug(name), facts: readNutrients(this.host.shadowRoot) })
      await this.store.add(consumable)
      for (const el of this.host.shadowRoot!.querySelectorAll<HTMLElement & { value: string }>('ui-field')) el.value = ''
      this.added.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  render() {
    return (
      <form onSubmit={this.onSubmit}>
        <ui-field name="name" label="Name" error={this.error || undefined} />
        <div class="nutrients">
          {NUTRIENT_FIELDS.map(([key, label]) => <ui-field name={key} label={label} type="number" />)}
        </div>
        <p data-role="error" aria-live="polite">{this.error}</p>
        <div class="actions">
          <ui-button type="submit" variant="primary">Add consumable</ui-button>
        </div>
      </form>
    )
  }
}
