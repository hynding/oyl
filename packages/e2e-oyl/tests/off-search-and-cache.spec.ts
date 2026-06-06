import { test, expect } from '@playwright/test'
import { seed } from './fixtures/seed'
import { authenticateInBrowser } from './fixtures/auth-bootstrap'

test.describe('off-search-and-cache', () => {
  test('OFF call happens once per query — second click hits the Strapi cache', async ({ page }) => {
    const ctx = await seed()
    await authenticateInBrowser(page, ctx)

    let offSearchCount = 0
    let offProductCount = 0

    // Stub the OFF search endpoint with one fake product.
    await page.route(/openfoodfacts\.(net|org)\/api\/v3\/search/, async route => {
      offSearchCount++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          products: [{
            code: '999000111222',
            product_name: 'E2E Fake Product',
            brands: 'E2E Brand',
            image_front_small_url: '',
            nutriscore_grade: 'b',
            nova_group: 3,
          }],
          count: 1, page: 1, page_count: 1, page_size: 1,
        }),
      })
    })

    // Stub the OFF product endpoint with a full product for the selected barcode.
    await page.route(/openfoodfacts\.(net|org)\/api\/v3\/product\//, async route => {
      offProductCount++
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          status: 1,
          product: {
            code: '999000111222',
            product_name: 'E2E Fake Product',
            brands: 'E2E Brand',
            image_url: 'https://x/full.jpg',
            image_front_small_url: 'https://x/s.jpg',
            image_front_url: 'https://x/front.jpg',
            serving_quantity: 100,
            quantity: '100 g',
            nutriments: {
              'energy-kcal_100g': 200,
              proteins_100g: 10,
              carbohydrates_100g: 20,
              fat_100g: 5,
            },
            nutriscore_grade: 'b',
            nutriscore_score: 1,
            nova_group: 3,
            allergens_tags: [],
          },
        }),
      })
    })

    await page.goto('/daily')

    // First query: triggers an OFF search call.
    const search = page.getByPlaceholder(/search foods/i)
    await search.fill('fake e2e product')
    const sentinel = page.getByText(/Search OpenFoodFacts for/i)
    await expect(sentinel).toBeVisible({ timeout: 5_000 })
    await sentinel.click()

    await expect(page.getByText('E2E Fake Product')).toBeVisible({ timeout: 5_000 })
    expect(offSearchCount).toBe(1)

    // Reset and run the same query again.
    await search.fill('')
    await search.fill('fake e2e product')
    await expect(sentinel).toBeVisible({ timeout: 5_000 })
    await sentinel.click()
    await expect(page.getByText('E2E Fake Product')).toBeVisible({ timeout: 5_000 })

    // Cache hit — no second OFF search.
    expect(offSearchCount).toBe(1)
  })
})
