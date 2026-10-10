/**
 * Online-first resilience on the stencil shell: a dead backend at boot degrades to the
 * reach-failure notice, an invalid session is logged out to /login, and offline writes
 * (a seed) queue in the outbox and flush on reconnect.
 */
import { test, expect, primeRemoteSession } from '../lib/fixtures'
import { API_URL } from '../lib/urls'
import { addNote, awaitOutboxDrained, deepText } from './lib'

test('a dead backend at boot surfaces the reach-failure notice, not a crash', async ({ page, user, hygiene }) => {
  hygiene.allow(/localhost:1399/)
  hygiene.allow(/Failed to load resource/)
  hygiene.allow(/ERR_CONNECTION_REFUSED/)
  await page.addInitScript(([auth]) => {
    localStorage.setItem('oyl/storage-mode', 'remote')
    localStorage.setItem('oyl/api-base-url', 'http://localhost:1399/api')
    localStorage.setItem('oyl/auth', auth)
  }, [JSON.stringify({ token: user.jwt, user: { id: user.id, username: user.username, email: user.email } })] as const)
  await page.goto('/status')
  await expect(page.locator('oyl-status h2').first()).toHaveText('Status')
  await expect.poll(() => deepText(page.locator('oyl-notice-host'))).toContain("Couldn't reach the backend")
})

test('an invalid session token logs out and lands on the login page', async ({ page, user, hygiene }) => {
  hygiene.allow(/localhost:1341/)
  hygiene.allow(/Failed to load resource/)
  await page.addInitScript(([api, auth]) => {
    localStorage.setItem('oyl/storage-mode', 'remote')
    localStorage.setItem('oyl/api-base-url', api)
    localStorage.setItem('oyl/auth', auth)
  }, [API_URL, JSON.stringify({ token: 'not-a-jwt', user: { id: user.id, username: user.username, email: user.email } })] as const)
  await page.goto('/status')
  await expect(page).toHaveURL('/login')
  expect(await page.evaluate(() => localStorage.getItem('oyl/auth'))).toBeNull()
})

test('offline writes queue in the outbox and flush on reconnect', async ({ page, context, user }) => {
  await primeRemoteSession(page, user)
  await page.goto('/journal')
  await expect(page.locator('oyl-journal oyl-log-form')).toBeVisible()
  // Let boot's fire-and-forget Google probe finish before flipping the network.
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await addNote(page, 'Written in a tunnel')
  // Optimistic UI: the entry renders immediately.
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  // The write waits durably in the outbox (flusher is offline-gated, no network attempt).
  const queued = await page.evaluate(() => (JSON.parse(localStorage.getItem('oyl/write-outbox') ?? '[]') as unknown[]).length)
  expect(queued).toBeGreaterThan(0)
  await context.setOffline(false)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  expect(await deepText(page.locator('oyl-entry-row'))).toContain('Written in a tunnel')
})
