import { DayKey, sumNutrients } from '@oyl/all-of-oyl'
import { formatNutrients, relativeDayLabel, formatDayHeading, formatClockTime } from '@oyl/all-of-oyl/format'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { defineNutritionComposer } from './oyl-nutrition-composer.js'
import { defineConsumableForm } from './oyl-consumable-form.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/consumables-store.js').createConsumablesStore>} ConsumablesStore */

/**
 * Row meta for a logged consumption: per-serving nutrients, plus a scaled
 * calorie total when servings > 1 (omitted when the consumable has no calories).
 * @param {import('@oyl/all-of-oyl').Consumption} c
 * @returns {string}
 */
function consumptionMeta(c) {
  const perServing = formatNutrients(c.nutrients)
  const scaledCalories = sumNutrients([c]).calories
  const total = c.servings > 1 && scaledCalories !== undefined
    ? ` · ${Math.round(scaledCalories)} kcal total`
    : ''
  return `${perServing}${total} · ${formatClockTime(c.occurredAt)}`
}

const styles = sheet(`
  :host { display: block; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; }
  .rel { color: var(--color-muted); font-size: .85rem; }
  .totals { text-align: center; font-size: 1rem; margin: .4rem 0 1.4rem; color: var(--color-text); }
  oyl-nutrition-composer { display: block; margin-block-end: 1.4rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .4rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; align-items: baseline; gap: .6rem; padding: .5rem 0; border-block-end: 1px solid var(--color-border); }
  .meta { color: var(--color-muted); font-size: .85rem; }
  button.del { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; }
  .empty { color: var(--color-muted); padding: 1.5rem 0; text-align: center; }
  oyl-consumable-form { display: block; margin-block-start: .4rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylNutrition extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {ConsumablesStore} */
    this.consumables = /** @type {ConsumablesStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    defineNutritionComposer()
    defineConsumableForm()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('‹', 'Previous day')
    const next = this._navButton('›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    const totals = document.createElement('div')
    totals.className = 'totals'
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-nutrition-composer.js').OylNutritionComposer} */ (document.createElement('oyl-nutrition-composer'))
    composer.store = this.store
    composer.consumables = this.consumables
    composer.getDay = () => this._day.get()
    composer.onLogged = () => { live.textContent = 'Meal logged' }

    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.dataset.role = 'empty'

    const catLabel = document.createElement('div')
    catLabel.className = 'section-label'
    catLabel.textContent = 'Consumables'
    const consumableForm = /** @type {import('./oyl-consumable-form.js').OylConsumableForm} */ (document.createElement('oyl-consumable-form'))
    consumableForm.store = this.consumables
    consumableForm.onAdded = () => { live.textContent = 'Consumable added' }
    const consumableList = document.createElement('ol')

    root.append(daynav, totals, live, composer, list, empty, catLabel, consumableForm, consumableList)

    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })
    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.composedPath()[0] ?? null)
      const tag = t ? t.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })

    // Day's consumptions + totals (reactive on the journal).
    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      h2.textContent = formatDayHeading(day)
      rel.textContent = relativeDayLabel(day, today)

      const totalSummary = formatNutrients(this.store.dailyNutrients(day))
      totals.textContent = totalSummary === '' ? 'Nothing logged yet' : totalSummary

      const consumptions = [...this.store.consumptionsOn(day)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      const byId = new Map(this.consumables.all().map((f) => [f.id, f.name]))
      list.replaceChildren()
      for (const c of consumptions) {
        const li = document.createElement('li')
        const name = document.createElement('span')
        const label = (c.consumableId !== undefined ? byId.get(c.consumableId) : undefined) ?? c.note ?? 'Meal'
        name.textContent = c.servings === 1 ? label : `${label} ×${c.servings}`
        const meta = document.createElement('span')
        meta.className = 'meta'
        meta.textContent = consumptionMeta(c)
        const del = document.createElement('button')
        del.className = 'del'
        del.type = 'button'
        del.textContent = 'Delete'
        del.setAttribute('aria-label', `Delete ${label}`)
        del.addEventListener('click', () => { void this.store.remove(c.id); live.textContent = 'Meal deleted' })
        li.append(name, meta, del)
        list.append(li)
      }
      empty.hidden = consumptions.length > 0
      empty.textContent = consumptions.length > 0 ? '' : `No meals logged for ${formatDayHeading(day)}. Log one above.`
    })

    // Consumables catalog (reactive on the consumables store). No delete/edit affordance:
    // catalog-item delete/update is a deferred backend capability (Sub-project B/D), so we
    // don't render a button that the catalog read-adapter would silently no-op.
    this.track(() => {
      const consumables = this.consumables.all()
      consumableList.replaceChildren()
      for (const f of consumables) {
        const li = document.createElement('li')
        const name = document.createElement('span')
        name.textContent = f.name
        const meta = document.createElement('span')
        meta.className = 'meta'
        meta.textContent = formatNutrients(f.nutrients)
        li.append(name, meta)
        consumableList.append(li)
      }
    })
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(glyph, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function defineNutrition() {
  if (!customElements.get('oyl-nutrition')) customElements.define('oyl-nutrition', OylNutrition)
}
