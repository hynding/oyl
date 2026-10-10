/**
 * Connection card (Status screen) on the stencil shell: URL validation, the mode select, and
 * Apply & reload persisting the config. Applying an equivalent URL on the same backend keeps
 * the app fully functional after the reload.
 */
import { test, expect } from '../lib/fixtures'
import { deepText } from './lib'

const conn = (page: import('@playwright/test').Page) => page.locator('oyl-status')

test('invalid backend URL is rejected inline without applying', async ({ page, signIn }) => {
  await signIn('/status')
  const url = conn(page).locator('ui-field[name="apiBaseUrl"] input')
  await url.fill('not-a-url')
  await conn(page).locator('ui-button[data-act="apply"] button').click()
  await expect.poll(() => deepText(conn(page).locator('ui-field[name="apiBaseUrl"]'))).toContain('Enter a valid http(s) URL.')
  await expect(conn(page).locator('ui-field[name="apiBaseUrl"] input')).toHaveAttribute('aria-invalid', 'true')
  // Nothing persisted.
  expect(await page.evaluate(() => localStorage.getItem('oyl/api-base-url'))).toBe('http://localhost:1341/api')
})

test('the mode select reflects the active mode and changes nothing until Apply', async ({ page, signIn }) => {
  await signIn('/status')
  const mode = conn(page).locator('select[name="mode"]')
  await expect(mode).toHaveValue('remote')
  await mode.selectOption('local')
  await expect(mode).toHaveValue('local')
  expect(await page.evaluate(() => localStorage.getItem('oyl/storage-mode'))).toBe('remote')
})

test('Apply & reload persists an equivalent URL and the app reboots cleanly', async ({ page, signIn }) => {
  await signIn('/status')
  // Same backend, different literal URL (127.0.0.1 vs localhost) — a safe applied change.
  await conn(page).locator('ui-field[name="apiBaseUrl"] input').fill('http://127.0.0.1:1341/api')
  const reloaded = page.waitForEvent('load')
  await conn(page).locator('ui-button[data-act="apply"] button').click()
  await reloaded
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-shell')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('oyl/api-base-url'))).toBe('http://127.0.0.1:1341/api')
  // Still signed in and functional against the same backend.
  await expect(page.locator('oyl-account-menu ui-button[data-act="logout"]')).toBeVisible()
})
