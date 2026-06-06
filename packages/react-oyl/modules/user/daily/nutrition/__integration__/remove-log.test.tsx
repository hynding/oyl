import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupServer } from 'msw/node'
import { buildHandlers, emptyStore, type IntegrationStore } from './msw-handlers'

const store: IntegrationStore = emptyStore()
const server = setupServer(...buildHandlers(store))

const seededItem = {
  id: 1, documentId: 'item-oat', name: 'Oatmeal', serving_unit: 'g', source: 'user',
  serving_size: 100, calories_per_100: 380, brand: null,
}
const today = new Date()
const seededLog = {
  id: 77, documentId: 'log-77',
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
    timezone: 'UTC', documentId: 'p1', loading: false, error: null,
    setTimezone: vi.fn().mockResolvedValue(undefined),
  }),
}))

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers(...buildHandlers(store)))
beforeEach(() => {
  store.events.length = 0
  spies.update.mockClear()
})

describe('integration: remove-log', () => {
  it('kebab → Remove → Confirm soft-deletes via update with deleted_at', async () => {
    const { default: UserDailyNutrition } = await import('../UserDailyNutrition')
    const { default: UserDailyDataProviders } = await import('../../UserDailyDataProviders')

    render(
      <UserDailyDataProviders>
        <UserDailyNutrition />
      </UserDailyDataProviders>,
    )

    // Open the kebab menu on the row.
    const more = await screen.findByRole('button', { name: /more/i })
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: /remove/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(spies.update).toHaveBeenCalledOnce())
    const [id, patch] = spies.update.mock.calls[0]
    expect(id).toBe(77)
    expect(patch).toMatchObject({ deleted_at: expect.any(String) })
    // Make sure it's an ISO timestamp.
    expect(() => new Date(patch.deleted_at).toISOString()).not.toThrow()
  })
})
