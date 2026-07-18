/**
 * Goals screen: create from presets, pause/resume, delete with inline confirm, and
 * server persistence (goals ARE backed — round-trip asserted via reload).
 */
import { test, expect } from '../lib/fixtures'
import { awaitOutboxDrained, inlineConfirm } from '../lib/actions'

test('empty state', async ({ page, signIn }) => {
  await signIn('/goals')
  await expect(page.locator('oyl-goals')).toContainText('No goals yet.')
})

test('a goal round-trips through the backend and can pause/resume', async ({ page, signIn }) => {
  await signIn('/goals')
  const composer = page.locator('oyl-goal-composer')
  await composer.locator('select[name="preset"]').selectOption({ label: 'Sleep (hours)' })
  await composer.locator('input[name="name"]').fill('Sleep more')
  await composer.locator('input[name="target"]').fill('7.5')
  await composer.locator('select[name="period"]').selectOption('day')
  await composer.locator('button[type="submit"]').click()

  const row = page.locator('oyl-goal-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Sleep more')

  // Pause flips the action to Resume. (Domain semantics: a same-day resume closes the
  // pause range inclusively, so the goal stays paused — and shows Resume — through today.)
  await row.locator('[data-act="pause"]').click()
  await expect(row.locator('[data-act="resume"]')).toBeVisible()

  // Persisted server-side, including the pause (decimal target exercises step=any e2e).
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-goal-row')).toContainText('Sleep more')
  await expect(page.locator('oyl-goal-row [data-act="resume"]')).toBeVisible()
})

test('deleting a goal requires inline confirmation and persists', async ({ page, signIn }) => {
  await signIn('/goals')
  const composer = page.locator('oyl-goal-composer')
  await composer.locator('input[name="target"]').fill('8')
  await composer.locator('button[type="submit"]').click()
  const row = page.locator('oyl-goal-row')
  await expect(row).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'no')
  await expect(page.locator('oyl-goal-row')).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'yes')
  await expect(page.locator('oyl-goal-row')).toHaveCount(0)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-goals')).toContainText('No goals yet.')
})
