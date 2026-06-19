import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Consumable, Consumption } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createConsumablesStore } from '../state/consumables-store.js'
import { defineNutrition } from './oyl-nutrition.js'

beforeAll(() => defineNutrition())
const settle = () => new Promise((r) => setTimeout(r, 0))

/** @returns {import('../state/journal-store.js').ReposByKind} */
function makeReposByKind() {
  return {
    'note': /** @type {any} */ (new InMemoryRepository()),
    'consumption': /** @type {any} */ (new InMemoryRepository()),
    'transaction': /** @type {any} */ (new InMemoryRepository()),
    'measurement': /** @type {any} */ (new InMemoryRepository()),
    'activity-session': /** @type {any} */ (new InMemoryRepository()),
  }
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-nutrition>', () => {
  it('shows the consumables catalog and the day\'s totals', async () => {
    const store = createJournalStore(makeReposByKind(), 'UTC')
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    await consumables.add(new Consumable({ name: 'Oatmeal', facts: { calories: 150 } }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.consumables = consumables
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    // Catalog lists the consumable
    expect(el.shadowRoot.textContent).toContain('Oatmeal')
    // Composer + consumable form are present
    expect(q(el, 'oyl-nutrition-composer')).toBeTruthy()
    expect(q(el, 'oyl-consumable-form')).toBeTruthy()
    el.remove()
  })

  it('renders an empty state when no meals are logged for the day', async () => {
    const store = createJournalStore(makeReposByKind(), 'UTC')
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.consumables = consumables
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    expect(q(el, '[data-role="empty"]').hidden).toBe(false)
    el.remove()
  })

  /** @param {any} el @returns {any} */
  const firstMealRow = (el) => el.shadowRoot.querySelectorAll('ol')[0].querySelector('li')

  it('shows per-serving nutrients and a scaled calorie total for a multi-serving meal', async () => {
    const store = createJournalStore(makeReposByKind(), 'UTC')
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const oatmeal = await consumables.add(new Consumable({ name: 'Oatmeal', facts: { calories: 150, protein: 5 } }))
    await store.add(new Consumption({ occurredAt: new Date(), consumable: { id: oatmeal.id, nutrients: oatmeal.facts }, servings: 2 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.consumables = consumables
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('150 kcal')       // per serving
    expect(row.textContent).toContain('300 kcal total') // scaled contribution
    el.remove()
  })

  it('omits the total for a single-serving meal', async () => {
    const store = createJournalStore(makeReposByKind(), 'UTC')
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Consumption({ occurredAt: new Date(), nutrients: { calories: 150 }, servings: 1 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.consumables = consumables
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('150 kcal')
    expect(row.textContent).not.toContain('total')
    el.remove()
  })

  it('omits the total for a multi-serving meal with no calories', async () => {
    const store = createJournalStore(makeReposByKind(), 'UTC')
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Consumption({ occurredAt: new Date(), nutrients: { waterMl: 500 }, servings: 2 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.consumables = consumables
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('500 ml')
    expect(row.textContent).not.toContain('total')
    el.remove()
  })
})
