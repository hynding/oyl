import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '../useUserDailyOrchestrator'

const orch = {
  toggleDone: vi.fn(),
  openActivitySettings: vi.fn(),
  addLog: vi.fn().mockResolvedValue(undefined),
  selectedDate: '2026-05-30',
}

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))
vi.mock('@oyl/all-of-oyl/modules', async (orig) => {
  const actual = await orig<typeof import('@oyl/all-of-oyl/modules')>()
  return { ...actual, describeSchedule: () => 'every day' }
})

import UserDailyActivityRow from './UserDailyActivityRow'

const baseActivity = {
  id: 7,
  name: 'Running',
  type: 'habit' as const,
  schedule: { rrule: 'FREQ=DAILY' },
}

const rowFor = (overrides: Partial<ActivityRow> = {}): ActivityRow => ({
  activity: baseActivity as never,
  logs: [],
  isDone: false,
  ...overrides,
})

describe('UserDailyActivityRow', () => {
  beforeEach(() => {
    orch.toggleDone.mockClear()
    orch.openActivitySettings.mockClear()
    orch.addLog.mockClear()
  })

  it('renders name, schedule, and type', () => {
    render(<UserDailyActivityRow row={rowFor()} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText(/every day/)).toBeInTheDocument()
    expect(screen.getByText(/habit/)).toBeInTheDocument()
  })

  it('checkbox reflects isDone and calls toggleDone(activity) on click', () => {
    render(<UserDailyActivityRow row={rowFor({ isDone: true })} />)
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(orch.toggleDone).toHaveBeenCalledWith(baseActivity)
  })

  it('renders progress bar when row.progress is provided', () => {
    render(
      <UserDailyActivityRow
        row={rowFor({ progress: { value: 2, target: 5, direction: 'min' } })}
      />,
    )
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument()
    expect(screen.getByText(/\(min\)/)).toBeInTheDocument()
  })

  it('Log button calls addLog with activity, selectedDate, and value 1', () => {
    render(<UserDailyActivityRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(orch.addLog).toHaveBeenCalledWith({
      user_activity: baseActivity,
      logged_at: '2026-05-30T00:00:00.000Z',
      value: 1,
    })
  })

  it('Settings (cog) button calls openActivitySettings(activity.id)', () => {
    render(<UserDailyActivityRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(orch.openActivitySettings).toHaveBeenCalledWith(7)
  })

  it('toggles expanded logs list', () => {
    const log = { id: 10, logged_at: '2026-05-30T14:30:00Z', value: 3, unit: 'km' } as never
    render(<UserDailyActivityRow row={rowFor({ logs: [log] })} />)
    expect(screen.getByRole('button', { name: 'Logs (1)' })).toBeInTheDocument()
    expect(screen.queryByText(/14:30/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Logs (1)' }))
    expect(screen.getByText(/14:30/)).toBeInTheDocument()
    expect(screen.getByText(/3 km/)).toBeInTheDocument()
  })

  it('returns null when activity.id is null', () => {
    const { container } = render(
      <UserDailyActivityRow row={rowFor({ activity: { ...baseActivity, id: null } as never })} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
