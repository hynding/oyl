/**
 * Theming on the stencil shell: the toolbar swatch picker, html[data-theme] + color-scheme
 * application, persistence (shared oyl/settings blob), and the anti-FOUC head script.
 */
import { test, expect } from '../lib/fixtures'

const trigger = 'oyl-theme-picker button[data-picker-trigger]'

test('switching the theme updates html[data-theme] and persists across reload', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  await page.locator(trigger).click()
  await page.locator('oyl-theme-picker [data-theme-option="forest"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { theme?: string })
  expect(stored.theme).toBe('forest')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator(trigger)).toContainText('Forest')
})

test('the picker offers every theme and stays open for browsing; Escape closes', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  await expect(page.locator('oyl-theme-picker [data-theme-option]')).toHaveCount(8)
  await page.locator('oyl-theme-picker [data-theme-option="ink"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ink')
  await expect(page.locator('oyl-theme-picker [data-picker-panel]')).toBeVisible()
  await page.locator('oyl-theme-picker [data-theme-option="sunrise"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunrise')
  await page.keyboard.press('Escape')
  await expect(page.locator('oyl-theme-picker [data-picker-panel]')).toBeHidden()
})

test('switching the mode updates color-scheme and persists', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  await page.locator('oyl-theme-picker [data-mode-option="dark"]').click()
  await expect.poll(async () => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  await page.reload()
  await expect.poll(async () => page.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark')
  await page.locator(trigger).click()
  await expect(page.locator('oyl-theme-picker [data-mode-option="dark"]')).toHaveAttribute('aria-checked', 'true')
})
