/**
 * Engagement widget deck: mounts only on widget-bearing layouts (sidebar rail /
 * dashboard band), shows badged Sample data for a fresh account, and swaps to
 * real data reactively once the account has any. Runs on desktop + mobile
 * (below 641px the deck is a horizontal scroll row — still visible).
 */
import { test, expect } from '../lib/fixtures'
import { addNote } from '../lib/actions'

const trigger = 'oyl-layout-picker button[data-layout-trigger]'

async function pickLayout(page: import('@playwright/test').Page, id: string) {
  await page.locator(trigger).click()
  await page.locator(`oyl-layout-picker [data-layout-option="${id}"]`).click()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', id)
  await page.keyboard.press('Escape')
  await expect(page.locator('oyl-layout-picker [data-layout-panel]')).toBeHidden()
}

test('deck mounts only on widget-bearing layouts, with the right mode', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('oyl-widgets')).toHaveCount(0) // classic default
  await pickLayout(page, 'dashboard')
  await expect(page.locator('oyl-widgets')).toBeVisible()
  await expect(page.locator('oyl-widgets')).toHaveAttribute('mode', 'band')
  await pickLayout(page, 'sidebar')
  await expect(page.locator('oyl-widgets')).toHaveAttribute('mode', 'rail')
  await pickLayout(page, 'focus')
  await expect(page.locator('oyl-widgets')).toHaveCount(0)
})

test('fresh account shows all five widgets with Sample badges', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'dashboard')
  for (const widget of ['oyl-greeting-digest', 'oyl-streak-ring', 'oyl-today-plan', 'oyl-trend-sparklines', 'oyl-goal-rings']) {
    await expect(page.locator(widget), widget).toBeVisible()
  }
  // Greeting always renders real greeting text; its digest line is sampled:
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toBeVisible()
  await expect(page.locator('oyl-today-plan [data-sample-badge]')).toBeVisible()
})

test('adding a journal entry replaces the streak sample with real data, live', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'dashboard')
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toBeVisible()
  // Add a note through the real journal UI — reuse the exact flow/selectors
  // from the existing journal spec (per-test user, unique text):
  await page.locator('oyl-nav a[data-route="journal"]').click()
  await addNote(page, 'Streak swap note')
  await expect(page.locator('oyl-entry-row')).toContainText('Streak swap note')
  // The deck travels with the dashboard layout, so it is visible on /journal:
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toHaveCount(0)
  await expect(page.locator('oyl-streak-ring')).toContainText('1')
})
