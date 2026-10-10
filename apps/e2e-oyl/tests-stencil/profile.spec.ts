/**
 * Stencil Profile screen: identity line, profile-field editing (decimal weight/height), the
 * gender self-describe reveal, the pointer to Status, the Google Drive card, and logout.
 *
 * NOTE: the users collection is not backed (the profile persists in-session only), so the
 * save round-trip is observed through the reload it triggers and the EMPTY form afterwards.
 * When users gains a backend, invert the post-reload assertion (the values survive).
 */
import { test, expect } from '../lib/fixtures'
import { deepText } from './lib'

const form = (page: import('@playwright/test').Page) => page.locator('oyl-profile-form')

test('identity shows username and email when signed in', async ({ page, signIn, user }) => {
  await signIn('/profile')
  await expect.poll(() => deepText(page.locator('oyl-profile [data-role="identity"]'))).toContain(user.username)
  expect(await deepText(page.locator('oyl-profile [data-role="identity"]'))).toContain(user.email)
})

test('saving profile fields (decimal weight/height) reloads the profile screen', async ({ page, signIn }) => {
  await signIn('/profile')
  const weight = form(page).locator('ui-field[name="weight"] input')
  await form(page).locator('ui-field[name="birthday"] input').fill('1990-06-15')
  await weight.fill('81.5')
  await form(page).locator('ui-field[name="height"] input').fill('179.5')
  await expect(weight).toHaveValue('81.5')
  // A first-ever save counts as a units change → the app reloads /profile to apply it.
  const reloaded = page.waitForEvent('load')
  await form(page).locator('ui-button[type="submit"] button').click()
  await reloaded
  await expect(page).toHaveURL('/profile')
  await expect.poll(() => deepText(page.locator('oyl-profile h2[tabindex="-1"]'))).toBe('Profile')
  await expect(form(page).locator('ui-field[name="weight"] input')).toHaveValue('')
})

test('gender "Other" reveals the self-describe field', async ({ page, signIn }) => {
  await signIn('/profile')
  await expect(form(page).locator('ui-select[name="gender"] select')).toBeVisible()
  await expect(form(page).locator('ui-field[name="genderOther"]')).toHaveCount(0)
  await form(page).locator('ui-select[name="gender"] select').selectOption({ label: 'Other' })
  await expect(form(page).locator('ui-field[name="genderOther"] input')).toBeVisible()
})

test('the profile points at Status for connection and backups', async ({ page, signIn }) => {
  await signIn('/profile')
  await expect(page.locator('oyl-profile a[href="/status"]')).toBeVisible()
})

test('the Google Drive card offers to connect when the backend has Google configured', async ({ page, signIn }) => {
  test.skip(process.env.E2E_BACKEND === 'php', 'google oauth is not part of the camis-php-oyl backend')
  await signIn('/profile')
  await expect(page.locator('oyl-profile [data-role="google-drive"] ui-button[data-act="google-connect"] button')).toBeVisible()
})

test('log out from the profile page clears the session', async ({ page, signIn }) => {
  await signIn('/profile')
  await page.locator('oyl-profile ui-button[data-act="logout"] button').click()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
})
