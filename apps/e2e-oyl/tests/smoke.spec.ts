/**
 * stencil-oyl harness smoke: signed-in boot against the real backend, shell chrome, the
 * forced-login guard, and the standing console/network hygiene guarantee (auto fixture).
 */
import { test, expect, primeRemoteSignedOut } from '../lib/fixtures'

test('signed-in boot lands on /status with the full shell', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-shell h1')).toHaveText('OYL')
  await expect(page.locator('oyl-nav ui-nav a')).toHaveCount(8)
  await expect(page.locator('oyl-status h2').first()).toHaveText('Status')
  await expect(page.locator('oyl-account-menu ui-button[data-act="logout"]')).toBeVisible()
  await expect(page.locator('oyl-account-menu a[href="/login"]')).toHaveCount(0)
})

test('remote mode without a session forces the login page', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/journal')
  await expect(page).toHaveURL('/login')
  await expect(page.locator('oyl-login h2')).toHaveText('Sign in')
  await expect(page.locator('oyl-account-menu a[href="/login"]')).toBeVisible()
})
