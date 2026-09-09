/**
 * Google OAuth journeys against the fake-google fixture: sign in from /login,
 * link from /profile, disconnect. The whole flow is real browser navigation —
 * app → backend /connect → fake google → backend /callback → app fragment adoption.
 */
import { test, expect, registerUser, primeRemoteSignedOut } from '../lib/fixtures'

// Google OAuth is served by strapi-oyl only; the PHP backend answers /google/config unconfigured.
test.skip(process.env.E2E_BACKEND === 'php', 'google oauth is not part of the camis-php-oyl backend')

test('sign in with Google from the login page creates a session', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const google = page.locator('oyl-login oyl-auth-form a[data-act="google"]')
  await expect(google).toBeVisible()
  await google.click()
  // Redirect chain ends back in the app with the fragment adopted and cleaned.
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/auth') ?? 'null'))
  expect(auth?.user?.email).toMatch(/@gmail\.test$/)
  expect(page.url()).not.toContain('#google')
})

test('link Google from Profile, then disconnect', async ({ page, request }) => {
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const form = page.locator('oyl-login oyl-auth-form')
  await form.locator('input[name="identifier"]').fill(user.email)
  await form.locator('input[name="password"]').fill(user.password)
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/status')

  await page.goto('/profile')
  const connect = page.locator('oyl-profile button[data-act="google-connect"]')
  await expect(connect).toBeVisible()
  await connect.click()
  // Round trip lands back on /profile with the link established.
  await expect(page).toHaveURL('/profile')
  const section = page.locator('oyl-profile [data-role="google-drive"]')
  await expect(section).toContainText('Connected as')
  await expect(section).toContainText('@gmail.test')

  await section.locator('button[data-act="google-disconnect"]').click()
  await expect(page.locator('oyl-profile button[data-act="google-connect"]')).toBeVisible()
})

test('email collision does NOT auto-link: password login still owns the account', async ({ page, request }) => {
  // Covered at the API level in strapi smoke tests; here assert only the visible contract:
  // a fresh Google sign-in never lands in an existing password account.
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  await page.locator('oyl-login oyl-auth-form a[data-act="google"]').click()
  await expect(page).toHaveURL('/status')
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/auth') ?? 'null'))
  expect(auth?.user?.email).not.toBe(user.email)
})
