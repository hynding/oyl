/**
 * Status screen on the stencil shell: diagnostics cards, live counts after a seed (no
 * reload), tool gating by mode, export download, and the Local-mode reset confirm.
 */
import { test, expect } from '../lib/fixtures'
import { act, awaitOutboxDrained, primeLocalMode } from './lib'

test('diagnostics cards render schema/theme/build and per-collection counts', async ({ page, signIn }) => {
  await signIn('/status')
  const panel = page.locator('oyl-status')
  for (const key of ['schema', 'theme', 'build', 'pending', 'notes', 'goals']) {
    await expect(panel.locator(`dt:text-is("${key}")`)).toHaveCount(1)
  }
  await expect(panel.locator('dt:text-is("notes") + dd')).toHaveText('0')
})

// The demo seed is ~270 sequential PUTs; under parallel workers that outruns the default
// 30s test budget. Seed-based tests declare theirs.
const SEED_TIMEOUT = 150_000

test('seeding an empty account raises the counts live and drains the outbox', async ({ page, signIn }) => {
  test.setTimeout(SEED_TIMEOUT)
  await signIn('/status')
  await act(page.locator('oyl-status'), 'seed').click()
  await awaitOutboxDrained(page, 120_000)
  await expect(page.locator('oyl-status dt:text-is("notes") + dd')).not.toHaveText('0', { timeout: 15_000 })
  await expect(page.locator('oyl-status dt:text-is("pending") + dd')).toHaveText('0')
  await page.reload()
  await expect(page.locator('oyl-status dt:text-is("notes") + dd')).not.toHaveText('0')
})

test('remote mode enables the account tools and gates the local reset', async ({ page, signIn }) => {
  await signIn('/status')
  const panel = page.locator('oyl-status')
  for (const name of ['seed', 'export', 'import']) await expect(act(panel, name)).toBeEnabled()
  await expect(act(panel, 'reset')).toBeDisabled()
  await expect(panel.locator('#tools-note')).toHaveText('Reset applies to local data — available in Local mode.')
})

test('local mode gates the account tools with an explanation', async ({ page }) => {
  await primeLocalMode(page)
  await page.goto('/status')
  const panel = page.locator('oyl-status')
  for (const name of ['seed', 'export', 'import']) await expect(act(panel, name)).toBeDisabled()
  await expect(act(panel, 'reset')).toBeEnabled()
  await expect(panel.locator('#tools-note')).toContainText('available in Remote mode')
})

test('export downloads a valid backup document of the account', async ({ page, signIn }) => {
  test.setTimeout(SEED_TIMEOUT)
  await signIn('/status')
  await act(page.locator('oyl-status'), 'seed').click()
  await awaitOutboxDrained(page, 120_000)
  const downloadPromise = page.waitForEvent('download')
  await act(page.locator('oyl-status'), 'export').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^oyl-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer)
  const doc = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { schemaVersion?: number; collections?: Record<string, unknown[]> }
  expect(typeof doc.schemaVersion).toBe('number')
  expect(doc.collections?.['notes']?.length ?? 0).toBeGreaterThan(0)
})

test('local mode: reset asks for native confirmation and wipes oyl keys', async ({ page, hygiene }) => {
  hygiene.allow(/localhost:1341/)
  hygiene.allow(/Failed to load resource/)
  await primeLocalMode(page)
  await page.addInitScript(() => localStorage.setItem('oyl/data/notes', '[{"probe":true}]'))
  await page.goto('/status')
  page.once('dialog', (d) => void d.dismiss())
  await act(page.locator('oyl-status'), 'reset').click()
  expect(await page.evaluate(() => localStorage.getItem('oyl/data/notes'))).not.toBeNull()
  page.once('dialog', (d) => { expect(d.message()).toContain('Erase all local OYL data?'); void d.accept() })
  await act(page.locator('oyl-status'), 'reset').click()
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('oyl/data/notes'))).toBeNull()
})
