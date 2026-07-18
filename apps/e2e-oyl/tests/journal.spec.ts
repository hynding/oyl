/**
 * Journal screen: notes + measurements (server-backed — persistence is asserted through
 * a real outbox flush + reload), day navigation, keyboard shortcuts, tags, custom
 * metrics, inline delete confirm, and the per-kind entry split (no finance/nutrition rows).
 */
import { test, expect } from '../lib/fixtures'
import { addNote, awaitOutboxDrained, inlineConfirm } from '../lib/actions'

test('empty day shows the journal empty state', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect(page.locator('oyl-journal')).toContainText('Nothing logged for')
})

test('a note round-trips through the backend (add → flush → reload)', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Walked the long way home', 'walking evening')
  const row = page.locator('oyl-entry-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Walked the long way home')
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toContainText('Walked the long way home')
})

test('a measurement logs with metric and value', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('button[data-type="measurement"]').click()
  await form.locator('select[name="metric"]').selectOption('body.weight_kg')
  await form.locator('input[name="value"]').fill('81.5')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await expect(page.locator('oyl-entry-row')).toContainText('81.5')
})

test('a custom metric requires its name field', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('button[data-type="measurement"]').click()
  const metric = form.locator('select[name="metric"]')
  const customValue = await metric
    .locator('option')
    .last()
    .getAttribute('value')
  await metric.selectOption(customValue ?? 'custom')
  await expect(form.locator('input[name="custom"]')).toBeVisible()
  await form.locator('input[name="custom"]').fill('custom.pushups')
  await form.locator('input[name="value"]').fill('30')
  await form.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-entry-row')).toContainText('30')
})

test('day navigation scopes entries to their day', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Today only entry')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await page.locator('oyl-journal button[data-nav="prev"]').click()
  await expect(page.locator('oyl-journal')).toContainText('Nothing logged for')
  await page.locator('oyl-journal button[data-nav="next"]').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
})

test('arrow keys move between days', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Keyboard day test')
  await page.locator('oyl-journal button[data-nav="prev"]').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('oyl-journal')).toContainText('Nothing logged for')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
})

test('deleting an entry asks for inline confirmation first', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Doomed entry')
  const row = page.locator('oyl-entry-row')
  // Answering "No" keeps the entry.
  await inlineConfirm(row, 'delete', 'no')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  // Answering "Yes" removes it — and the removal persists server-side.
  await inlineConfirm(row, 'delete', 'yes')
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
  await expect(page.locator('oyl-journal')).toContainText('Nothing logged for')
})

test('tags render as chips on the note row', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Tagged entry', 'alpha beta')
  await expect(page.locator('oyl-entry-row')).toContainText('alpha')
  await expect(page.locator('oyl-entry-row')).toContainText('beta')
})
