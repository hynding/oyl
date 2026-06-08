import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./UserActivityScheduleInput', () => ({
  default: ({ value, onChange }: { value: { rrule: string } | undefined; onChange: (v: { rrule: string } | undefined) => void }) => (
    <div>
      <span data-testid="schedule-value">{value?.rrule ?? ''}</span>
      <button type="button" onClick={() => onChange({ rrule: 'FREQ=WEEKLY' })}>set-schedule</button>
    </div>
  ),
}))

import UserActivitySettingsSheet from './UserActivitySettingsSheet'

const goals = [
  { id: 9, name: 'Read more' },
  { id: 12, name: 'Run more' },
] as never[]

const baseActivity = {
  id: 5,
  name: 'Running',
  type: 'habit' as const,
  current_status: 'active' as const,
  schedule: { rrule: 'FREQ=DAILY' },
  target_value: 30,
  target_unit: 'min',
  target_direction: 'min' as const,
  user_goal: 12,
} as never

describe('UserActivitySettingsSheet', () => {
  let onSave: ReturnType<typeof vi.fn<(...args: any[]) => any>>
  let onDelete: ReturnType<typeof vi.fn<(...args: any[]) => any>>
  let onClose: ReturnType<typeof vi.fn<(...args: any[]) => any>>

  beforeEach(() => {
    onSave = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    onDelete = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    onClose = vi.fn<(...args: any[]) => any>()
  })

  it('populates form from activity (user_goal as id)', () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('Running')
    expect((screen.getByPlaceholderText('Target') as HTMLInputElement).value).toBe('30')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('min')
    expect(screen.getByTestId('schedule-value').textContent).toBe('FREQ=DAILY')
    // DOM order: type, status, target-direction, goal
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.map(s => s.value)).toEqual(['habit', 'active', 'min', '12'])
  })

  it('populates user_goal when activity.user_goal is an object with id', () => {
    const a = { ...(baseActivity as object), user_goal: { id: 9 } } as never
    render(<UserActivitySettingsSheet activity={a} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects[3].value).toBe('9')
  })

  it('Save calls onSave with the form patch and onClose', async () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Jogging' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const patch = onSave.mock.calls[0][0]
    expect(patch.name).toBe('Jogging')
    expect(patch.type).toBe('habit')
    expect(patch.current_status).toBe('active')
    expect(patch.schedule).toEqual({ rrule: 'FREQ=DAILY' })
    expect(patch.target_value).toBe(30)
    expect(patch.target_unit).toBe('min')
    expect(patch.target_direction).toBe('min')
    expect(patch.user_goal).toBe(12)
    expect(onClose).toHaveBeenCalled()
  })

  it('omits target_direction and user_goal when those fields are cleared', async () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Target'), { target: { value: '' } })
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[3], { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const patch = onSave.mock.calls[0][0]
    expect(patch.target_value).toBeUndefined()
    expect(patch.target_direction).toBeUndefined()
    expect(patch.user_goal).toBeUndefined()
  })

  it('Delete calls onDelete then onClose', async () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalled()
  })

  it('Cancel button calls onClose without saving', () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('backdrop click closes; inner click does not', () => {
    const { container } = render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    const inner = screen.getByPlaceholderText('Name').parentElement!
    fireEvent.click(inner)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders one option per goal', () => {
    render(<UserActivitySettingsSheet activity={baseActivity} goals={goals} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    expect(screen.getByRole('option', { name: 'Read more' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Run more' })).toBeInTheDocument()
  })
})
