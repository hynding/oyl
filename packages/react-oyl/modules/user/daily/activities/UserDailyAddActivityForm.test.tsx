import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const orch = { addActivity: vi.fn().mockResolvedValue(undefined) }
const goalCtx = { goals: [{ id: 42, name: 'Lose weight' }] as never[] }

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))
vi.mock('@/modules/user/goal', () => ({
  useUserGoalContext: () => goalCtx,
}))
// Mock the schedule input at its source path so it's stubbed both when imported
// via the activity barrel (here) and when imported relatively from inside the
// real UserActivityForm primitive.
vi.mock('@/modules/user/activity/UserActivityScheduleInput', () => ({
  default: ({ onChange }: { onChange: (v: { rrule: string } | undefined) => void }) => (
    <button type="button" onClick={() => onChange({ rrule: 'FREQ=DAILY' })}>set-schedule</button>
  ),
}))

import UserDailyAddActivityForm from './UserDailyAddActivityForm'

describe('UserDailyAddActivityForm', () => {
  beforeEach(() => {
    orch.addActivity.mockClear()
  })

  it('submits with form values and closes', async () => {
    const onClose = vi.fn()
    render(<UserDailyAddActivityForm onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('Activity name'), { target: { value: 'Stretch' } })
    fireEvent.change(screen.getByDisplayValue('Habit'), { target: { value: 'task' } })
    fireEvent.click(screen.getByRole('button', { name: 'set-schedule' }))
    fireEvent.change(screen.getByPlaceholderText('Target value'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: 'min' } })
    fireEvent.change(screen.getByDisplayValue('At least'), { target: { value: 'max' } })
    fireEvent.change(screen.getByDisplayValue('(no linked goal)'), { target: { value: '42' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))

    await vi.waitFor(() => expect(orch.addActivity).toHaveBeenCalledTimes(1))
    expect(orch.addActivity).toHaveBeenCalledWith({
      name: 'Stretch',
      type: 'task',
      schedule: { rrule: 'FREQ=DAILY' },
      current_status: 'active',
      target_value: 10,
      target_unit: 'min',
      target_direction: 'max',
      user_goal: 42,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit when name is empty (HTML required)', () => {
    const onClose = vi.fn()
    render(<UserDailyAddActivityForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    expect(orch.addActivity).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without submitting', () => {
    const onClose = vi.fn()
    render(<UserDailyAddActivityForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(orch.addActivity).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('omits target_direction and user_goal when not set', async () => {
    render(<UserDailyAddActivityForm onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Activity name'), { target: { value: 'Read' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    await vi.waitFor(() => expect(orch.addActivity).toHaveBeenCalled())
    const arg = orch.addActivity.mock.calls[0][0]
    expect(arg.target_value).toBeUndefined()
    expect(arg.target_direction).toBeUndefined()
    expect(arg.user_goal).toBeUndefined()
    expect(arg.target_unit).toBeUndefined()
  })
})
