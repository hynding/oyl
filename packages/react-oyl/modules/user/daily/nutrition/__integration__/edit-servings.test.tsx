import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

const store: IntegrationStore = emptyStore()
const server = setupServer(...buildHandlers(store))

const seededItem = {
  id: 1, documentId: 'item-oat', name: 'Oatmeal', serving_unit: 'g', source: 'user',
  serving_size: 100, calories_per_100: 380, brand: null,
}
// Use the runner's local timezone so filterNutritionsForDate(log.date, tz) agrees
// with UserDailyProvider's local-date selectedDate. (Mocking tz='UTC' here used
// to "work" only because the Provider previously also bucketed by UTC.)
const localTz = vi.hoisted(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
const today = new Date()
const seededLog = {
  id: 99, documentId: 'log-99',
  date: today.toISOString(),
  servings: 1, name: 'Oatmeal', user: 1,
  nutrition_item: seededItem,
  calories: 380, protein: null, carbs: null, fat: null,
  deleted_at: null,
}

const spies = {
  update: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/modules/data', () => ({
  useData: (path: string) => ({
    find: () => (path === 'user-nutritions' ? [seededLog] : []),
    get: () => undefined,
    save: vi.fn().mockResolvedValue(undefined),
    update: path === 'user-nutritions' ? spies.update : vi.fn().mockResolvedValue(undefined),
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
    timezone: localTz, documentId: 'p1', loading: false, error: null,
    setTimezone: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers(...buildHandlers(store)))
beforeEach(() => {
  store.events.length = 0
  spies.update.mockClear()
})

describe('integration: edit-servings', () => {
  it('typing a new servings value triggers a single debounced update PUT', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const { default: UserDailyNutrition } = await import('../UserDailyNutrition')
    const { default: UserDailyDataProviders } = await import('../../UserDailyDataProviders')

    render(
      <UserDailyDataProviders>
        <UserDailyNutrition />
      </UserDailyDataProviders>,
    )

    const servingsInput = await screen.findByLabelText(/servings/i)
    fireEvent.change(servingsInput, { target: { value: '2.5' } })
    expect(spies.update).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(400) })

    expect(spies.update).toHaveBeenCalledOnce()
    expect(spies.update.mock.calls[0]).toEqual([99, { servings: 2.5 }])

    vi.useRealTimers()
  })
})
