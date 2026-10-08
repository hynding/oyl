/**
 * Online-first resilience on the stencil shell: a dead backend at boot degrades to the
 * reach-failure notice, an invalid session is logged out to /login, and offline writes
 * (a seed) queue in the outbox and flush on reconnect.
 */
import { test, expect, primeRemoteSession } from '../lib/fixtures'
import { API_URL } from '../lib/urls'
import { act, awaitOutboxDrained, deepText } from './lib'

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

test('offline writes queue in the outbox and flush on reconnect', async ({ page, context, user, hygiene }) => {
  // The shell's only write path today is the demo seed (~270 records): draining it after
  // reconnect takes a while under parallel workers.
  test.setTimeout(150_000)
  // Offline, the post-seed re-pull of /bootstrap fails by design (the notice path), and the
  // browser logs it; both are the intended offline behavior.
  hygiene.allow(/localhost:1341/)
  hygiene.allow(/Failed to load resource/)
  hygiene.allow(/ERR_INTERNET_DISCONNECTED/)
  await primeRemoteSession(page, user)
  await page.goto('/status')
  await expect(page.locator('oyl-status h2').first()).toHaveText('Status')
  // Let boot's fire-and-forget Google probe finish before flipping the network.
  await page.waitForLoadState('networkidle')
  await context.setOffline(true)
  await act(page.locator('oyl-status'), 'seed').click()
  const queued = () => page.evaluate(() => (JSON.parse(localStorage.getItem('oyl/write-outbox') ?? '[]') as unknown[]).length)
  await expect.poll(queued, { timeout: 15_000 }).toBeGreaterThan(0)
  // Nothing drains while offline (the flusher is offline-gated — no network attempt).
  const before = await queued()
  await page.waitForTimeout(1000)
  expect(await queued()).toBe(before)
  await context.setOffline(false)
  // Reconnect: the connectivity subscription flushes; everything lands on the server.
  await awaitOutboxDrained(page, 120_000)
  await page.reload()
  await expect(page.locator('oyl-status dt:text-is("notes") + dd')).not.toHaveText('0')
})
