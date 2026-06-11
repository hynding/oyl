import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SyncState } from '@/modules/data'

let state: SyncState = { online: true, pendingCount: 0, lastSyncedAtByPath: {} }

vi.mock('@/modules/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/data')>()
  return { ...actual, useSyncState: () => state }
})

import UserDailySyncIndicator from './UserDailySyncIndicator'

describe('UserDailySyncIndicator', () => {
  it('shows "Synced" when online with no pending work or errors', () => {
    state = { online: true, pendingCount: 0, lastSyncedAtByPath: {} }
    render(<UserDailySyncIndicator />)
    expect(screen.getByText(/^Synced/)).toBeInTheDocument()
  })

  it('shows the lastError message when a save has failed', () => {
    state = {
      online: true,
      pendingCount: 0,
      lastSyncedAtByPath: {},
      lastError: {
        op: 'create',
        path: 'user-goals',
        message: 'Failed to fetch',
        at: '2026-06-07T00:00:00.000Z',
      },
    }
    render(<UserDailySyncIndicator />)
    expect(screen.getByText(/Save failed/i)).toBeInTheDocument()
    expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument()
  })
})
