import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

const store: IntegrationStore = emptyStore()
const server = setupServer(...buildHandlers(store))

const spies = {
  'user-nutritions': { save: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) },
} as const

vi.mock('@/modules/data', () => ({
  useData: (path: string) => ({
    find: () => [],
    get: () => undefined,
    save: path === 'user-nutritions' ? spies['user-nutritions'].save : vi.fn().mockResolvedValue(undefined),
    update: path === 'user-nutritions' ? spies['user-nutritions'].update : vi.fn().mockResolvedValue(undefined),
    remove: path === 'user-nutritions' ? spies['user-nutritions'].remove : vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    syncState: { pendingCount: 0, online: true },
  }),
  useSyncState: () => ({ pendingCount: 0, online: true }),
  syncEngine: { setOnline: vi.fn(), setUser: vi.fn(), refreshAll: vi.fn() },
  setSyncAuthTokenGetter: vi.fn(),
  SYNCED_PATHS: ['user-dailies', 'user-activities', 'user-activity-logs', 'user-goals', 'user-goal-milestones', 'user-nutritions'],
}))

vi.mock('@/modules/auth/useAuth', () => ({
  default: () => ({
    isAuthenticated: true, apiToken: 'test-token',
    user: { id: 1, username: 'tester', email: 't@x' },
    updateApiToken: () => {}, updateUser: () => {},
  }),
}))

vi.mock('@/modules/user/profile/useUserProfile', () => ({
  useUserProfile: () => ({
    timezone: 'UTC', documentId: 'p1', loading: false, error: null,
    setTimezone: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers(...buildHandlers(store)))
beforeEach(() => {
  store.events.length = 0
  store.userNutritions.length = 0
  store.nutritionItems.length = 0
  store.nutritionSearches.length = 0
  spies['user-nutritions'].save.mockClear()
})

describe('integration: add-from-off', () => {
  it('OFF cache miss → fetch product → create nutrition-item → log it', async () => {
    // Canned OFF responses for the queries this test will fire.
    store.offSearch = () => ({
      products: [
        { code: '5060337502222', product_name: 'Oat Drink', brands: 'Oatly', image_front_small_url: 'https://x/s.jpg', nutriscore_grade: 'b', nova_group: 4 },
      ],
      count: 1, page: 1, page_count: 1, page_size: 1,
    })
    store.offBarcode = (code) => ({
      status: 1,
      product: {
        code,
        product_name: 'Oat Drink',
        brands: 'Oatly',
        image_url: 'https://x/full.jpg',
        image_front_small_url: 'https://x/s.jpg',
        image_front_url: 'https://x/front.jpg',
        serving_quantity: 240,
        quantity: '1 L',
        nutriments: { 'energy-kcal_100ml': 47, proteins_100ml: 1, carbohydrates_100ml: 6.6, fat_100ml: 1.5 },
        nutriscore_grade: 'b', nutriscore_score: 1, nova_group: 4,
        allergens_tags: [],
      },
    })

    const { default: UserDailyNutrition } = await import('../UserDailyNutrition')
    const { default: UserDailyDataProviders } = await import('../../UserDailyDataProviders')

    render(
      <UserDailyDataProviders>
        <UserDailyNutrition />
      </UserDailyDataProviders>,
    )

    // Type a query that has no local matches.
    const input = await screen.findByPlaceholderText(/search foods/i)
    fireEvent.change(input, { target: { value: 'fresh' } })

    // The "Search OpenFoodFacts" sentinel should appear after debounce.
    const sentinel = await screen.findByText(/Search OpenFoodFacts for/i, {}, { timeout: 2000 })
    fireEvent.click(sentinel)

    // OFF returned 1 product; the OFF result row should render.
    const offRow = await screen.findByText('Oat Drink')
    fireEvent.click(offRow)

    // Find-or-create flow then opens the mini-form (Log button visible).
    const logBtn = await screen.findByRole('button', { name: /^log$/i }, { timeout: 2000 })
    fireEvent.click(logBtn)

    await waitFor(() => {
      expect(spies['user-nutritions'].save).toHaveBeenCalledOnce()
    })

    // Verify the expected sequence of network events.
    expect(store.events).toEqual(expect.arrayContaining([
      expect.stringMatching(/^GET \/nutrition-searches$/),
      expect.stringMatching(/^OFF search /),
      expect.stringMatching(/^POST \/nutrition-searches /),
      expect.stringMatching(/^GET \/nutrition-items barcode=5060337502222$/),
      expect.stringMatching(/^OFF product 5060337502222$/),
      expect.stringMatching(/^POST \/nutrition-items /),
    ]))
  }, 10_000)
})
