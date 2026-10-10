import { Component, Element, Prop, State, h } from '@stencil/core'
import { DayKey, type Consumable, type Consumption, type Id, type Nutrients } from '@oyl/all-of-oyl'
import { signal, effect, now, type Signal } from '@oyl/all-of-oyl/client'
import { formatDayHeading, formatNutrients } from '@oyl/all-of-oyl/format'
import { isEditableTarget } from '../../lib/keys.js'
import { TILES, mealLabel, tileValue } from '../../nutrition/format.js'
import type { ConsumablesReader, ConsumableProductsReader, MealWriter } from '../oyl-meal-form/oyl-meal-form.js'
import type { ConsumablesWriter } from '../oyl-consumable-form/oyl-consumable-form.js'

export interface NutritionReader extends MealWriter {
  consumptionsOn(day: DayKey): readonly Consumption[]
  dailyNutrients(day: DayKey): Nutrients
  remove(id: Id): Promise<unknown>
}
export type ConsumablesStore = ConsumablesReader & ConsumablesWriter

/**
 * The day-scoped nutrition screen: `oyl-day-nav` (dots on days with meals), five totals
 * tiles, the meal composer, the day's meals newest first, and the shared consumables
 * catalog with a collapsed add form. Same lists and totals as vanilla's screen.
 */
@Component({ tag: 'oyl-nutrition', styleUrl: 'oyl-nutrition.css', shadow: true })
export class OylNutrition {
  @Element() host!: HTMLElement

  @Prop() store!: NutritionReader
  @Prop() consumables!: ConsumablesStore
  @Prop() consumableProducts?: ConsumableProductsReader
  @Prop() tz = 'UTC'

  @State() day!: DayKey
  @State() totals: Nutrients = {}
  @State() meals: readonly Consumption[] = []
  @State() catalog: readonly Consumable[] = []
  @State() announcement = ''

  private daySignal!: Signal<DayKey>
  private stop = () => {}

  componentWillLoad() {
    this.daySignal = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))
    // One effect: the day, the journal's revision (through its reads) and the catalog's.
    this.stop = effect(() => {
      const day = this.daySignal.get()
      this.day = day
      this.totals = this.store.dailyNutrients(day)
      this.meals = [...this.store.consumptionsOn(day)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      this.catalog = this.consumables.all()
    })
  }

  connectedCallback() {
    this.host.addEventListener('keydown', this.onKeydown)
  }

  disconnectedCallback() {
    this.host.removeEventListener('keydown', this.onKeydown)
    this.stop()
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (isEditableTarget(e)) return
    if (e.key === 'ArrowLeft') this.go(-1)
    else if (e.key === 'ArrowRight') this.go(1)
  }

  private go(delta: number) {
    this.setDay(this.daySignal.get().addDays(delta))
    void (this.host.shadowRoot?.querySelector('oyl-day-nav') as HTMLOylDayNavElement | null)?.focusHeading()
  }

  private setDay(day: DayKey) {
    this.daySignal.set(day)
    this.announcement = `Showing ${formatDayHeading(day)}`
  }

  private onDayChange = (e: CustomEvent<DayKey>) => {
    e.stopPropagation()
    this.setDay(e.detail)
  }

  private onRemove = (e: CustomEvent<Id>) => {
    e.stopPropagation()
    void this.store.remove(e.detail)
    this.announcement = 'Meal deleted'
  }

  private onLogged = (e: Event) => {
    e.stopPropagation()
    this.announcement = 'Meal logged'
  }

  private onAdded = (e: Event) => {
    e.stopPropagation()
    this.announcement = 'Consumable added'
  }

  private marked = (d: DayKey) => this.store.consumptionsOn(d).length > 0

  render() {
    const day = this.day
    const today = DayKey.from(now(), this.tz)
    const heading = formatDayHeading(day)
    const namesById = new Map(this.catalog.map((c) => [c.id as string, c.name]))
    return (
      <div class="screen">
        <oyl-day-nav day={day} today={today} marked={this.marked} announcement={this.announcement} onDayChange={this.onDayChange} />
        <div class="totals" data-role="totals" role="group" aria-label="Daily totals">
          {TILES.map(([key, unit]) => {
            const value = tileValue(this.totals, key)
            return (
              <div class="tile" aria-label={`${value} ${unit}`}>
                <b>{value}</b>
                <small>{unit}</small>
              </div>
            )
          })}
        </div>
        <oyl-meal-form store={this.store} consumables={this.consumables} consumableProducts={this.consumableProducts} day={day} onLogged={this.onLogged} />
        {this.meals.length > 0 ? (
          <ol>
            {this.meals.map((c) => (
              <li key={c.id}>
                <oyl-meal-row consumption={c} label={mealLabel(c, namesById)} onRemove={this.onRemove} />
              </li>
            ))}
          </ol>
        ) : (
          <div class="empty" data-role="empty">No meals logged for {heading}. Log one above.</div>
        )}
        <section class="catalog-section">
          <div class="section-label">Consumables</div>
          <details>
            <summary>New consumable</summary>
            <oyl-consumable-form store={this.consumables} onAdded={this.onAdded} />
          </details>
          <ol class="catalog">
            {this.catalog.map((c) => (
              <li key={c.id}>
                <span class="name">{c.name}</span>
                <span class="meta">{formatNutrients(c.facts)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    )
  }
}
