/**
 * Account-scoped demo seeding: "Load demo data" (and the ?seed query) write the
 * canonical dataset through the stores → outbox → server. The rolling slice is
 * re-anchored to the real today, so screens open populated; backed collections
 * survive a reload (full server round trip); export then carries the data.
 */
import { test, expect } from '../lib/fixtures'
import { awaitOutboxDrained, navTo } from '../lib/actions'

// ~280 writes flush to SQLite per seed — give these journeys generous room.
test.describe.configure({ timeout: 120_000 })

test('Load demo data populates every screen and persists server-side', async ({ page, signIn }) => {
  await signIn('/status')
  const seedBtn = page.locator('oyl-status-panel button[data-act="seed"]')
  await expect(seedBtn).toBeEnabled()
  // Empty account → seeds without a confirm dialog.
  await seedBtn.click()

  // Journal: the slice ends at the actual today (daily measurements land there).
  await navTo(page, 'journal')
  await expect(page.locator('oyl-entry-row').first()).toBeVisible({ timeout: 20_000 })

  // Nutrition: daily breakfast consumption → non-zero totals + catalog entries.
  await navTo(page, 'nutrition')
  await expect(page.locator('oyl-nutrition .totals')).not.toContainText('Nothing logged yet')
  await expect(page.locator('oyl-nutrition')).toContainText('Oatmeal')

  // Goals: the four seed goals (including the paused showcase).
  await navTo(page, 'goals')
  await expect(page.locator('oyl-goal-row')).toHaveCount(4)

  // Finance: grocery transactions land in the current month's ledger.
  await navTo(page, 'finance')
  await expect(page.locator('oyl-finance ol.ledger oyl-vault-item').first()).toBeVisible()
  await expect(page.locator('oyl-budget-row')).toHaveCount(1)

  // Vault (in-session until backed): subscriptions/contacts/documents populated.
  await navTo(page, 'vault')
  await expect(page.locator('oyl-subscription-row')).toHaveCount(2)
  await expect(page.locator('oyl-contact-row')).toHaveCount(1)

  // Insights: the review reflects seeded spending and goals.
  await navTo(page, 'insights')
  await expect(page.locator('oyl-insights')).toContainText('Eat lighter')
  await expect(page.locator('oyl-insights')).not.toContainText('No goals yet')

  // Everything backed reaches the server, and a reload round-trips it.
  await awaitOutboxDrained(page, 90_000)
  await page.reload()
  await expect(page.locator('oyl-insights')).toContainText('Eat lighter')
  await navTo(page, 'journal')
  await expect(page.locator('oyl-entry-row').first()).toBeVisible()
  await navTo(page, 'goals')
  await expect(page.locator('oyl-goal-row')).toHaveCount(4)
})

test('the ?seed query populates an empty account at boot and never duplicates', async ({ page, signIn, user }) => {
  await signIn('/status')
  await page.goto('/goals?seed')
  await expect(page.locator('oyl-goal-row')).toHaveCount(4, { timeout: 20_000 })
  await awaitOutboxDrained(page, 90_000)
  // A second boot with ?seed must not double the data (non-empty account is left alone).
  await page.goto('/goals?seed')
  await expect(page.locator('oyl-goal-row')).toHaveCount(4)
  // And the seeded goals belong to this user server-side.
  const res = await page.request.get('http://localhost:1341/api/goals', {
    headers: { Authorization: `Bearer ${user.jwt}` },
  })
  const body = (await res.json()) as { data: unknown[] }
  expect(body.data).toHaveLength(4)
})
