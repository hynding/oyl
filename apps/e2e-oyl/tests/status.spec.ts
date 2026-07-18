/**
 * Status screen: diagnostics cards, remote-mode tool gating, and the local-mode data
 * tools (export download, reset with native confirm — exercised via dialog handlers).
 */
import { test, expect } from '../lib/fixtures'
import { primeLocalMode, awaitOutboxDrained, navTo } from '../lib/actions'

test('diagnostics cards render schema/theme/build and per-collection counts', async ({ page, signIn }) => {
  await signIn('/status')
  const panel = page.locator('oyl-status-panel')
  await expect(panel).toContainText('schema')
  await expect(panel).toContainText('theme')
  await expect(panel).toContainText('build')
  await expect(panel).toContainText('notes')
  await expect(panel).toContainText('goals')
})

test('collection counts reflect server data after a write + reload', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('textarea[name="text"]').fill('Count me')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await awaitOutboxDrained(page)
  await page.reload()
  await navTo(page, 'status')
  // The counts card renders one dt/dd pair per collection — notes must count 1.
  await expect(page.locator('oyl-status-panel dt:text-is("notes") + dd')).toHaveText('1')
})

test('remote mode enables the account tools and gates the local reset', async ({ page, signIn }) => {
  await signIn('/status')
  const panel = page.locator('oyl-status-panel')
  for (const act of ['seed', 'export', 'import']) {
    await expect(panel.locator(`button[data-act="${act}"]`)).toBeEnabled()
  }
  await expect(panel.locator('button[data-act="reset"]')).toBeDisabled()
  await expect(panel).toContainText('Reset applies to local data — available in Local mode.')
})

test('local mode gates the account tools with an explanation', async ({ page }) => {
  await primeLocalMode(page)
  await page.goto('/status')
  const panel = page.locator('oyl-status-panel')
  for (const act of ['seed', 'export', 'import']) {
    await expect(panel.locator(`button[data-act="${act}"]`)).toBeDisabled()
  }
  await expect(panel.locator('button[data-act="reset"]')).toBeEnabled()
  await expect(panel).toContainText('available in Remote mode')
})

test('export downloads a valid backup document of the account', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('textarea[name="text"]').fill('Back me up')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await navTo(page, 'status')
  const panel = page.locator('oyl-status-panel')
  const downloadPromise = page.waitForEvent('download')
  await panel.locator('button[data-act="export"]').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^oyl-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const doc = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
    schemaVersion?: number
    collections?: Record<string, unknown[]>
  }
  expect(typeof doc.schemaVersion).toBe('number')
  // The export carries the account's data, not localStorage remnants.
  expect(doc.collections?.['notes']).toHaveLength(1)
})

test('local mode: reset asks for native confirmation and wipes oyl keys', async ({ page, hygiene }) => {
  // The post-reset refresh() hits the (token-less) backend → expected auth failures.
  hygiene.allow(/localhost:1341/)
  hygiene.allow(/Failed to load resource/)
  await primeLocalMode(page)
  await page.addInitScript(() => localStorage.setItem('oyl/data/notes', '[{"probe":true}]'))
  await page.goto('/status')

  // Dismissing the confirm leaves data untouched.
  page.once('dialog', (d) => void d.dismiss())
  await page.locator('oyl-status-panel button[data-act="reset"]').click()
  expect(await page.evaluate(() => localStorage.getItem('oyl/data/notes'))).not.toBeNull()

  // Accepting erases every oyl/ key.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('Erase all local OYL data?')
    void d.accept()
  })
  await page.locator('oyl-status-panel button[data-act="reset"]').click()
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('oyl/data/notes')))
    .toBeNull()
})
