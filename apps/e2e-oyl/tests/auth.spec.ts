/**
 * Account flows against the real backend: UI registration, login (happy + wrong password),
 * duplicate-account errors, logout, session persistence, and the forced-login guard's
 * exemptions for /login and /register.
 */
import { test, expect, registerUser, primeRemoteSignedOut } from '../lib/fixtures'

test('register through the UI creates an account and signs in', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/register')
  await expect(page.locator('oyl-register h2').first()).toHaveText('Create account')

  const unique = `e2e_ui_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const form = page.locator('oyl-register oyl-auth-form')
  await form.locator('input[name="username"]').fill(unique)
  await form.locator('input[name="email"]').fill(`${unique}@example.com`)
  await form.locator('input[name="password"]').fill('e2e-Password-1')
  await form.locator('button[type="submit"]').click()

  // onAuthenticated → remote mode + full navigation to /status, signed in.
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
  const stored = await page.evaluate(() => ({
    mode: localStorage.getItem('oyl/storage-mode'),
    auth: localStorage.getItem('oyl/auth'),
  }))
  expect(stored.mode).toBe('remote')
  expect(JSON.parse(stored.auth ?? '{}')).toMatchObject({ user: { username: unique } })
})

test('registering a taken username shows an inline error and stays put', async ({ page, hygiene, user }) => {
  hygiene.allow(/auth\/local\/register/)
  await primeRemoteSignedOut(page)
  await page.goto('/register')
  const form = page.locator('oyl-register oyl-auth-form')
  await form.locator('input[name="username"]').fill(user.username)
  await form.locator('input[name="email"]').fill(user.email)
  await form.locator('input[name="password"]').fill('e2e-Password-1')
  await form.locator('button[type="submit"]').click()
  await expect(form.locator('[data-role="error"]')).not.toBeEmpty()
  await expect(page).toHaveURL('/register')
})

test('login through the UI with a real account', async ({ page, request }) => {
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const form = page.locator('oyl-login oyl-auth-form')
  await form.locator('input[name="identifier"]').fill(user.email)
  await form.locator('input[name="password"]').fill(user.password)
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
})

test('wrong password shows an inline error without navigating', async ({ page, hygiene, user }) => {
  hygiene.allow(/auth\/local/)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const form = page.locator('oyl-login oyl-auth-form')
  await form.locator('input[name="identifier"]').fill(user.email)
  await form.locator('input[name="password"]').fill('definitely-wrong')
  await form.locator('button[type="submit"]').click()
  await expect(form.locator('[data-role="error"]')).not.toBeEmpty()
  await expect(page).toHaveURL('/login')
  // Still signed out.
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
})

test('logout clears the session and forces the login page', async ({ page, signIn }) => {
  await signIn('/journal')
  await page.locator('oyl-account-menu button[data-act="logout"]').click()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
  await expect(page.locator('oyl-account-menu a[href="/login"]')).toBeVisible()
})

test('session survives a reload', async ({ page, signIn, user }) => {
  await signIn('/')
  await page.reload()
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
  await expect(page.locator('oyl-profile')).toHaveCount(0)
  // Identity is intact on the profile page.
  await page.goto('/profile')
  await expect(page.locator('oyl-profile [data-role="identity"]')).toContainText(user.username)
})

test('the guard leaves /register reachable while signed out', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/register')
  await expect(page).toHaveURL('/register')
  await expect(page.locator('oyl-register h2').first()).toHaveText('Create account')
  // Cross-links between the two auth pages.
  await page.locator('oyl-register a[href="/login"]').click()
  await expect(page).toHaveURL('/login')
  await page.locator('oyl-login a[href="/register"]').click()
  await expect(page).toHaveURL('/register')
})
