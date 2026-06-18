import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository } from '@oyl/all-of-oyl'
import { createConsumablesStore } from '../state/consumables-store.js'
import { defineConsumableForm } from './oyl-consumable-form.js'

beforeAll(() => defineConsumableForm())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} store */
function form(store) {
  const el = /** @type {any} */ (document.createElement('oyl-consumable-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-consumable-form>', () => {
  it('adds a consumable with the typed name and entered nutrients', async () => {
    const store = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = 'Banana'
    q(el, 'input[name="calories"]').value = '105'
    q(el, 'input[name="carbs"]').value = '27'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const consumables = store.all()
    expect(consumables).toHaveLength(1)
    const first = /** @type {NonNullable<typeof consumables[0]>} */ (consumables[0])
    expect(first.name).toBe('Banana')
    expect(first.nutrients).toEqual({ calories: 105, carbs: 27 })
    el.remove()
  })

  it('shows an inline error and adds nothing for an empty name', async () => {
    const store = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = '   '
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.all()).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
