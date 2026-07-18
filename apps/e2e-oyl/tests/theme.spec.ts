/**
 * Theming: toolbar theme/mode selects, html[data-theme] + color-scheme application,
 * persistence via localStorage, and the anti-FOUC inline script honoring it on reload.
 */
import { test, expect } from '../lib/fixtures'

test('switching the theme updates html[data-theme] and persists across reload', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  await page.locator('oyl-theme-toggle select[name="theme"]').selectOption('forest')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { theme?: string })
  expect(stored.theme).toBe('forest')
  await page.reload()
  // The inline head script applies the stored theme before first paint.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('oyl-theme-toggle select[name="theme"]')).toHaveValue('forest')
})

test('switching the mode updates color-scheme and persists', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator('oyl-theme-toggle select[name="mode"]').selectOption('dark')
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('dark')
  await page.reload()
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.style.colorScheme))
    .toBe('dark')
  await expect(page.locator('oyl-theme-toggle select[name="mode"]')).toHaveValue('dark')
})
