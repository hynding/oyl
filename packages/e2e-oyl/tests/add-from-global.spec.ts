import { test, expect } from '@playwright/test'
import { seed, SEEDED_ITEM_NAME } from './fixtures/seed'
import { authenticateInBrowser } from './fixtures/auth-bootstrap'

test.describe('add-from-global', () => {
  test('a pre-seeded global nutrition-item is searchable and loggable', async ({ page }) => {
    const ctx = await seed()
    await authenticateInBrowser(page, ctx)

    // Block any real OFF traffic so tests are deterministic.
    await page.route(/openfoodfacts\.(net|org)/, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ products: [], count: 0, page: 1, page_count: 0, page_size: 0 }),
    }))

    await page.goto('/daily')

    // Open the nutrition search input and type a prefix that matches the seeded item.
    const search = page.getByPlaceholder(/search foods/i)
    await search.fill('E2E Oat')

    // Tier-2 (global) row should appear.
    const itemRow = page.getByText(SEEDED_ITEM_NAME).first()
    await expect(itemRow).toBeVisible({ timeout: 5_000 })
    await itemRow.click()

    // Mini-form opens; submit with default servings = 1.
    const logBtn = page.getByRole('button', { name: /^log$/i })
    await expect(logBtn).toBeVisible()
    await logBtn.click()

    // After log, the mini-form closes and the logged row appears in the list.
    await expect(logBtn).toBeHidden()
    await expect(page.locator('[role="region"], section').filter({ hasText: /nutrition/i }).getByText(SEEDED_ITEM_NAME)).toBeVisible()

    // Reload — the log persisted, so the row is still there.
    await page.reload()
    await expect(page.locator('[role="region"], section').filter({ hasText: /nutrition/i }).getByText(SEEDED_ITEM_NAME)).toBeVisible()
  })
})
