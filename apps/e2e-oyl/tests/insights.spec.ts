/**
 * Insights screen: read-only review composition — empty states, stat tiles fed by
 * finance/goals activity, and the period selector.
 */
import { test, expect } from '../lib/fixtures'
import { navTo } from '../lib/actions'

test('fresh account shows the empty review', async ({ page, signIn }) => {
  await signIn('/insights')
  const insights = page.locator('oyl-insights')
  await expect(insights.locator('.stat')).toHaveCount(3)
  await expect(insights).toContainText('No goals yet')
  await expect(insights).toContainText('Nothing this period')
})

test('spending and goals flow into the review', async ({ page, signIn }) => {
  await signIn('/finance')
  const composer = page.locator('oyl-finance-composer')
  await composer.locator('input[name="amount"]').fill('42.50')
  await composer.locator('select[name="category"]').selectOption('dining')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item')).toHaveCount(1)

  await navTo(page, 'goals')
  const goalComposer = page.locator('oyl-goal-composer')
  await goalComposer.locator('input[name="name"]').fill('Sleep goal')
  await goalComposer.locator('input[name="target"]').fill('8')
  await goalComposer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-goal-row')).toHaveCount(1)

  await navTo(page, 'insights')
  const insights = page.locator('oyl-insights')
  // Spending tile + top-spending section reflect the dining expense.
  await expect(insights).toContainText('42.50')
  await expect(insights).toContainText('dining')
  // Goals section lists the goal instead of the empty state.
  await expect(insights).toContainText('Sleep goal')
  await expect(insights).not.toContainText('No goals yet')
})

test('the period selector switches between month and week', async ({ page, signIn }) => {
  await signIn('/insights')
  const period = page.locator('oyl-insights select[aria-label="Period"]')
  await expect(period).toHaveValue(/.+/)
  await period.selectOption({ label: 'This week' })
  await expect(page.locator('oyl-insights .stat')).toHaveCount(3)
  await period.selectOption({ label: 'This month' })
  await expect(page.locator('oyl-insights .stat')).toHaveCount(3)
})
