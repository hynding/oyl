/**
 * Planner screen on the stencil shell: tasks + appointments, completion, recurrence, overdue
 * surfacing, cancel/delete inline confirms, day navigation and the week strip's dots.
 *
 * NOTE: plans have no Strapi backend yet (not in BACKED in client/storage/bootstrap.ts), so
 * these tests assert in-session behavior only — no reload/persistence assertions. When plans
 * get a backend, add a round-trip test like journal.spec.ts's.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'
import { addTask, deepText } from './lib'

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

test('empty day shows the planner empty state', async ({ page, signIn }) => {
  await signIn('/planner')
  await expect.poll(() => deepText(page.locator('oyl-planner'))).toContain('Nothing planned for')
})

test('a task due today appears in the agenda and completes via its check', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Water the plants')
  const row = page.locator('oyl-plan-row')
  await expect(row).toHaveCount(1)
  expect(await deepText(row)).toContain('Water the plants')
  const check = row.locator('button.check')
  await expect(check).toHaveAttribute('aria-checked', 'false')
  await check.click()
  await expect(check).toHaveAttribute('aria-checked', 'true')
  await expect(check).toBeDisabled()
})

test('an overdue task surfaces in the Overdue section on today', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Should have done this', isoDaysFromToday(-1))
  await expect(page.locator('oyl-planner .section-label.overdue')).toHaveText('Overdue')
  const row = page.locator('oyl-plan-row')
  expect(await deepText(row)).toContain('Should have done this')
  expect(await deepText(row)).toContain('1d ago')
})

test('an appointment logs with start time and shows on its day', async ({ page, signIn }) => {
  await signIn('/planner')
  const form = page.locator('oyl-plan-composer')
  await form.locator('ui-segment [data-value="appointment"]').click()
  await form.locator('ui-field[name="title"] input').fill('Dentist')
  await form.locator('ui-field[name="startsAt"] input').fill(`${isoDaysFromToday(0)}T14:30`)
  await form.locator('ui-field[name="duration"] input').fill('45')
  await form.locator('ui-button[type="submit"] button').click()
  const row = page.locator('oyl-plan-row')
  await expect(row).toHaveCount(1)
  const text = await deepText(row)
  expect(text).toContain('Dentist')
  expect(text).toContain('45m')
  expect(text).toContain('Appointment')
})

test('a repeating task can be created', async ({ page, signIn }) => {
  await signIn('/planner')
  const form = page.locator('oyl-plan-composer')
  await form.locator('ui-segment [data-value="task"]').click()
  await form.locator('ui-field[name="title"] input').fill('Weekly review')
  await form.locator('ui-checkbox[name="repeat"] input').check()
  await form.locator('ui-field[name="repeatN"] input').fill('1')
  await form.locator('select[name="repeatUnit"]').selectOption('weeks')
  await form.locator('ui-button[type="submit"] button').click()
  const row = page.locator('oyl-plan-row')
  await expect(row).toHaveCount(1)
  expect(await deepText(row)).toContain('every week')
})

test('an empty title shows the domain error inline', async ({ page, signIn }) => {
  await signIn('/planner')
  const form = page.locator('oyl-plan-composer')
  await form.locator('ui-button[type="submit"] button').click()
  await expect(form.locator('[data-role="error"]')).toContainText('non-empty')
  await expect(page.locator('oyl-plan-row')).toHaveCount(0)
})

test('cancel and delete both require inline confirmation', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Cancel me')
  const row = page.locator('oyl-plan-row')
  await inlineConfirm(row, 'cancelplan', 'no')
  await expect(row.locator('[data-act="cancelplan"]')).toBeVisible()
  await inlineConfirm(row, 'cancelplan', 'yes')
  // A canceled plan keeps its row (badged), still deletable.
  await expect(row).toHaveCount(1)
  expect(await deepText(row)).toContain('Canceled')
  await inlineConfirm(row, 'delete', 'yes')
  await expect(page.locator('oyl-plan-row')).toHaveCount(0)
  await expect.poll(() => deepText(page.locator('oyl-planner'))).toContain('Nothing planned for')
})

test('day navigation moves the agenda day', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Tomorrow prep', isoDaysFromToday(1))
  // Not visible today...
  await expect.poll(() => deepText(page.locator('oyl-planner'))).toContain('Nothing planned for')
  // ...but visible tomorrow.
  await page.locator('oyl-planner ui-button[data-nav="next"] button').click()
  await expect(page.locator('oyl-plan-row')).toHaveCount(1)
  expect(await deepText(page.locator('oyl-plan-row'))).toContain('Tomorrow prep')
})

test('the week strip marks days with open plans and jumps to them', async ({ page, signIn }) => {
  await signIn('/planner')
  const pills = page.locator('oyl-planner [data-day]')
  await expect(pills).toHaveCount(7)
  await expect(pills.locator('.dot')).toHaveCount(0)
  await addTask(page, 'Strip test', isoDaysFromToday(2))
  await expect(pills.nth(5).locator('.dot')).toHaveCount(1)
  await expect(pills.locator('.dot')).toHaveCount(1)
  await pills.nth(5).click()
  await expect(pills.nth(3)).toHaveAttribute('aria-pressed', 'true') // re-centered
  await expect(page.locator('oyl-plan-row')).toHaveCount(1)
  // Completing it clears the dot (only open plans mark a day).
  await page.locator('oyl-plan-row button.check').click()
  await expect(pills.locator('.dot')).toHaveCount(0)
})
