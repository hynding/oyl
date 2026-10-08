/**
 * Mobile UX on the stencil shell (mobile project asserts, desktop asserts the inverse):
 * the ≤640px fixed bottom tab bar, reserved page padding, no horizontal overflow, tap targets.
 */
import { test, expect } from '../lib/fixtures'

test('nav docks as a fixed bottom tab bar on mobile (and stays in the header on desktop)', async ({ page, signIn, isMobile }) => {
  await signIn('/')
  const bar = page.locator('oyl-nav ui-nav')
  const position = await bar.evaluate((el) => getComputedStyle(el).position)
  if (isMobile) {
    expect(position).toBe('fixed')
    const padding = await page.locator('oyl-shell').evaluate((el) => parseFloat(getComputedStyle(el.shadowRoot!.querySelector('.page')!).paddingBottom))
    expect(padding).toBeGreaterThan(60)
  } else {
    expect(position).not.toBe('fixed')
  }
})

test('no horizontal page overflow on any screen', async ({ page, signIn }) => {
  await signIn('/status')
  for (const route of ['/status', '/journal', '/nutrition', '/planner', '/vault', '/goals', '/insights', '/finance', '/profile', '/login']) {
    await page.goto(route)
    await expect(page.locator('oyl-shell')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow, route).toBe(false)
  }
})

test('every nav tab is reachable and tappable with a ≥44px target on mobile', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile only')
  await signIn('/status')
  const tabs = page.locator('oyl-nav ui-nav a')
  await expect(tabs).toHaveCount(8)
  for (let i = 0; i < 8; i++) {
    const box = await tabs.nth(i).boundingBox()
    expect(box?.height ?? 0, `tab ${i}`).toBeGreaterThanOrEqual(44)
  }
  await tabs.filter({ hasText: 'Vault' }).tap()
  await expect(page).toHaveURL('/vault')
})
