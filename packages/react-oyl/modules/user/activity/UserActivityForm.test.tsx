import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./UserActivityScheduleInput', () => ({
  default: ({ value, onChange }: { value: { rrule: string } | undefined; onChange: (v: { rrule: string } | undefined) => void }) => (
    <div>
      <span data-testid="schedule-value">{value?.rrule ?? ''}</span>
      <button type="button" onClick={() => onChange({ rrule: 'FREQ=DAILY' })}>set-schedule</button>
    </div>
  ),
}))

import UserActivityForm from './UserActivityForm'

const goals = [
  { id: 1, name: 'Read more' },
  { id: 2, name: 'Run more' },
] as never[]

describe('UserActivityForm', () => {
  let onSubmit: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    onCancel = vi.fn()
  })

  it('submits with shaped values including current_status defaulting to active', async () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Activity name'), { target: { value: 'Stretch' } })
    fireEvent.change(screen.getByDisplayValue('Habit'), { target: { value: 'task' } })
    fireEvent.click(screen.getByRole('button', { name: 'set-schedule' }))
    fireEvent.change(screen.getByPlaceholderText('Target value'), { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: 'min' } })
    fireEvent.change(screen.getByDisplayValue('At least'), { target: { value: 'max' } })
    fireEvent.change(screen.getByDisplayValue('(no linked goal)'), { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Stretch',
      type: 'task',
      schedule: { rrule: 'FREQ=DAILY' },
      current_status: 'active',
      target_value: 10,
      target_unit: 'min',
      target_direction: 'max',
      user_goal: 2,
    })
  })

  it('renders the provided submitLabel', () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} submitLabel="Save changes" />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('populates fields from initialValues including user_goal -> string', () => {
    render(
      <UserActivityForm
        goals={goals}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialValues={{
          name: 'Reading',
          type: 'habit',
          schedule: { rrule: 'FREQ=DAILY' },
          target_value: 30,
          target_unit: 'min',
          target_direction: 'min',
          user_goal: 1,
          current_status: 'paused',
        }}
      />,
    )
    expect((screen.getByPlaceholderText('Activity name') as HTMLInputElement).value).toBe('Reading')
    expect((screen.getByPlaceholderText('Target value') as HTMLInputElement).value).toBe('30')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('min')
    expect(screen.getByTestId('schedule-value').textContent).toBe('FREQ=DAILY')
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    // DOM order: type, goal, target-direction
    expect(selects.map(s => s.value)).toEqual(['habit', '1', 'min'])
  })

  it('preserves current_status from initialValues on submit (edit semantics)', async () => {
    render(
      <UserActivityForm
        goals={goals}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialValues={{ name: 'Reading', current_status: 'archived' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].current_status).toBe('archived')
  })

  it('does not submit when name is empty (HTML required)', () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('omits target_direction and user_goal when target_value and goal are unset', async () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Activity name'), { target: { value: 'Walk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.target_value).toBeUndefined()
    expect(arg.target_direction).toBeUndefined()
    expect(arg.user_goal).toBeUndefined()
    expect(arg.target_unit).toBeUndefined()
  })

  it('cancel calls onCancel without submitting', () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders one option per goal', () => {
    render(<UserActivityForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    expect(screen.getByRole('option', { name: 'Read more' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Run more' })).toBeInTheDocument()
  })
})
