/**
 * Journal screen on the stencil shell: notes + measurements (server-backed — persistence is
 * asserted through a real outbox flush + reload), day navigation (buttons, week strip, arrow
 * keys), tags, custom metrics, inline delete confirm, and the per-kind entry split.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'
import { addNote, awaitOutboxDrained, deepText } from './lib'

const nav = (dir: 'prev' | 'next') => `oyl-journal ui-button[data-nav="${dir}"] button`

test('empty day shows the journal empty state', async ({ page, signIn }) => {
  await signIn('/journal')
  await expect.poll(() => deepText(page.locator('oyl-journal'))).toContain('Nothing logged for')
})

test('a note round-trips through the backend (add → flush → reload)', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Walked the long way home', 'walking evening')
  const row = page.locator('oyl-entry-row')
  await expect(row).toHaveCount(1)
  expect(await deepText(row)).toContain('Walked the long way home')
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  expect(await deepText(page.locator('oyl-entry-row'))).toContain('Walked the long way home')
})

test('a measurement logs with metric and value', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('ui-segment [data-value="measurement"]').click()
  await form.locator('select[name="metric"]').selectOption('body.weight_kg')
  await form.locator('ui-field[name="value"] input').fill('81.5')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  expect(await deepText(page.locator('oyl-entry-row'))).toContain('81.5 kg')
})

test('a custom metric requires its name field', async ({ page, signIn }) => {
  await signIn('/journal')
  const form = page.locator('oyl-log-form')
  await form.locator('ui-segment [data-value="measurement"]').click()
  await form.locator('select[name="metric"]').selectOption('custom')
  await expect(form.locator('ui-field[name="custom"] input')).toBeVisible()
  await form.locator('ui-field[name="custom"] input').fill('custom.pushups')
  await form.locator('ui-field[name="value"] input').fill('30')
  await form.locator('ui-button[type="submit"] button').click()
  expect(await deepText(page.locator('oyl-entry-row'))).toContain('custom.pushups = 30')
})

test('day navigation scopes entries to their day', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Today only entry')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await page.locator(nav('prev')).click()
  await expect.poll(() => deepText(page.locator('oyl-journal'))).toContain('Nothing logged for')
  await page.locator(nav('next')).click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
})

test('the week strip jumps between days', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Strip test')
  const pills = page.locator('oyl-journal [data-day]')
  await expect(pills).toHaveCount(7)
  await expect(pills.nth(3)).toHaveAttribute('aria-pressed', 'true')
  await pills.nth(2).click()
  await expect(pills.nth(3)).toHaveAttribute('aria-pressed', 'true') // the strip re-centers on the shown day
  await expect.poll(() => deepText(page.locator('oyl-journal'))).toContain('Nothing logged for')
  await pills.nth(4).click()
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
})

test('arrow keys move between days', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Keyboard day test')
  await page.locator(nav('prev')).focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => deepText(page.locator('oyl-journal'))).toContain('Nothing logged for')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
})

test('deleting an entry asks for inline confirmation first', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Doomed entry')
  const row = page.locator('oyl-entry-row')
  await inlineConfirm(row, 'delete', 'no')
  await expect(page.locator('oyl-entry-row')).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'yes')
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
  await awaitOutboxDrained(page)
  await page.reload()
  await expect(page.locator('oyl-entry-row')).toHaveCount(0)
  await expect.poll(() => deepText(page.locator('oyl-journal'))).toContain('Nothing logged for')
})

test('tags render as chips on the note row', async ({ page, signIn }) => {
  await signIn('/journal')
  await addNote(page, 'Tagged entry', 'alpha beta')
  const text = await deepText(page.locator('oyl-entry-row'))
  expect(text).toContain('alpha')
  expect(text).toContain('beta')
})
