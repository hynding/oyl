import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

const store: IntegrationStore = emptyStore()
const server = setupServer(...buildHandlers(store))

vi.mock('@/modules/data', () => ({
  useData: () => ({
    find: () => [],
    get: () => undefined,
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
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
})

describe('integration: add-from-off cache hit', () => {
  it('sentinel click reads from nutrition-search cache; no OFF call fires', async () => {
    // Pre-seed nutrition-search cache so findSearch hits.
    store.nutritionSearches.push({
      id: 1, documentId: 'ns-1',
      query: 'fresh',
      results: [
        { code: '111', product_name: 'Cached Yogurt', brands: 'Cached Brand' },
      ],
    })

    // No OFF search handler intentionally — any OFF call would surface as a 200 with default empty.
    // But to make the assertion robust, we deliberately fail the test if OFF fires.
    const offFired = vi.fn()
    store.offSearch = () => { offFired(); return { products: [], count: 0, page: 1, page_count: 0, page_size: 0 } }

    const { default: UserDailyNutrition } = await import('../UserDailyNutrition')
    const { default: UserDailyDataProviders } = await import('../../UserDailyDataProviders')

    render(
      <UserDailyDataProviders>
        <UserDailyNutrition />
      </UserDailyDataProviders>,
    )

    const input = await screen.findByPlaceholderText(/search foods/i)
    fireEvent.change(input, { target: { value: 'fresh' } })

    const sentinel = await screen.findByText(/Search OpenFoodFacts for/i, {}, { timeout: 2000 })
    fireEvent.click(sentinel)

    // The cached row should appear.
    await waitFor(() => {
      expect(screen.getByText('Cached Yogurt')).toBeInTheDocument()
    })

    expect(offFired).not.toHaveBeenCalled()
    // We should have seen the cache read, but NOT an OFF search nor a cache write.
    expect(store.events).toEqual(expect.arrayContaining([
      expect.stringMatching(/^GET \/nutrition-searches$/),
    ]))
    expect(store.events.some(e => e.startsWith('OFF search'))).toBe(false)
    expect(store.events.some(e => e.startsWith('POST /nutrition-searches'))).toBe(false)
  })
})
