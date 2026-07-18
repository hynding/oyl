/**
 * Connection card (Status screen): URL validation, mode toggling, and Apply & reload
 * persisting the config. Applying an equivalent URL on the same backend keeps the
 * app fully functional after the reload.
 */
import { test, expect } from '../lib/fixtures'

test('invalid backend URL is rejected inline without applying', async ({ page, signIn }) => {
  await signIn('/status')
  const conn = page.locator('oyl-status-panel oyl-connection')
  const url = conn.locator('input[type="url"]')
  await url.fill('not-a-url')
  await conn.locator('button.primary').click()
  await expect(conn.locator('[data-role="error"]')).toContainText('Enter a valid http(s) URL.')
  // Nothing persisted.
  expect(await page.evaluate(() => localStorage.getItem('oyl/api-base-url'))).toBe('http://localhost:1341/api')
})

test('mode buttons reflect the active mode via aria-pressed', async ({ page, signIn }) => {
  await signIn('/status')
  const conn = page.locator('oyl-status-panel oyl-connection')
  await expect(conn.locator('button[data-value="remote"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(conn.locator('button[data-value="local"]')).toHaveAttribute('aria-pressed', 'false')
  await conn.locator('button[data-value="local"]').click()
  await expect(conn.locator('button[data-value="local"]')).toHaveAttribute('aria-pressed', 'true')
  // The "was" line still reports the applied (stored) state.
  await expect(conn.locator('.was')).toContainText('Remote')
})

test('Apply & reload persists an equivalent URL and the app reboots cleanly', async ({ page, signIn }) => {
  await signIn('/status')
  const conn = page.locator('oyl-status-panel oyl-connection')
  const url = conn.locator('input[type="url"]')
  // Same backend, different literal URL (127.0.0.1 vs localhost) — a safe applied change.
  await url.fill('http://127.0.0.1:1341/api')
  await conn.locator('button.primary').click()
  await page.waitForURL('**/status')
  await expect(page.locator('oyl-shell')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('oyl/api-base-url'))).toBe('http://127.0.0.1:1341/api')
  // Still signed in and functional against the same backend.
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
})
