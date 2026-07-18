/**
 * Accessibility invariants: document language, landmark labels, route announcements
 * (aria-live), focus management on navigation, focus-visible affordances, and the
 * inline-confirm focus trap defaulting to the safe answer.
 */
import { test, expect, primeRemoteSession } from '../lib/fixtures'
import { addNote, deepActiveElement, navTo } from '../lib/actions'

test('document and landmark basics', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('oyl-nav nav')).toHaveAttribute('aria-label', 'Primary')
  await expect(page.locator('oyl-account-menu nav')).toHaveAttribute('aria-label', 'Account')
  await expect(page.locator('oyl-router main')).toBeVisible()
})

test('navigation announces the new route and moves focus to its heading', async ({ page, signIn }) => {
  await signIn('/')
  await navTo(page, 'goals')
  // Scope to the router's own announcer (screens contribute their own live regions).
  await expect(page.locator('oyl-router [aria-live="polite"]').filter({ hasText: 'Navigated to' })).toHaveText('Navigated to goals')
  const active = await deepActiveElement(page)
  expect(active.tag, 'focus should land on the screen heading').toBe('H2')
  expect(active.text).toContain('Goals')
})

test('the active nav link carries aria-current="page"', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page.locator('oyl-nav a[aria-current="page"]')).toHaveCount(1)
  await expect(page.locator('oyl-nav a[aria-current="page"]')).toHaveAttribute('data-route', 'journal')
})

test('inline delete confirm focuses the safe "No" answer', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Focus check entry')
  await page.locator('oyl-entry-row [data-act="delete"]').click()
  const active = await deepActiveElement(page)
  expect(active.text).toBe('No')
})

test('form fields expose accessible names', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page.locator('oyl-log-form textarea[name="text"]')).toHaveAccessibleName(/.+/)
  await expect(page.locator('oyl-log-form input[name="when"]')).toHaveAccessibleName(/.+/)
  await navTo(page, 'nutrition')
  await expect(page.locator('oyl-nutrition-composer select[name="consumable"]')).toHaveAccessibleName(/.+/)
})

test('the notice toast is an alert with a dismiss control', async ({ page, user, hygiene }) => {
  // Trigger the boot notice deterministically by failing the bootstrap read.
  hygiene.allow(/api\/bootstrap/)
  hygiene.allow(/Failed to load resource/)
  await primeRemoteSession(page, user)
  await page.route('**/api/bootstrap', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('/')
  const alert = page.locator('oyl-notice [role="alert"]')
  await expect(alert).toBeVisible()
  await expect(alert.locator('button[data-act="dismiss"]')).toHaveText('Dismiss')
  await alert.locator('button[data-act="dismiss"]').click()
  await expect(alert).toBeHidden()
})
