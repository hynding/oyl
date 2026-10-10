/**
 * Nutrition screen on the stencil shell: consumable catalog (shared/catalog-backed —
 * assertions use unique names, never counts), logging from a consumable with servings,
 * ad-hoc meals, daily totals tiles, inline delete, day scoping + week-strip dots, and
 * server persistence.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'
import { addConsumable, awaitOutboxDrained, deepText, logAdhoc } from './lib'

const unique = (base: string) => `${base} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const totals = (page: import('@playwright/test').Page) => deepText(page.locator('oyl-nutrition [data-role="totals"]'))
const rowsWith = (page: import('@playwright/test').Page, text: string) =>
  page.locator('oyl-meal-row').filter({ has: page.locator(`.title:has-text("${text}")`) })

test('empty state: no meals and dashed totals', async ({ page, signIn }) => {
  await signIn('/nutrition')
  await expect(page.locator('oyl-nutrition [data-role="empty"]')).toContainText('No meals logged for')
  expect(await totals(page)).toContain('—kcal')
})

test('a consumable can be created and logged with servings; totals update and persist', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const name = unique('Oatmeal')
  await addConsumable(page, name, '150')
  await expect(page.locator('oyl-nutrition ol.catalog li').filter({ hasText: name })).toHaveCount(1)

  const form = page.locator('oyl-meal-form')
  await form.locator('ui-segment [data-value="catalog"]').click()
  await form.locator('ui-select[name="consumable"] select').selectOption({ label: name })
  await form.locator('ui-field[name="servings"] input').fill('2')
  await form.locator('ui-button[type="submit"] button').click()

  await expect(rowsWith(page, name)).toHaveCount(1)
  expect(await deepText(rowsWith(page, name))).toContain('×2')
  await expect.poll(() => totals(page)).toContain('300kcal')

  await awaitOutboxDrained(page)
  await page.reload()
  await expect(rowsWith(page, name)).toHaveCount(1)
  await expect.poll(() => totals(page)).toContain('300kcal')
})

test('an ad-hoc meal logs with decimal nutrients', async ({ page, signIn }) => {
  await signIn('/nutrition')
  await logAdhoc(page, 'Leftover stir-fry', '420', '22.5')
  await expect(rowsWith(page, 'Leftover stir-fry')).toHaveCount(1)
  const t = await totals(page)
  expect(t).toContain('420kcal')
  expect(t).toContain('23g protein')
})

test('deleting a meal asks inline and clears it from the day and the totals', async ({ page, signIn }) => {
  await signIn('/nutrition')
  await logAdhoc(page, 'Snack to remove', '99')
  const row = rowsWith(page, 'Snack to remove')
  await expect(row).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'no')
  await expect(row).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'yes')
  await expect(rowsWith(page, 'Snack to remove')).toHaveCount(0)
  await expect.poll(() => totals(page)).toContain('—kcal')
})

test('meals are scoped to their day and mark the week strip', async ({ page, signIn }) => {
  await signIn('/nutrition')
  const pills = page.locator('oyl-nutrition [data-day]')
  await expect(pills.locator('.dot')).toHaveCount(0)
  await logAdhoc(page, 'Today lunch', '500')
  await expect(rowsWith(page, 'Today lunch')).toHaveCount(1)
  await expect(pills.nth(3).locator('.dot')).toHaveCount(1)
  await page.locator('oyl-nutrition ui-button[data-nav="prev"] button').click()
  await expect(page.locator('oyl-nutrition [data-role="empty"]')).toContainText('No meals logged for')
  await page.locator('oyl-nutrition ui-button[data-nav="next"] button').click()
  await expect(rowsWith(page, 'Today lunch')).toHaveCount(1)
})
