/**
 * Profile screen: identity line, profile-field editing (weight/height decimals — the
 * step=any fix), gender self-describe reveal, connection card presence, and logout.
 *
 * NOTE: the users collection is not yet backed (profile persists in-session only);
 * when it gains a backend, add a reload round-trip here.
 */
import { test, expect } from '../lib/fixtures'

test('identity shows username and email when signed in', async ({ page, signIn, user }) => {
  await signIn('/profile')
  const identity = page.locator('oyl-profile [data-role="identity"]')
  await expect(identity).toContainText(user.username)
  await expect(identity).toContainText(user.email)
})

test('profile fields save (decimal weight/height) reloads the profile screen', async ({ page, signIn }) => {
  await signIn('/profile')
  const fields = page.locator('oyl-profile-fields')
  await fields.locator('input[name="birthday"]').fill('1990-06-15')
  await fields.locator('input[name="weight"]').fill('81.5')
  await fields.locator('input[name="height"]').fill('179.5')
  await fields.locator('button[data-act="save"]').click()
  // A first-ever save counts as a units change → the app reloads /profile to apply it.
  // (When the users collection gains a backend, also assert the values survive.)
  await page.waitForURL('**/profile')
  await expect(page.locator('oyl-profile h2').first()).toHaveText('Profile')
  await expect(page.locator('oyl-profile-fields input[name="weight"]')).toBeVisible()
})

test('gender "Other" reveals the self-describe input', async ({ page, signIn }) => {
  await signIn('/profile')
  const fields = page.locator('oyl-profile-fields')
  const selfDescribe = fields.locator('input[name="gender-other"]')
  await expect(selfDescribe).toBeHidden()
  await fields.locator('select[name="gender"]').selectOption({ label: 'Other' })
  await expect(selfDescribe).toBeVisible()
})

test('the connection card is present on the profile page', async ({ page, signIn }) => {
  await signIn('/profile')
  const conn = page.locator('oyl-profile oyl-connection')
  await expect(conn.locator('button[data-value="remote"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(conn.locator('input[type="url"]')).toHaveValue(/localhost:1341/)
})

test('log out from the profile page clears the session', async ({ page, signIn }) => {
  await signIn('/profile')
  await page.locator('oyl-profile button[data-act="logout"]').click()
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
})
