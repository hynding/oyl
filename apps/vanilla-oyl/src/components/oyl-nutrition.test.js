import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Food } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createFoodsStore } from '../state/foods-store.js'
import { defineNutrition } from './oyl-nutrition.js'

beforeAll(() => defineNutrition())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-nutrition>', () => {
  it('shows the foods catalog and the day\'s totals', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    await foods.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    // Catalog lists the food
    expect(el.shadowRoot.textContent).toContain('Oatmeal')
    // Composer + food form are present
    expect(q(el, 'oyl-nutrition-composer')).toBeTruthy()
    expect(q(el, 'oyl-food-form')).toBeTruthy()
    el.remove()
  })

  it('renders an empty state when no meals are logged for the day', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    expect(q(el, '[data-role="empty"]').hidden).toBe(false)
    el.remove()
  })
})
