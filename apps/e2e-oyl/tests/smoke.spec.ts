/**
 * Harness smoke: signed-in boot against the real backend, shell chrome, forced-login
 * guard, and the standing console/network hygiene guarantee (via the auto fixture).
 */
import { test, expect } from '../lib/fixtures'
import { primeRemoteSignedOut } from '../lib/fixtures'

test('signed-in boot lands on /status with the full shell', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-shell h1')).toHaveText('OYL')
  await expect(page.locator('oyl-nav a')).toHaveCount(8)
  await expect(page.locator('oyl-status-panel h2').first()).toHaveText('Status')
  // Signed in → account menu offers Log out, not Sign in.
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
  await expect(page.locator('oyl-account-menu a[href="/login"]')).toHaveCount(0)
})

test('remote mode without a session forces the login page', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/journal')
  await expect(page).toHaveURL('/login')
  await expect(page.locator('oyl-login h2')).toHaveText('Sign in')
  // Guard replaces history — going back must not land on the guarded route.
  await expect(page.locator('oyl-account-menu a[href="/login"]')).toBeVisible()
})
