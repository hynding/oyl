import { Consumption } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/consumables-store.js').createConsumablesStore>} ConsumablesStore */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */

/** @type {ReadonlyArray<readonly [keyof Nutrients, string]>} */
const NUTRIENT_FIELDS = [
  ['calories', 'Calories'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['waterMl', 'Water (ml)'],
]

const styles = sheet(`
  form { display: grid; gap: .5rem; }
  .modes { display: flex; gap: 1rem; font-size: .9rem; }
  .modes label { display: inline-flex; gap: .3rem; align-items: center; }
  .nutrients { display: flex; flex-wrap: wrap; gap: .4rem; }
  .nutrients input { inline-size: 7rem; }
  .group[hidden] { display: none; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  label.field { display: grid; gap: .15rem; font-size: .8rem; color: var(--color-muted); }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylNutritionComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {ConsumablesStore} */
    this.consumables = /** @type {ConsumablesStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => DayKey} */
    this.getDay = /** @type {() => DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onLogged = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const modeConsumable = this._radio('mode', 'consumable', 'From consumable', true)
    const modeAdhoc = this._radio('mode', 'adhoc', 'Ad-hoc', false)
    const modes = document.createElement('div')
    modes.className = 'modes'
    modes.append(modeConsumable.label, modeAdhoc.label)

    const select = document.createElement('select')
    select.name = 'consumable'
    select.setAttribute('aria-label', 'Consumable')
    const consumableGroup = document.createElement('div')
    consumableGroup.className = 'group'
    consumableGroup.append(select)
    // Keep the option list in sync with the catalog.
    this.track(() => {
      const cur = select.value
      select.replaceChildren()
      for (const f of this.consumables.all()) {
        const o = document.createElement('option')
        o.value = f.id
        o.textContent = f.name
        select.append(o)
      }
      select.value = cur
    })

    const noteInput = document.createElement('input')
    noteInput.name = 'note'
    noteInput.placeholder = 'Meal name'
    noteInput.setAttribute('aria-label', 'Meal name')
    /** @type {Array<[keyof Nutrients, HTMLInputElement]>} */
    const nutrientInputs = []
    const adhocFields = document.createElement('div')
    adhocFields.className = 'nutrients'
    for (const [key, label] of NUTRIENT_FIELDS) {
      const i = document.createElement('input')
      i.type = 'number'
      i.min = '0'
      i.step = 'any'
      i.name = key
      i.placeholder = label
      i.setAttribute('aria-label', label)
      nutrientInputs.push([key, i])
      adhocFields.append(i)
    }
    const adhocGroup = document.createElement('div')
    adhocGroup.className = 'group'
    adhocGroup.hidden = true
    adhocGroup.append(noteInput, adhocFields)

    const servings = document.createElement('input')
    servings.type = 'number'
    servings.name = 'servings'
    servings.min = '0'
    servings.step = 'any'
    servings.value = '1'
    servings.setAttribute('aria-label', 'Servings')
    const servingsField = this._field('Servings', servings)

    const whenInput = document.createElement('input')
    whenInput.type = 'datetime-local'
    whenInput.name = 'when'
    whenInput.setAttribute('aria-label', 'When')
    this._syncWhen(whenInput)
    const whenField = this._field('When', whenInput)

    const log = document.createElement('button')
    log.type = 'submit'
    log.className = 'primary'
    log.textContent = 'Log it'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(modes, consumableGroup, adhocGroup, servingsField, whenField, log, error)
    root.append(formEl)

    const onMode = () => {
      const adhoc = modeAdhoc.input.checked
      adhocGroup.hidden = !adhoc
      consumableGroup.hidden = adhoc
    }
    modeConsumable.input.addEventListener('change', onMode, { signal: this.lifecycle })
    modeAdhoc.input.addEventListener('change', onMode, { signal: this.lifecycle })

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const occurredAt = new Date(whenInput.value)
        const s = Number(servings.value)
        let consumption
        if (modeAdhoc.input.checked) {
          /** @type {Nutrients} */
          const nutrients = {}
          for (const [key, input] of nutrientInputs) {
            const rawVal = input.value.trim()
            if (rawVal !== '') nutrients[key] = Number(rawVal)
          }
          const note = noteInput.value.trim()
          consumption = new Consumption({ occurredAt, nutrients, servings: s, ...(note !== '' ? { note } : {}) })
        } else {
          const consumable = this.consumables.all().find((f) => f.id === select.value)
          if (!consumable) throw new Error('Pick a consumable to log')
          consumption = new Consumption({ occurredAt, consumable: { id: consumable.id, nutrients: consumable.nutrients }, servings: s })
        }
        await this.store.add(consumption)
        this._syncWhen(whenInput)
        servings.value = '1'
        noteInput.value = ''
        for (const [, input] of nutrientInputs) input.value = ''
        this.onLogged()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }

  /** @param {string} name @param {string} value @param {string} label @param {boolean} checked @returns {{ label: HTMLLabelElement, input: HTMLInputElement }} */
  _radio(name, value, label, checked) {
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = name
    input.value = value
    input.checked = checked
    const el = document.createElement('label')
    el.append(input, document.createTextNode(label))
    return { label: el, input }
  }

  /** @param {string} label @param {HTMLElement} control @returns {HTMLLabelElement} */
  _field(label, control) {
    const el = document.createElement('label')
    el.className = 'field'
    el.append(document.createTextNode(label), control)
    return el
  }

  /** @param {HTMLInputElement} whenInput */
  _syncWhen(whenInput) {
    const day = this.getDay()
    const d = now()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    whenInput.value = `${day.value}T${hh}:${mm}`
  }
}

/** Register the element (idempotent). */
export function defineNutritionComposer() {
  if (!customElements.get('oyl-nutrition-composer')) customElements.define('oyl-nutrition-composer', OylNutritionComposer)
}
