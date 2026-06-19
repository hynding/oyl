import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Consumable, ConsumableProduct, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createConsumablesStore } from '../state/consumables-store.js'
import { createConsumableProductsStore } from '../state/consumable-products-store.js'
import { defineNutritionComposer } from './oyl-nutrition-composer.js'

beforeAll(() => defineNutritionComposer())
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

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
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

/** @param {any} store @param {any} consumables @param {any} [consumableProducts] */
function composer(store, consumables, consumableProducts) {
  const el = /** @type {any} */ (document.createElement('oyl-nutrition-composer'))
  el.store = store
  el.consumables = consumables
  if (consumableProducts !== undefined) el.consumableProducts = consumableProducts
  el.getDay = () => DayKey.from(new Date(), TZ)
  document.body.append(el)
  return el
}

describe('<oyl-nutrition-composer>', () => {
  it('logs a consumption from the selected consumable with servings', async () => {
    const reposByKind = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
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

  // Deliverable A: per-kind routing + dailyNutrients assertions
  it('enqueues the consumption to the consumption repo specifically (not note/transaction repos)', async () => {
    const reposByKind = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const oatmeal = await consumables.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    const el = composer(store, consumables)
    await settle()
    q(el, 'select[name="consumable"]').value = oatmeal.id
    q(el, 'input[name="servings"]').value = '1'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()

    // Assert the consumption repo received the entry
    const consumptionRepo = /** @type {import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').Consumption>} */ (/** @type {any} */ (reposByKind['consumption']))
    const inConsumptionRepo = await consumptionRepo.list()
    expect(inConsumptionRepo).toHaveLength(1)
    const loggedConsumption = /** @type {NonNullable<typeof inConsumptionRepo[0]>} */ (inConsumptionRepo[0])
    expect(loggedConsumption.consumableId).toBe(oatmeal.id)

    // Assert no other kind repo received it
    const inNoteRepo = await (/** @type {any} */ (reposByKind['note'])).list()
    expect(inNoteRepo).toHaveLength(0)
    const inTransactionRepo = await (/** @type {any} */ (reposByKind['transaction'])).list()
    expect(inTransactionRepo).toHaveLength(0)
    const inMeasurementRepo = await (/** @type {any} */ (reposByKind['measurement'])).list()
    expect(inMeasurementRepo).toHaveLength(0)
    const inActivityRepo = await (/** @type {any} */ (reposByKind['activity-session'])).list()
    expect(inActivityRepo).toHaveLength(0)

    el.remove()
  })

  it('dailyNutrients sums calories and protein correctly across logged consumptions scaled by servings', async () => {
    const reposByKind = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    // Add two consumables
    const oatmeal = await consumables.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    const egg = await consumables.add(new Consumable({ name: 'Egg', nutrients: { calories: 70, protein: 6 } }))
    const el = composer(store, consumables)
    await settle()

    // Log oatmeal × 2 servings → 300 cal, 10 prot
    q(el, 'select[name="consumable"]').value = oatmeal.id
    q(el, 'input[name="servings"]').value = '2'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()

    // Log egg × 3 servings → 210 cal, 18 prot
    q(el, 'select[name="consumable"]').value = egg.id
    q(el, 'input[name="servings"]').value = '3'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()

    const today = DayKey.from(new Date(), TZ)
    const totals = store.dailyNutrients(today)
    // sumNutrients scales by servings: (150*2 + 70*3) = 510 cal, (5*2 + 6*3) = 28 prot
    expect(totals.calories).toBe(510)
    expect(totals.protein).toBe(28)

    el.remove()
  })

  it('logs an ad-hoc consumption from entered nutrients', async () => {
    const store = createJournalStore(makeReposByKind(), TZ)
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
    const store = createJournalStore(makeReposByKind(), TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer(store, consumables)
    await settle()
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.consumptionsOn(DayKey.from(new Date(), TZ))).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })

  // Deliverable C: ConsumableProduct path — effectiveFacts override + provenance
  it('logs a consumption via a selected ConsumableProduct using the product facts override (effectiveFacts)', async () => {
    const reposByKind = makeReposByKind()
    const store = createJournalStore(reposByKind, TZ)
    const consumables = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const consumableProducts = createConsumableProductsStore(/** @type {any} */ (new InMemoryRepository()))

    // Parent consumable: 150 cal, 5 prot
    const oatmeal = await consumables.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    // Product with OVERRIDE facts: 180 cal, 7 prot (should win via effectiveFacts)
    const product = await consumableProducts.add(new ConsumableProduct({
      consumableId: oatmeal.id,
      name: 'Quaker Old Fashioned Oats',
      facts: { calories: 180, protein: 7 },
    }))

    const el = composer(store, consumables, consumableProducts)
    await settle()

    // Select the parent consumable first, then the product
    q(el, 'select[name="consumable"]').value = oatmeal.id
    q(el, 'select[name="consumable"]').dispatchEvent(new Event('change', { bubbles: true }))
    await settle()

    // Select the product
    const productSelect = q(el, 'select[name="consumableProduct"]')
    expect(productSelect).not.toBeNull()
    productSelect.value = product.id
    productSelect.dispatchEvent(new Event('change', { bubbles: true }))

    q(el, 'input[name="servings"]').value = '1'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()

    const today = DayKey.from(new Date(), TZ)
    const logged = store.consumptionsOn(today)
    expect(logged).toHaveLength(1)
    const first = /** @type {NonNullable<typeof logged[0]>} */ (logged[0])

    // effectiveFacts override: product's 180/7 wins over consumable's 150/5
    expect(first.nutrients.calories).toBe(180)
    expect(first.nutrients.protein).toBe(7)
    // Provenance: both ids set
    expect(first.consumableId).toBe(oatmeal.id)
    expect(first.consumableProductId).toBe(product.id)

    // Also assert it landed in the consumption repo
    const consumptionRepo2 = /** @type {import('@oyl/all-of-oyl').Repository<import('@oyl/all-of-oyl').Consumption>} */ (/** @type {any} */ (reposByKind['consumption']))
    const inConsumptionRepo2 = await consumptionRepo2.list()
    expect(inConsumptionRepo2).toHaveLength(1)
    const loggedWithProduct = /** @type {NonNullable<typeof inConsumptionRepo2[0]>} */ (inConsumptionRepo2[0])
    expect(loggedWithProduct.consumableProductId).toBe(product.id)

    el.remove()
  })
})
