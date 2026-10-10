/**
 * Accessibility invariants on the stencil shell: document language, landmark labels, route
 * announcements (aria-live) with focus moved to the screen heading, aria-current on the
 * active nav link, the inline-confirm cluster defaulting to the safe answer, accessible names
 * on composed form controls, and the boot-failure notice with its named dismiss control.
 */
import { test, expect, primeRemoteSession } from '../lib/fixtures'
import { deepActiveElement } from '../lib/actions'
import { addExpense, navTo } from './lib'

test('document and landmark basics', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('oyl-nav ui-nav nav')).toHaveAttribute('aria-label', 'Primary')
  await expect(page.locator('oyl-account-menu nav')).toHaveAttribute('aria-label', 'Account')
  await expect(page.locator('oyl-shell main')).toBeVisible()
})

test('navigation announces the new route and moves focus to its heading', async ({ page, signIn }) => {
  await signIn('/')
  await navTo(page, 'goals')
  // The router's own announcer is its direct child (screens contribute their own live regions).
  await expect(page.locator('oyl-router > [aria-live="polite"]')).toHaveText('Navigated to goals')
  await expect.poll(async () => (await deepActiveElement(page)).tag, 'focus should land on the screen heading').toBe('H2')
  expect((await deepActiveElement(page)).text).toContain('Goals')
})

test('a day-scoped screen focuses the heading inside its day nav', async ({ page, signIn }) => {
  await signIn('/status')
  await navTo(page, 'journal')
  await expect.poll(async () => (await deepActiveElement(page)).tag).toBe('H2')
})

test('the active nav link carries aria-current="page"', async ({ page, signIn }) => {
  await signIn('/journal')
  const active = page.locator('oyl-nav ui-nav a[aria-current="page"]')
  await expect(active).toHaveCount(1)
  await expect(active).toHaveAttribute('href', '/journal')
})

test('inline delete confirm focuses the safe "No" answer', async ({ page, signIn }) => {
  await signIn('/finance')
  await addExpense(page, '9', 'other')
  const row = page.locator('oyl-finance ol.ledger oyl-item-row').first()
  await expect(row).toHaveCount(1)
  await row.locator('[data-act="delete"]').click()
  await expect.poll(async () => (await deepActiveElement(page)).text).toBe('No')
})

test('composed form controls expose accessible names', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page.locator('oyl-log-form ui-textarea[name="text"] textarea')).toHaveAccessibleName(/.+/)
  await expect(page.locator('oyl-log-form ui-field[name="when"] input')).toHaveAccessibleName(/.+/)
  await navTo(page, 'nutrition')
  await expect(page.locator('oyl-meal-form ui-select[name="consumable"] select')).toHaveAccessibleName(/.+/)
  await navTo(page, 'journal')
  await expect(page.locator('oyl-day-nav ui-button button').first()).toHaveAccessibleName(/.+/)
})

test('the boot-failure notice is a status with a named dismiss control', async ({ page, user, hygiene }) => {
  // Trigger the boot notice deterministically by failing the bootstrap read.
  hygiene.allow(/api\/bootstrap/)
  hygiene.allow(/Failed to load resource/)
  await primeRemoteSession(page, user)
  await page.route('**/api/bootstrap', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('/')
  const notice = page.locator('oyl-notice-host ui-notice [role="status"]')
  await expect(notice).toBeVisible()
  const dismiss = page.locator('oyl-notice-host ui-notice ui-button button')
  await expect(dismiss).toHaveAccessibleName('Dismiss')
  await dismiss.click()
  await expect(notice).toBeHidden()
})
