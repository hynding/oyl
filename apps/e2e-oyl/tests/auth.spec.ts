/**
 * Account flows on the stencil shell: UI registration, login (happy + wrong password),
 * logout, session persistence, and the guard's exemptions for /login and /register.
 */
import { test, expect, registerUser, primeRemoteSignedOut } from '../lib/fixtures'
import { deepText } from './lib'

const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

test('register through the UI creates an account and signs in', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/register')
  await expect(page.locator('oyl-register h2')).toHaveText('Create account')
  const name = unique('e2e_ui_')
  const form = page.locator('oyl-register oyl-auth-form')
  await form.locator('ui-field[name="username"] input').fill(name)
  await form.locator('ui-field[name="email"] input').fill(`${name}@example.com`)
  await form.locator('ui-field[name="password"] input').fill('e2e-Password-1')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-account-menu ui-button[data-act="logout"]')).toBeVisible()
  const stored = await page.evaluate(() => ({ mode: localStorage.getItem('oyl/storage-mode'), auth: localStorage.getItem('oyl/auth') }))
  expect(stored.mode).toBe('remote')
  expect(JSON.parse(stored.auth ?? '{}')).toMatchObject({ user: { username: name } })
})

test('login with the right and the wrong password', async ({ page, request, hygiene }) => {
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const form = page.locator('oyl-login oyl-auth-form')
  // Wrong password: the backend answers 400 on purpose.
  hygiene.allow(/auth\/local/)
  hygiene.allow(/Failed to load resource/)
  await form.locator('ui-field[name="identifier"] input').fill(user.username)
  await form.locator('ui-field[name="password"] input').fill('wrong-Password-1')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(form.locator('[data-role="error"]')).not.toHaveText('')
  await expect(page).toHaveURL('/login')
  // Right password.
  await form.locator('ui-field[name="password"] input').fill(user.password)
  await form.locator('ui-button[type="submit"] button').click()
  await expect(page).toHaveURL('/status')
})

test('logout clears the session and lands on /login; the session persists across reload', async ({ page, signIn }) => {
  await signIn('/status')
  await page.reload()
  await expect(page.locator('oyl-account-menu ui-button[data-act="logout"]')).toBeVisible()
  await page.locator('oyl-account-menu ui-button[data-act="logout"] button').click()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
})

test('/login and /register are reachable signed out and cross-link each other', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  await page.locator('oyl-login a[href="/register"]').click()
  await expect(page).toHaveURL('/register')
  await page.locator('oyl-register a[href="/login"]').click()
  await expect(page).toHaveURL('/login')
  expect(await deepText(page.locator('oyl-login'))).toContain('Sign in')
})
