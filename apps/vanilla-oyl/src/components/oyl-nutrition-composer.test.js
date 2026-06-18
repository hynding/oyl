import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Consumable, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createConsumablesStore } from '../state/consumables-store.js'
import { defineNutritionComposer } from './oyl-nutrition-composer.js'

beforeAll(() => defineNutritionComposer())
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

/** @param {any} store @param {any} consumables */
function composer(store, consumables) {
  const el = /** @type {any} */ (document.createElement('oyl-nutrition-composer'))
  el.store = store
  el.consumables = consumables
  el.getDay = () => DayKey.from(new Date(), TZ)
  document.body.append(el)
  return el
}

describe('<oyl-nutrition-composer>', () => {
  it('logs a consumption from the selected consumable with servings', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const oatmeal = await consumables.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    const el = composer(store, consumables)
    await settle()
    q(el, 'select[name="consumable"]').value = oatmeal.id
    q(el, 'input[name="servings"]').value = '2'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const today = DayKey.from(new Date(), TZ)
    const logged = store.consumptionsOn(today)
    expect(logged).toHaveLength(1)
    const first = /** @type {NonNullable<typeof logged[0]>} */ (logged[0])
    expect(first.servings).toBe(2)
    expect(first.consumableId).toBe(oatmeal.id)
    el.remove()
  })

  it('logs an ad-hoc consumption from entered nutrients', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer(store, consumables)
    await settle()
    q(el, 'input[name="mode"][value="adhoc"]').checked = true
    q(el, 'input[name="mode"][value="adhoc"]').dispatchEvent(new Event('change', { bubbles: true }))
    q(el, 'input[name="note"]').value = 'Restaurant burger'
    q(el, 'input[name="calories"]').value = '800'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const today = DayKey.from(new Date(), TZ)
    const logged = store.consumptionsOn(today)
    expect(logged).toHaveLength(1)
    const first = /** @type {NonNullable<typeof logged[0]>} */ (logged[0])
    expect(first.nutrients).toEqual({ calories: 800 })
    expect(first.note).toBe('Restaurant burger')
    el.remove()
  })

  it('shows an error when consumable-mode is submitted with no consumable selected', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer(store, consumables)
    await settle()
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.consumptionsOn(DayKey.from(new Date(), TZ))).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
