import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

const store: IntegrationStore = emptyStore()
const server = setupServer(...buildHandlers(store))

// Recent log + its linked nutrition item — used by the orchestrator's
// recentNutritionItems derivation to produce a clickable chip.
const seededItem = {
  id: 1, documentId: 'item-oat', name: 'Oatmeal', serving_unit: 'g', source: 'user',
  serving_size: 100, calories_per_100: 380, brand: null,
}
const seededLog = {
  id: 10, documentId: 'log-1',
  date: '2026-05-01T08:00:00.000Z',
  servings: 1, name: 'Oatmeal', user: 1,
  nutrition_item: seededItem,
  calories: 380, protein: null, carbs: null, fat: null,
  deleted_at: null,
}

// Shared spies — one per path — so tests can assert directly on mutations.
const spies = {
  'user-nutritions': { save: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) },
  default: { save: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) },
} as const

vi.mock('@/modules/data', () => {
  return {
    useData: (path: string) => {
      const path_spies = (spies as Record<string, typeof spies['default']>)[path] ?? spies.default
      return {
        find: () => {
          if (path === 'user-nutritions') return [seededLog]
          return []
        },
        get: () => undefined,
        save: path_spies.save,
        update: path_spies.update,
        remove: path_spies.remove,
        refresh: vi.fn().mockResolvedValue(undefined),
        syncState: { pendingCount: 0, online: true },
      }
    },
    useSyncState: () => ({ pendingCount: 0, online: true }),
    syncEngine: { setOnline: vi.fn(), setUser: vi.fn(), refreshAll: vi.fn() },
    setSyncAuthTokenGetter: vi.fn(),
    SYNCED_PATHS: ['user-dailies', 'user-activities', 'user-activity-logs', 'user-goals', 'user-goal-milestones', 'user-nutritions'],
  }
})

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
afterEach(() => {
  server.resetHandlers(...buildHandlers(store))
})
beforeEach(() => {
  store.events.length = 0
  store.userNutritions.length = 0
  store.nutritionItems.length = 0
  store.nutritionSearches.length = 0
  spies['user-nutritions'].save.mockClear()
  spies['user-nutritions'].update.mockClear()
  spies['user-nutritions'].remove.mockClear()
})

describe('integration: add-from-recent', () => {
  it('clicking a recent chip then submitting the mini-form POSTs a new user-nutrition', async () => {
    const { default: UserDailyNutrition } = await import('../UserDailyNutrition')
    const { default: UserDailyDataProviders } = await import('../../UserDailyDataProviders')

    render(
      <UserDailyDataProviders>
        <UserDailyNutrition />
      </UserDailyDataProviders>,
    )

    // The recent chip should appear once recentNutritionItems derives the seed.
    const chip = await screen.findByText('Oatmeal')
    fireEvent.click(chip)

    // Mini-form should render; servings defaults to 1, valid → click Log.
    const logBtn = await screen.findByRole('button', { name: /^log$/i })
    fireEvent.click(logBtn)

    // After submit, the mini-form closes (picked → null) — the Log button disappears.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^log$/i })).toBeNull()
    })

    // The orchestrator's addNutritionLog called useUserNutritionContext.addNutrition,
    // which delegated to data.save with the snapshot fields.
    expect(spies['user-nutritions'].save).toHaveBeenCalledOnce()
    const payload = spies['user-nutritions'].save.mock.calls[0][0]
    expect(payload).toMatchObject({
      nutrition_item: 'item-oat',
      servings: 1,
      name: 'Oatmeal',
      calories: 380,
    })
    expect(payload.date).toMatch(/^2026-/)
  })
})
