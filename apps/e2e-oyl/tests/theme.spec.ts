/**
 * Theming: toolbar swatch picker (popover with a card per theme + segmented mode
 * control), html[data-theme] + color-scheme application, persistence via localStorage,
 * and the anti-FOUC inline script honoring it on reload.
 */
import { test, expect } from '../lib/fixtures'

const trigger = 'oyl-theme-toggle button[data-picker-trigger]'

test('switching the theme updates html[data-theme] and persists across reload', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  await page.locator(trigger).click()
  await page.locator('oyl-theme-toggle [data-theme-option="forest"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { theme?: string })
  expect(stored.theme).toBe('forest')
  await page.reload()
  // The inline head script applies the stored theme before first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator(trigger)).toContainText('Forest')
})

test('the picker offers every theme in the collection and stays open for browsing', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  const options = page.locator('oyl-theme-toggle [data-theme-option]')
  await expect(options).toHaveCount(8)
  // Live-preview browsing: selecting applies instantly without closing the panel.
  await page.locator('oyl-theme-toggle [data-theme-option="ink"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink')
  await expect(page.locator('oyl-theme-toggle [data-picker-panel]')).toBeVisible()
  await page.locator('oyl-theme-toggle [data-theme-option="sunrise"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunrise')
  // Escape closes the popover.
  await page.keyboard.press('Escape')
  await expect(page.locator('oyl-theme-toggle [data-picker-panel]')).toBeHidden()
})

test('switching the mode updates color-scheme and persists', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  await page.locator('oyl-theme-toggle [data-mode-option="dark"]').click()
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('dark')
  await page.reload()
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('dark')
  await page.locator(trigger).click()
  await expect(page.locator('oyl-theme-toggle [data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
})
