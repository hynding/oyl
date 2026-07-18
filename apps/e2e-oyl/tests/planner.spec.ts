/**
 * Planner screen: tasks + appointments, completion, recurrence, overdue surfacing,
 * cancel/delete inline confirms, and day navigation.
 *
 * NOTE: plans have no Strapi backend yet (not in BACKED in storage/bootstrap.js), so these
 * tests assert in-session behavior only — no reload/persistence assertions. When plans get
 * a backend, add a round-trip test like journal.spec.ts's.
 */
import { test, expect } from '../lib/fixtures'
import { inlineConfirm } from '../lib/actions'

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function addTask(page: import('@playwright/test').Page, title: string, due: string) {
  const composer = page.locator('oyl-plan-composer')
  await composer.locator('button[data-type="task"]').click()
  await composer.locator('input[name="title"]').fill(title)
  await composer.locator('input[name="due"]').fill(due)
  await composer.locator('button[type="submit"]').click()
}

test('empty day shows the planner empty state', async ({ page, signIn }) => {
  await signIn('/planner')
  await expect(page.locator('oyl-planner')).toContainText('Nothing planned for')
})

test('a task due today appears in the agenda and completes via its checkbox', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Water the plants', isoDaysFromToday(0))
  const row = page.locator('oyl-plan-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Water the plants')
  const check = row.locator('input.check')
  await expect(check).not.toBeChecked()
  await check.click()
  await expect(check).toBeChecked()
})

test('an overdue task surfaces in the Overdue section on today', async ({ page, signIn }) => {
  await signIn('/planner')
  // Create the task dated yesterday: navigate the composer date directly.
  await addTask(page, 'Should have done this', isoDaysFromToday(-1))
  await expect(page.locator('oyl-planner .section-label.overdue')).toHaveText('Overdue')
  await expect(page.locator('oyl-plan-row')).toContainText('Should have done this')
})

test('an appointment logs with start time and shows on its day', async ({ page, signIn }) => {
  await signIn('/planner')
  const composer = page.locator('oyl-plan-composer')
  await composer.locator('button[data-type="appointment"]').click()
  await composer.locator('input[name="title"]').fill('Dentist')
  await composer.locator('input[name="startsAt"]').fill(`${isoDaysFromToday(0)}T14:30`)
  await composer.locator('input[name="duration"]').fill('45')
  await composer.locator('button[type="submit"]').click()
  const row = page.locator('oyl-plan-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Dentist')
})

test('a repeating task can be created', async ({ page, signIn }) => {
  await signIn('/planner')
  const composer = page.locator('oyl-plan-composer')
  await composer.locator('button[data-type="task"]').click()
  await composer.locator('input[name="title"]').fill('Weekly review')
  await composer.locator('input[name="due"]').fill(isoDaysFromToday(0))
  await composer.locator('input[name="repeat"]').check()
  await composer.locator('input[name="repeatN"]').fill('1')
  await composer.locator('select[name="repeatUnit"]').selectOption('weeks')
  await composer.locator('button[type="submit"]').click()
  await expect(page.locator('oyl-plan-row')).toContainText('Weekly review')
})

test('cancel and delete both require inline confirmation', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Cancel me', isoDaysFromToday(0))
  const row = page.locator('oyl-plan-row')
  await inlineConfirm(row, 'cancelplan', 'yes')
  // A cancelled plan keeps its row (badged), still deletable.
  await expect(row).toHaveCount(1)
  await inlineConfirm(row, 'delete', 'yes')
  await expect(page.locator('oyl-plan-row')).toHaveCount(0)
  await expect(page.locator('oyl-planner')).toContainText('Nothing planned for')
})

test('day navigation moves the agenda day', async ({ page, signIn }) => {
  await signIn('/planner')
  await addTask(page, 'Tomorrow prep', isoDaysFromToday(1))
  // Not visible today...
  await expect(page.locator('oyl-planner')).toContainText('Nothing planned for')
  // ...but visible tomorrow.
  await page.locator('oyl-planner button[data-nav="next"]').click()
  await expect(page.locator('oyl-plan-row')).toContainText('Tomorrow prep')
})
