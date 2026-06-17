import { Food } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/foods-store.js').createFoodsStore>} FoodsStore */
/** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */

/** @type {ReadonlyArray<readonly [keyof Nutrients, string]>} */
const NUTRIENT_FIELDS = [
  ['calories', 'Calories'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['waterMl', 'Water (ml)'],
]

// Mirror oyl-account-form.js styles; the nutrient inputs sit in a wrap row.
const styles = sheet(`
  form { display: grid; gap: .5rem; }
  .nutrients { display: flex; flex-wrap: wrap; gap: .4rem; }
  .nutrients input { inline-size: 7rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylFoodForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {FoodsStore} */
    this.store = /** @type {FoodsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const name = document.createElement('input')
    name.name = 'name'
    name.placeholder = 'Food name'
    name.setAttribute('aria-label', 'Food name')

    /** @type {Array<[keyof Nutrients, HTMLInputElement]>} */
    const inputs = []
    const fields = document.createElement('div')
    fields.className = 'nutrients'
    for (const [key, label] of NUTRIENT_FIELDS) {
      const i = document.createElement('input')
      i.type = 'number'
      i.min = '0'
      i.step = 'any'
      i.name = key
      i.placeholder = label
      i.setAttribute('aria-label', label)
      inputs.push([key, i])
      fields.append(i)
    }

    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add food'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(name, fields, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        /** @type {Nutrients} */
        const nutrients = {}
        for (const [key, input] of inputs) {
          const raw = input.value.trim()
          if (raw !== '') nutrients[key] = Number(raw)
        }
        const food = new Food({ name: name.value.trim(), nutrients })
        await this.store.add(food)
        name.value = ''
        for (const [, input] of inputs) input.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineFoodForm() {
  if (!customElements.get('oyl-food-form')) customElements.define('oyl-food-form', OylFoodForm)
}
