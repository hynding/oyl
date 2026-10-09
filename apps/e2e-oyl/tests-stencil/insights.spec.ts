/**
 * Stencil Insights screen: read-only review composition — empty states, the four tiles fed by
 * finance/goals activity, and the period segment.
 */
import { test, expect } from '../lib/fixtures'
import { addExpense, addGoal, deepText, navTo } from './lib'

test('fresh account shows the empty review', async ({ page, signIn }) => {
  await signIn('/insights')
  const insights = page.locator('oyl-insights')
  await expect(insights.locator('.tile')).toHaveCount(4)
  await expect.poll(() => deepText(insights)).toContain('No goals yet')
  const all = await deepText(insights)
  expect(all).toContain('Nothing this period')
  expect(all).toContain('No areas tracked')
})

test('spending and goals flow into the review', async ({ page, signIn }) => {
  await signIn('/finance')
  await addExpense(page, '42.50', 'dining')
  await expect(page.locator('oyl-finance ol.ledger oyl-item-row')).toHaveCount(1)

  await navTo(page, 'goals')
  await addGoal(page, { name: 'Sleep goal', target: '8' })
  await expect(page.locator('oyl-goals ol.goals oyl-progress-row')).toHaveCount(1)

  await navTo(page, 'insights')
  const insights = page.locator('oyl-insights')
  await expect.poll(() => deepText(insights.locator('.tile[data-tile="spending"]'))).toContain('$42.50')
  const all = await deepText(insights)
  expect(all).toContain('dining')
  expect(all).toContain('Sleep goal')
  expect(all).not.toContain('No goals yet')
})

test('the period segment switches between week and month', async ({ page, signIn }) => {
  await signIn('/insights')
  const seg = page.locator('oyl-insights ui-segment')
  await expect(seg.locator('[data-value="month"]')).toHaveAttribute('aria-checked', 'true')
  await seg.locator('[data-value="week"]').click()
  await expect(seg.locator('[data-value="week"]')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('oyl-insights .tile')).toHaveCount(4)
  await seg.locator('[data-value="month"]').click()
  await expect(seg.locator('[data-value="month"]')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('oyl-insights .tile')).toHaveCount(4)
})
