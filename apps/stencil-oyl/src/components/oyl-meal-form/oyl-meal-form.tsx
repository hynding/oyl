import { Component, Element, Event, Prop, State, Watch, h, type EventEmitter } from '@stencil/core'
import { Consumption, effectiveFacts, type Consumable, type ConsumableProduct, type DayKey, type Entry } from '@oyl/all-of-oyl'
import { effect } from '@oyl/all-of-oyl/client'
import { NUTRIENT_FIELDS, readNutrients } from '../../nutrition/format.js'

export interface MealWriter {
  add(entry: Entry): Promise<unknown>
}
export interface ConsumablesReader {
  all(): readonly Consumable[]
}
export interface ConsumableProductsReader {
  all(): readonly ConsumableProduct[]
}

type Mode = 'catalog' | 'adhoc'
const NO_PRODUCT = { value: '', label: '— no specific product —' }

/**
 * The meal composer: log from the shared catalog (optionally a specific product) or an
 * ad-hoc meal with its own nutrients; servings and a `when` prefilled to the shown day.
 * Builds the Consumption exactly as vanilla does (product → effective facts, catalog →
 * snapshot, ad-hoc → given nutrients). Native <form> over form-associated primitives.
 */
@Component({ tag: 'oyl-meal-form', styleUrl: 'oyl-meal-form.css', shadow: true })
export class OylMealForm {
  @Element() host!: HTMLElement

  @Prop() store!: MealWriter
  @Prop() consumables!: ConsumablesReader
  @Prop() consumableProducts?: ConsumableProductsReader
  /** The day new meals default to (the screen's shown day). */
  @Prop() day!: DayKey

  /** A meal was logged through the store. */
  @Event() logged!: EventEmitter<void>

  @State() mode: Mode = 'catalog'
  @State() consumableId = ''
  @State() productId = ''
  @State() error = ''
  @State() when = ''
  @State() catalog: readonly Consumable[] = []
  @State() products: readonly ConsumableProduct[] = []

  private stop = () => {}

  componentWillLoad() {
    this.syncWhen()
    // Mirrors the catalogs; `all()` touches each store's revision, so this re-runs on adds/hydration.
    this.stop = effect(() => {
      this.catalog = this.consumables.all()
      this.products = this.consumableProducts?.all() ?? []
      if (!this.catalog.some((c) => c.id === this.consumableId)) this.consumableId = this.catalog[0]?.id ?? ''
    })
  }

  disconnectedCallback() {
    this.stop()
  }

  @Watch('day')
  onDayChange() {
    this.syncWhen()
  }

  /** `${day}THH:MM` — the shown day at the current clock time (vanilla's rule). */
  private syncWhen() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    this.when = `${this.day.value}T${hh}:${mm}`
  }

  private field(name: string): (HTMLElement & { value: string }) | null {
    return this.host.shadowRoot?.querySelector(`ui-field[name="${name}"]`) as (HTMLElement & { value: string }) | null
  }

  private productsFor(consumableId: string): readonly ConsumableProduct[] {
    return this.products.filter((p) => p.consumableId === consumableId)
  }

  private onSubmit = (ev: Event) => {
    ev.preventDefault()
    void this.submit()
  }

  private onKeydown = (ev: KeyboardEvent) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault()
      void this.submit()
    }
  }

  private onConsumable = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.consumableId = e.detail.value
    this.productId = ''
  }

  private onProduct = (e: CustomEvent<{ value: string }>) => {
    e.stopPropagation()
    this.productId = e.detail.value
  }

  private async submit() {
    this.error = ''
    try {
      const occurredAt = new Date(this.field('when')?.value ?? this.when)
      const servings = Number(this.field('servings')?.value ?? '1')
      let consumption: Consumption
      if (this.mode === 'adhoc') {
        const note = (this.field('note')?.value ?? '').trim()
        consumption = new Consumption({ occurredAt, nutrients: readNutrients(this.host.shadowRoot), servings, ...(note !== '' ? { note } : {}) })
      } else {
        const consumable = this.catalog.find((c) => c.id === this.consumableId)
        if (!consumable) throw new Error('Pick a consumable to log')
        const product = this.productId ? this.productsFor(consumable.id).find((p) => p.id === this.productId) : undefined
        consumption = product
          ? new Consumption({ occurredAt, nutrients: effectiveFacts(product, consumable) ?? consumable.facts, servings, consumableId: consumable.id, consumableProductId: product.id })
          : new Consumption({ occurredAt, consumable: { id: consumable.id, nutrients: consumable.facts }, servings })
      }
      await this.store.add(consumption)
      this.reset()
      this.logged.emit()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    }
  }

  private reset() {
    const servings = this.field('servings')
    if (servings) servings.value = '1'
    for (const name of ['note', ...NUTRIENT_FIELDS.map(([k]) => k)]) { const f = this.field(name); if (f) f.value = '' }
    this.syncWhen()
  }

  render() {
    const catalog = this.mode === 'catalog'
    const products = catalog ? this.productsFor(this.consumableId) : []
    return (
      <ui-card>
        <form onSubmit={this.onSubmit} onKeyDown={this.onKeydown}>
          <ui-segment
            name="mode"
            label="Meal source"
            options={[{ value: 'catalog', label: 'From catalog' }, { value: 'adhoc', label: 'Ad-hoc' }]}
            value={this.mode}
            onUiChange={(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.mode = e.detail.value as Mode; this.error = '' }}
          />
          {catalog ? (
            <div class="fields">
              <ui-select
                name="consumable"
                label="Consumable"
                options={this.catalog.map((c) => ({ value: c.id, label: c.name }))}
                value={this.consumableId}
                onUiChange={this.onConsumable}
              />
              {products.length > 0 && (
                <ui-select
                  name="consumableProduct"
                  label="Product (optional)"
                  options={[NO_PRODUCT, ...products.map((p) => ({ value: p.id, label: p.name }))]}
                  value={this.productId}
                  onUiChange={this.onProduct}
                />
              )}
            </div>
          ) : (
            <div class="fields">
              <ui-field name="note" label="Meal name" />
              <div class="nutrients">
                {NUTRIENT_FIELDS.map(([key, label]) => <ui-field name={key} label={label} type="number" />)}
              </div>
            </div>
          )}
          <div class="row2">
            <ui-field name="servings" label="Servings" type="number" value="1" />
            <ui-field name="when" label="When" type="datetime-local" value={this.when} />
          </div>
          <p data-role="error" aria-live="polite">{this.error}</p>
          <div class="actions">
            <ui-button type="submit" variant="primary">Log it</ui-button>
          </div>
        </form>
      </ui-card>
    )
  }
}
