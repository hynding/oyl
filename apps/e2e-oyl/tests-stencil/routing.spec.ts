/**
 * History-API routing on the stencil shell: deep links, intercepted nav clicks, back/forward,
 * the not-found view, and the placeholder for screens the redesign has not reached.
 */
import { test, expect } from '../lib/fixtures'
import { deepText, navTo } from './lib'

test('deep link straight to /journal renders the placeholder screen', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page).toHaveURL('/journal')
  expect(await deepText(page.locator('oyl-not-yet'))).toContain('Journal is coming to the new OYL')
})

test('nav clicks are intercepted client-side (no full page reload)', async ({ page, signIn }) => {
  await signIn('/status')
  const navs = () => page.evaluate(() => performance.getEntriesByType('navigation').length)
  const before = await navs()
  await navTo(page, 'planner')
  expect(await navs()).toBe(before)
  await expect(page.locator('oyl-nav ui-nav a[aria-current="page"]')).toHaveAttribute('href', '/planner')
})

test('browser back/forward walk the route history and update the active nav link', async ({ page, signIn }) => {
  await signIn('/status')
  await navTo(page, 'goals')
  await navTo(page, 'vault')
  await page.goBack()
  await expect(page).toHaveURL('/goals')
  await expect(page.locator('oyl-nav ui-nav a[aria-current="page"]')).toHaveAttribute('href', '/goals')
  await page.goForward()
  await expect(page).toHaveURL('/vault')
  await expect(page.locator('oyl-nav ui-nav a[aria-current="page"]')).toHaveAttribute('href', '/vault')
})

test('unknown route renders a Not found view', async ({ page, signIn }) => {
  await signIn('/nope')
  expect(await deepText(page.locator('oyl-not-found'))).toContain('/nope')
  await expect(page.locator('oyl-nav ui-nav a[aria-current="page"]')).toHaveCount(0)
})

test('markup in an unknown route renders as inert text (no injection)', async ({ page, signIn }) => {
  // The route name is the raw (still percent-encoded) first path segment — shown verbatim as text.
  await signIn('/%3Cb%3Ehi%3C%2Fb%3E')
  const nf = page.locator('oyl-not-found')
  expect(await deepText(nf)).toContain('%3Cb%3Ehi%3C%2Fb%3E')
  expect(await nf.evaluate((el) => el.shadowRoot!.querySelector('b'))).toBeNull()
  // A decoded form never reaches the DOM as markup either.
  await page.goto('/<b>hi</b>')
  await expect(page.locator('oyl-not-found')).toBeVisible()
  expect(await page.locator('oyl-not-found').evaluate((el) => el.shadowRoot!.querySelector('b'))).toBeNull()
})
