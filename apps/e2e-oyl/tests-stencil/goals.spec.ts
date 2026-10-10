/**
 * Stencil Goals screen: create from presets, the summary line, pause/resume, delete with
 * inline confirm, and server persistence (goals ARE backed — round-trip asserted via reload).
 */
import { test, expect } from '../lib/fixtures'
import { awaitOutboxDrained, inlineConfirm } from '../lib/actions'
import { addGoal, deepText } from './lib'

const row = (page: import('@playwright/test').Page) => page.locator('oyl-goals ol.goals oyl-progress-row')

test('empty state has no summary', async ({ page, signIn }) => {
  await signIn('/goals')
  await expect.poll(() => deepText(page.locator('oyl-goals'))).toContain('No goals yet.')
  await expect(page.locator('oyl-goals [data-role="summary"]')).toHaveCount(0)
})

test('a goal round-trips through the backend and can pause/resume', async ({ page, signIn }) => {
  await signIn('/goals')
  await addGoal(page, { preset: 'Sleep (hours)', name: 'Sleep more', target: '7.5', period: 'day' })
  await expect(row(page)).toHaveCount(1)
  await expect.poll(() => deepText(row(page))).toContain('Sleep more')
  expect(await deepText(row(page))).toContain('No data this period')
  await expect.poll(() => deepText(page.locator('oyl-goals [data-role="summary"]'))).toBe('0 of 1 met today')

  // Pause flips the action to Resume and the summary counts it. (Domain semantics: a same-day
  // resume closes the pause range inclusively, so the goal stays paused through today.)
  await row(page).locator('[data-act="pause"]').click()
  await expect(row(page).locator('[data-act="resume"]')).toBeVisible()
  await expect.poll(() => deepText(row(page))).toContain('Paused')
  await expect.poll(() => deepText(page.locator('oyl-goals [data-role="summary"]'))).toBe('0 of 1 met today · 1 paused')

  // Persisted server-side, including the pause (decimal target exercises the number field e2e).
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(row(page)).toHaveCount(1)
  await expect.poll(() => deepText(row(page))).toContain('Sleep more')
  await expect(row(page).locator('[data-act="resume"]')).toBeVisible()
})

test('deleting a goal requires inline confirmation and persists', async ({ page, signIn }) => {
  await signIn('/goals')
  await addGoal(page, { target: '8' })
  await expect(row(page)).toHaveCount(1)
  await inlineConfirm(row(page), 'delete', 'no')
  await expect(row(page)).toHaveCount(1)
  await inlineConfirm(row(page), 'delete', 'yes')
  await expect(row(page)).toHaveCount(0)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect.poll(() => deepText(page.locator('oyl-goals'))).toContain('No goals yet.')
})
