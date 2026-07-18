/**
 * Nutrition screen: consumable catalog (shared/catalog-backed — assertions use unique
 * names, never counts), logging from a consumable with servings, ad-hoc meals, daily
 * totals, deletion, day scoping, and server persistence.
 */
import { test, expect } from '../lib/fixtures'
import { awaitOutboxDrained } from '../lib/actions'

/** Meal (consumption) rows carry a Delete button; catalog rows don't — disambiguates the two <ol>s. */
const mealRows = (page: import('@playwright/test').Page) => page.locator('oyl-nutrition ol li:has(button.del)')

const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

async function addConsumable(page: import('@playwright/test').Page, name: string, calories: string) {
  const form = page.locator('oyl-consumable-form')
  await form.locator('input[name="name"]').fill(name)
  await form.locator('input[name="calories"]').fill(calories)
  await form.locator('button').last().click()
}

test('empty state: no meals and zero totals', async ({ page, signIn }) => {
  await signIn('/nutrition')
  await expect(page.locator('oyl-nutrition .totals')).toContainText('Nothing logged yet')
  await expect(page.locator('oyl-nutrition [data-role="empty"]')).toContainText('No meals logged for')
})

test('a consumable can be created and logged with servings; totals update and persist', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const name = unique('Oatmeal')
  await addConsumable(page, name, '150')
  // The new consumable appears in the catalog list.
  await expect(page.locator('oyl-nutrition')).toContainText(name)

  const composer = page.locator('oyl-nutrition-composer')
  await composer.locator('input[name="mode"][value="consumable"]').check()
  await composer.locator('select[name="consumable"]').selectOption({ label: name })
  await composer.locator('input[name="servings"]').fill('2')
  await composer.locator('button[type="submit"]').click()

  // The consumption row appears and the daily totals include 2 × 150 kcal.
  await expect(mealRows(page).filter({ hasText: name })).toHaveCount(1)
  await expect(page.locator('oyl-nutrition .totals')).not.toContainText('Nothing logged yet')
  await expect(page.locator('oyl-nutrition .totals')).toContainText('300')

  await awaitOutboxDrained(page)
  await page.reload()
  await expect(mealRows(page).filter({ hasText: name })).toHaveCount(1)
  await expect(page.locator('oyl-nutrition .totals')).toContainText('300')
})

test('an ad-hoc meal logs with decimal nutrients', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const composer = page.locator('oyl-nutrition-composer')
  await composer.locator('input[name="mode"][value="adhoc"]').check()
  await composer.locator('input[name="note"]').fill('Leftover stir-fry')
  await composer.locator('input[name="calories"]').fill('420')
  await composer.locator('input[name="protein"]').fill('22.5')
  await composer.locator('button[type="submit"]').click()
  await expect(mealRows(page).filter({ hasText: 'Leftover stir-fry' })).toHaveCount(1)
  await expect(page.locator('oyl-nutrition .totals')).toContainText('420')
})

test('deleting a consumption clears it from the day and the totals', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const composer = page.locator('oyl-nutrition-composer')
  await composer.locator('input[name="mode"][value="adhoc"]').check()
  await composer.locator('input[name="note"]').fill('Snack to remove')
  await composer.locator('input[name="calories"]').fill('99')
  await composer.locator('button[type="submit"]').click()
  const row = mealRows(page).filter({ hasText: 'Snack to remove' })
  await expect(row).toHaveCount(1)
  await row.locator('button.del').click()
  await expect(mealRows(page).filter({ hasText: 'Snack to remove' })).toHaveCount(0)
  await expect(page.locator('oyl-nutrition .totals')).toContainText('Nothing logged yet')
})

test('meals are scoped to their day', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const composer = page.locator('oyl-nutrition-composer')
  await composer.locator('input[name="mode"][value="adhoc"]').check()
  await composer.locator('input[name="note"]').fill('Today lunch')
  await composer.locator('input[name="calories"]').fill('500')
  await composer.locator('button[type="submit"]').click()
  await expect(mealRows(page).filter({ hasText: 'Today lunch' })).toHaveCount(1)
  await page.locator('oyl-nutrition button[aria-label="Previous day"]').click()
  await expect(page.locator('oyl-nutrition [data-role="empty"]')).toContainText('No meals logged for')
  await page.locator('oyl-nutrition button[aria-label="Next day"]').click()
  await expect(mealRows(page).filter({ hasText: 'Today lunch' })).toHaveCount(1)
})
