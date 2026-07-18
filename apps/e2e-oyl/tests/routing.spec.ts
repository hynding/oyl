/**
 * History-API routing: clean URLs, SPA deep links (http-server proxy fallback),
 * unknown-route rendering (inert, XSS-safe), back/forward, and link interception.
 */
import { test, expect } from '../lib/fixtures'
import { navTo } from '../lib/actions'

test('deep link straight to /journal renders the journal screen', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page).toHaveURL('/journal')
  await expect(page.locator('oyl-journal')).toBeVisible()
  await expect(page.locator('oyl-nav a[data-route="journal"]')).toHaveAttribute('aria-current', 'page')
})

test('nav clicks are intercepted client-side (no full page reload)', async ({ page, signIn }) => {
  await signIn('/')
  await page.evaluate(() => {
    ;(window as unknown as { __e2eMarker: number }).__e2eMarker = 42
  })
  await navTo(page, 'journal')
  await navTo(page, 'vault')
  const marker = await page.evaluate(() => (window as unknown as { __e2eMarker?: number }).__e2eMarker)
  expect(marker, 'window state must survive SPA navigation').toBe(42)
})

test('browser back/forward walk the route history and update the active nav link', async ({ page, signIn }) => {
  await signIn('/')
  await navTo(page, 'journal')
  await navTo(page, 'vault')
  await page.goBack()
  await expect(page).toHaveURL('/journal')
  await expect(page.locator('oyl-nav a[data-route="journal"]')).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(page).toHaveURL('/vault')
  await expect(page.locator('oyl-nav a[data-route="vault"]')).toHaveAttribute('aria-current', 'page')
})

test('unknown route renders a Not found view', async ({ page, signIn }) => {
  await signIn('/no-such-route')
  await expect(page.locator('oyl-router h1')).toHaveText('Not found')
  await expect(page.locator('oyl-router p')).toContainText('No view for route “no-such-route”')
})

test('markup in an unknown route renders as inert text (no injection)', async ({ page, signIn }) => {
  await signIn('/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E')
  await expect(page.locator('oyl-router h1')).toHaveText('Not found')
  // The decoded name must appear as TEXT, never as an element.
  await expect(page.locator('oyl-router p')).toContainText('“<img src=x onerror=alert(1)>”')
  await expect(page.locator('oyl-router img')).toHaveCount(0)
})
