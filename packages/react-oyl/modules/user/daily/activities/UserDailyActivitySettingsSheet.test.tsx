import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Activity = {
  id: number | null
  name?: string
  type?: string
  current_status?: string
  schedule?: { rrule: string }
  target_value?: number
  target_unit?: string
  target_direction?: string
  user_goal?: number | { id: number }
}

const activityCtx: {
  activities: Activity[]
  settingsActivityId: number | null
  setSettingsActivityId: ReturnType<typeof vi.fn>
  updateActivity: ReturnType<typeof vi.fn>
  removeActivity: ReturnType<typeof vi.fn>
} = {
  activities: [],
  settingsActivityId: null,
  setSettingsActivityId: vi.fn(),
  updateActivity: vi.fn().mockResolvedValue(undefined),
  removeActivity: vi.fn().mockResolvedValue(undefined),
}

const goalCtx = { goals: [{ id: 9, name: 'Read more' }, { id: 12, name: 'Run more' }] }

// Mock the activity barrel partially: override useUserActivityContext but keep
// the real UserActivitySettingsSheet primitive that the wrapper now composes.
vi.mock('@/modules/user/activity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/activity')>()
  return { ...actual, useUserActivityContext: () => activityCtx }
})
// Stub the schedule input at its source path so the real primitive's relative
// import resolves to the stub.
vi.mock('@/modules/user/activity/UserActivityScheduleInput', () => ({
  default: ({ value, onChange }: { value: { rrule: string } | undefined; onChange: (v: { rrule: string } | undefined) => void }) => (
    <div>
      <span data-testid="schedule-value">{value?.rrule ?? ''}</span>
      <button type="button" onClick={() => onChange({ rrule: 'FREQ=WEEKLY' })}>set-schedule</button>
    </div>
  ),
}))
vi.mock('@/modules/user/goal', () => ({ useUserGoalContext: () => goalCtx }))

import UserDailyActivitySettingsSheet from './UserDailyActivitySettingsSheet'

const baseActivity: Activity = {
  id: 5,
  name: 'Running',
  type: 'habit',
  current_status: 'active',
  schedule: { rrule: 'FREQ=DAILY' },
  target_value: 30,
  target_unit: 'min',
  target_direction: 'min',
  user_goal: 12,
}

describe('UserDailyActivitySettingsSheet', () => {
  beforeEach(() => {
    activityCtx.setSettingsActivityId.mockClear()
    activityCtx.updateActivity.mockClear()
    activityCtx.removeActivity.mockClear()
    activityCtx.activities = []
    activityCtx.settingsActivityId = null
  })

  it('renders nothing when settingsActivityId is null', () => {
    const { container } = render(<UserDailyActivitySettingsSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when activity is not found', () => {
    activityCtx.settingsActivityId = 999
    activityCtx.activities = [baseActivity]
    const { container } = render(<UserDailyActivitySettingsSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('populates form from activity (user_goal as id)', () => {
    activityCtx.settingsActivityId = 5
    activityCtx.activities = [baseActivity]
    render(<UserDailyActivitySettingsSheet />)
    expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('Running')
    expect((screen.getByPlaceholderText('Target') as HTMLInputElement).value).toBe('30')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('min')
    expect(screen.getByTestId('schedule-value').textContent).toBe('FREQ=DAILY')
    // selects in DOM order: type, status, target-direction, goal
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.map(s => s.value)).toEqual(['habit', 'active', 'min', '12'])
  })

  it('populates user_goal when it arrives as an object with id', () => {
    activityCtx.settingsActivityId = 5
    activityCtx.activities = [{ ...baseActivity, user_goal: { id: 9 } }]
    render(<UserDailyActivitySettingsSheet />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.some(s => s.value === '9')).toBe(true)
  })

  it('Save calls updateActivity with the form patch and closes', async () => {
    activityCtx.settingsActivityId = 5
    activityCtx.activities = [baseActivity]
    render(<UserDailyActivitySettingsSheet />)
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Jogging' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(activityCtx.updateActivity).toHaveBeenCalledTimes(1))
    const [id, patch] = activityCtx.updateActivity.mock.calls[0]
    expect(id).toBe(5)
    expect(patch.name).toBe('Jogging')
    expect(patch.type).toBe('habit')
    expect(patch.current_status).toBe('active')
    expect(patch.schedule).toEqual({ rrule: 'FREQ=DAILY' })
    expect(patch.target_value).toBe(30)
    expect(patch.target_unit).toBe('min')
    expect(patch.target_direction).toBe('min')
    expect(patch.user_goal).toBe(12)
    expect(activityCtx.setSettingsActivityId).toHaveBeenCalledWith(null)
  })

  it('Delete calls removeActivity and closes', async () => {
    activityCtx.settingsActivityId = 5
    activityCtx.activities = [baseActivity]
    render(<UserDailyActivitySettingsSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(activityCtx.removeActivity).toHaveBeenCalledWith(5))
    expect(activityCtx.setSettingsActivityId).toHaveBeenCalledWith(null)
  })

  it('Cancel button closes without saving', () => {
    activityCtx.settingsActivityId = 5
    activityCtx.activities = [baseActivity]
    render(<UserDailyActivitySettingsSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(activityCtx.updateActivity).not.toHaveBeenCalled()
    expect(activityCtx.setSettingsActivityId).toHaveBeenCalledWith(null)
  })
})
