import { test, expect } from '@playwright/test'
import { seed, SEEDED_BARCODE, SEEDED_ITEM_NAME } from './fixtures/seed'
import { authenticateInBrowser } from './fixtures/auth-bootstrap'

test.describe('barcode-manual-fallback', () => {
  test('manual barcode entry runs find-or-create flow + logs entry', async ({ page, browserName }) => {
    // Camera/BarcodeDetector behaves differently per browser — Firefox lacks
    // native BarcodeDetector and would dynamic-import @zxing/browser. We don't
    // need camera here because we use the manual-entry fallback path; deny
    // camera permission so the scanner UI skips straight to the manual input.
    const ctx = await seed()
    await authenticateInBrowser(page, ctx)

    // Block any OFF traffic that may fire for unknown barcodes.
    await page.route(/openfoodfacts\.(net|org)/, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 0 }),
    }))

    await page.goto('/daily')

    // Click the scan button.
    const scanBtn = page.getByRole('button', { name: /scan/i })
    await scanBtn.click()

    // The scanner modal shows a manual-entry input regardless of camera state.
    const manualInput = page.getByPlaceholder(/enter barcode/i)
    await expect(manualInput).toBeVisible({ timeout: 5_000 })
    await manualInput.fill(SEEDED_BARCODE)

    const useBtn = page.getByRole('button', { name: /use barcode/i })
    await useBtn.click()

    // Since the seeded item shares this barcode, the find-or-create flow
    // resolves to the existing item — no POST /nutrition-items fires.
    // The mini-form opens with the existing item.
    const logBtn = page.getByRole('button', { name: /^log$/i })
    await expect(logBtn).toBeVisible({ timeout: 10_000 })

    await logBtn.click()

    // The logged row appears with the seeded item's name.
    await expect(page.locator('section').filter({ hasText: /nutrition/i }).getByText(SEEDED_ITEM_NAME)).toBeVisible()

    // Mute unused-var warning in tools that read this comment.
    void browserName
  })
})
