import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository } from '@oyl/all-of-oyl'
import { createFoodsStore } from '../state/foods-store.js'
import { defineFoodForm } from './oyl-food-form.js'

beforeAll(() => defineFoodForm())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} store */
function form(store) {
  const el = /** @type {any} */ (document.createElement('oyl-food-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-food-form>', () => {
  it('adds a food with the typed name and entered nutrients', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = 'Banana'
    q(el, 'input[name="calories"]').value = '105'
    q(el, 'input[name="carbs"]').value = '27'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const foods = store.all()
    expect(foods).toHaveLength(1)
    const first = /** @type {NonNullable<typeof foods[0]>} */ (foods[0])
    expect(first.name).toBe('Banana')
    expect(first.nutrients).toEqual({ calories: 105, carbs: 27 })
    el.remove()
  })

  it('shows an inline error and adds nothing for an empty name', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = '   '
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.all()).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
