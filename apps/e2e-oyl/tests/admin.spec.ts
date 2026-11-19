/**
 * The Status screen is admin-only (the backend's OYL_ADMIN_EMAILS allowlist, read through
 * GET /access): a plain user never sees its tab, and every way onto /status — a deep link,
 * the `/` default, an in-app navigation — lands on the Journal instead. Admins keep it.
 */
import { test, expect } from '../lib/fixtures'
import { deepText } from './lib'

test.describe('a plain user', () => {
  test('has no Status tab and is sent from /status to /journal', async ({ page, signIn }) => {
    await signIn('/status')
    await expect(page).toHaveURL('/journal')
    await expect(page.locator('oyl-journal')).toBeVisible()
    await expect(page.locator('oyl-status')).toHaveCount(0)
    await expect(page.locator('oyl-nav ui-nav a')).toHaveCount(7)
    await expect(page.locator('oyl-nav ui-nav a[href="/status"]')).toHaveCount(0)
  })

  test('the / default lands on /journal, not /status', async ({ page, signIn }) => {
    await signIn('/')
    await expect(page).toHaveURL('/journal')
    await expect(page).toHaveTitle('Journal · OYL')
  })

  test('an in-app link to /status is bounced back to /journal without a reload', async ({ page, signIn }) => {
    await signIn('/nope')
    const navs = () => page.evaluate(() => performance.getEntriesByType('navigation').length)
    const before = await navs()
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = '/status'
      a.textContent = 'status'
      document.body.append(a)
      a.click()
    })
    await expect(page).toHaveURL('/journal')
    expect(await navs()).toBe(before)
  })
})

test.describe('an admin', () => {
  test.use({ admin: true })

  test('sees the Status tab and screen', async ({ page, signIn }) => {
    await signIn('/status')
    await expect(page).toHaveURL('/status')
    await expect(page.locator('oyl-status h2').first()).toHaveText('Status')
    await expect(page.locator('oyl-nav ui-nav a[href="/status"]')).toHaveCount(1)
  })

  test('keeps Status after a reload (and the flag never outlives a logout)', async ({ page, signIn }) => {
    await signIn('/status')
    await page.reload()
    await expect(page.locator('oyl-status h2').first()).toHaveText('Status')
    await page.locator('oyl-account-menu ui-button[data-act="logout"] button').click()
    await expect(page).toHaveURL('/login')
    expect(await page.evaluate(() => localStorage.getItem('oyl/access'))).toBeNull()
    expect(await deepText(page.locator('oyl-nav'))).not.toContain('Status')
  })
})
