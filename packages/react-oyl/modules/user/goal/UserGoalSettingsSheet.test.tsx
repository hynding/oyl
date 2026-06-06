import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserGoalSettingsSheet from './UserGoalSettingsSheet'

const baseGoal = {
  id: 5,
  name: 'Lose weight',
  category: 'health',
  target: 10,
  priority: 'high' as const,
  target_date: '2026-12-31T00:00:00.000Z',
  current_status: 'active' as const,
  parent_user_goal: 9,
  note: 'progress so far',
} as never

const parentGoal = { id: 9, name: 'Be healthy' } as never
const otherGoal = { id: 12, name: 'Climb a mountain' } as never

describe('UserGoalSettingsSheet', () => {
  let onSave: ReturnType<typeof vi.fn>
  let onDelete: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined)
    onDelete = vi.fn().mockResolvedValue(undefined)
    onClose = vi.fn()
  })

  it('populates form from goal (parent_user_goal as id)', () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal, parentGoal, otherGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('Lose weight')
    expect((screen.getByPlaceholderText('Category') as HTMLInputElement).value).toBe('health')
    expect((screen.getByPlaceholderText('Target') as HTMLInputElement).value).toBe('10')
    expect((screen.getByPlaceholderText('Note') as HTMLTextAreaElement).value).toBe('progress so far')
    // DOM order: priority, status, parent
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.map(s => s.value)).toEqual(['high', 'active', '9'])
  })

  it('populates parent when parent_user_goal arrives as an object with id', () => {
    const g = { ...(baseGoal as object), parent_user_goal: { id: 9 } } as never
    render(
      <UserGoalSettingsSheet
        goal={g}
        goals={[g, parentGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects[2].value).toBe('9')
  })

  it('parent dropdown excludes the current goal', () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal, parentGoal, otherGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    expect(screen.queryByRole('option', { name: 'Lose weight' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Be healthy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Climb a mountain' })).toBeInTheDocument()
  })

  it('Save calls onSave with the form patch and onClose', async () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal, parentGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Lose 10 pounds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const patch = onSave.mock.calls[0][0]
    expect(patch.name).toBe('Lose 10 pounds')
    expect(patch.category).toBe('health')
    expect(patch.target).toBe(10)
    expect(patch.priority).toBe('high')
    expect(patch.target_date).toBe('2026-12-31')
    expect(patch.current_status).toBe('active')
    expect(patch.parent_user_goal).toBe(9)
    expect(patch.note).toBe('progress so far')
    expect(onClose).toHaveBeenCalled()
  })

  it('omits category/target/target_date/parent_user_goal/note when cleared', async () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal, parentGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Target'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: '' } })
    const dateInput = screen.getByDisplayValue('2026-12-31') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[2], { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const patch = onSave.mock.calls[0][0]
    expect(patch.category).toBeUndefined()
    expect(patch.target).toBeUndefined()
    expect(patch.target_date).toBeUndefined()
    expect(patch.note).toBeUndefined()
    expect(patch.parent_user_goal).toBeUndefined()
  })

  it('Delete calls onDelete then onClose', async () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalled()
  })

  it('Cancel button calls onClose without saving', () => {
    render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('backdrop click closes; inner click does not', () => {
    const { container } = render(
      <UserGoalSettingsSheet
        goal={baseGoal}
        goals={[baseGoal]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    )
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(screen.getByPlaceholderText('Name'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
