/**
 * Network resilience: offline writes queue durably and flush on reconnect, a dead
 * backend degrades to a notice (not a crash), and an invalid session logs out cleanly.
 */
import { test, expect } from '../lib/fixtures'
import { addNote, awaitOutboxDrained } from '../lib/actions'
import { API_URL } from '../lib/urls'
import { primeRemoteSession } from '../lib/fixtures'

test('offline writes queue in the outbox and flush on reconnect', async ({ page, context, signIn }) => {
  await signIn('/journal')

  await context.setOffline(true)
  await addNote(page, 'Written in a tunnel')
  // Optimistic UI: the entry renders immediately.
  await expect(page.locator('oyl-entry-row')).toContainText('Written in a tunnel')
  // The write waits durably in the outbox (flusher is offline-gated, no network attempt).
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/write-outbox') ?? '[]') as unknown[])
  expect(queued.length).toBeGreaterThan(0)

  await context.setOffline(false)
  // The 'online' event triggers the flush; the outbox drains to the server.
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toContainText('Written in a tunnel')
})

test('a dead backend at boot surfaces the reach-failure notice, not a crash', async ({ page, user, hygiene }) => {
  hygiene.allow(/localhost:9/) // every request to the dead port fails — expected
  hygiene.allow(/Failed to load resource/)
  await page.addInitScript(
    ([auth]) => {
      localStorage.setItem('oyl/storage-mode', 'remote')
      localStorage.setItem('oyl/api-base-url', 'http://localhost:9187/api')
      localStorage.setItem('oyl/auth', auth)
    },
    [JSON.stringify({ token: user.jwt, user: { id: user.id, username: user.username, email: user.email } })] as const,
  )
  await page.goto('/')
  await expect(page.locator('oyl-shell')).toBeVisible()
  const alert = page.locator('oyl-notice [role="alert"]')
  await expect(alert).toContainText("Couldn't reach the backend")
  // Dismiss the (viewport-fixed) toast, then the app remains navigable.
  await alert.locator('button[data-act="dismiss"]').click()
  await page.locator('oyl-nav a[data-route="journal"]').click()
  await expect(page).toHaveURL('/journal')
})

test('a server error on bootstrap degrades to the notice as well', async ({ page, user, hygiene }) => {
  hygiene.allow(/api\/bootstrap/)
  hygiene.allow(/Failed to load resource/)
  await primeRemoteSession(page, user)
  await page.route('**/api/bootstrap', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('/')
  await expect(page.locator('oyl-notice [role="alert"]')).toContainText("Couldn't reach the backend")
})

test('an invalid session token logs out and lands on the login page', async ({ page, user, hygiene }) => {
  hygiene.allow(/localhost:1341/) // the 401s are the point
  hygiene.allow(/Failed to load resource/)
  await page.addInitScript(
    ([api, auth]) => {
      localStorage.setItem('oyl/storage-mode', 'remote')
      localStorage.setItem('oyl/api-base-url', api)
      localStorage.setItem('oyl/auth', auth)
    },
    [API_URL, JSON.stringify({ token: 'garbage-token', user: { id: user.id, username: user.username, email: user.email } })] as const,
  )
  await page.goto('/')
  // onAuthError → logout → guard redirects to /login; the stale session is gone.
  await expect(page).toHaveURL('/login')
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('oyl/auth')))
    .toBeNull()
})

test('a same-tab quick add-then-delete fully drains the outbox (mid-drain enqueue)', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Ephemeral thought')
  const row = page.locator('oyl-entry-row')
  await expect(row).toHaveCount(1)
  // Delete immediately — the delete op lands while the save's drain may be in flight.
  await row.locator('[data-act="delete"]').click()
  await row.locator('[data-act="confirm-yes"]').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
})
