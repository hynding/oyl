import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Goal = {
  id: number | null
  name?: string
  category?: string
  target?: number
  priority?: string
  target_date?: string
  current_status?: string
  parent_user_goal?: number | { id: number }
  note?: string
}

const goalCtx: {
  goals: Goal[]
  settingsGoalId: number | null
  setSettingsGoalId: ReturnType<typeof vi.fn>
  updateGoal: ReturnType<typeof vi.fn>
  removeGoal: ReturnType<typeof vi.fn>
} = {
  goals: [],
  settingsGoalId: null,
  setSettingsGoalId: vi.fn(),
  updateGoal: vi.fn().mockResolvedValue(undefined),
  removeGoal: vi.fn().mockResolvedValue(undefined),
}

// Partial-mock so the real UserGoalSettingsSheet primitive is used while we
// override the context hook.
vi.mock('@/modules/user/goal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/goal')>()
  return { ...actual, useUserGoalContext: () => goalCtx }
})

import UserDailyGoalSettingsSheet from './UserDailyGoalSettingsSheet'

const baseGoal: Goal = {
  id: 5,
  name: 'Lose weight',
  category: 'health',
  target: 10,
  priority: 'high',
  target_date: '2026-12-31T00:00:00.000Z',
  current_status: 'active',
  parent_user_goal: 9,
  note: 'progress so far',
}

const parentGoal: Goal = { id: 9, name: 'Be healthy' }

describe('UserDailyGoalSettingsSheet', () => {
  beforeEach(() => {
    goalCtx.setSettingsGoalId.mockClear()
    goalCtx.updateGoal.mockClear()
    goalCtx.removeGoal.mockClear()
    goalCtx.goals = []
    goalCtx.settingsGoalId = null
  })

  it('renders nothing when settingsGoalId is null', () => {
    const { container } = render(<UserDailyGoalSettingsSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when goal is not found', () => {
    goalCtx.settingsGoalId = 999
    goalCtx.goals = [baseGoal]
    const { container } = render(<UserDailyGoalSettingsSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('populates form from goal (parent_user_goal as id)', () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal, parentGoal]
    render(<UserDailyGoalSettingsSheet />)
    expect((screen.getByPlaceholderText('Name') as HTMLInputElement).value).toBe('Lose weight')
    expect((screen.getByPlaceholderText('Category') as HTMLInputElement).value).toBe('health')
    expect((screen.getByPlaceholderText('Target') as HTMLInputElement).value).toBe('10')
    expect((screen.getByPlaceholderText('Note') as HTMLTextAreaElement).value).toBe('progress so far')
    // selects in DOM order: priority, status, parent_user_goal
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects.map(s => s.value)).toEqual(['high', 'active', '9'])
  })

  it('populates parent when parent_user_goal arrives as an object with id', () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [{ ...baseGoal, parent_user_goal: { id: 9 } }, parentGoal]
    render(<UserDailyGoalSettingsSheet />)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    expect(selects[2].value).toBe('9')
  })

  it('parent dropdown excludes the current goal', () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal, parentGoal]
    render(<UserDailyGoalSettingsSheet />)
    expect(screen.queryByRole('option', { name: 'Lose weight' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Be healthy' })).toBeInTheDocument()
  })

  it('Save calls updateGoal with the form patch and closes', async () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal, parentGoal]
    render(<UserDailyGoalSettingsSheet />)
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Lose 10 pounds' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(goalCtx.updateGoal).toHaveBeenCalledTimes(1))
    const [id, patch] = goalCtx.updateGoal.mock.calls[0]
    expect(id).toBe(5)
    expect(patch.name).toBe('Lose 10 pounds')
    expect(patch.category).toBe('health')
    expect(patch.target).toBe(10)
    expect(patch.priority).toBe('high')
    expect(patch.target_date).toBe('2026-12-31')
    expect(patch.current_status).toBe('active')
    expect(patch.parent_user_goal).toBe(9)
    expect(patch.note).toBe('progress so far')
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledWith(null)
  })

  it('omits parent_user_goal/category/target/target_date/note when cleared', async () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal, parentGoal]
    render(<UserDailyGoalSettingsSheet />)
    fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Target'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: '' } })
    const dateInput = screen.getByDisplayValue('2026-12-31') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[]
    fireEvent.change(selects[2], { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(goalCtx.updateGoal).toHaveBeenCalled())
    const [, patch] = goalCtx.updateGoal.mock.calls[0]
    expect(patch.category).toBeUndefined()
    expect(patch.target).toBeUndefined()
    expect(patch.target_date).toBeUndefined()
    expect(patch.note).toBeUndefined()
    expect(patch.parent_user_goal).toBeUndefined()
  })

  it('Delete calls removeGoal and closes', async () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal]
    render(<UserDailyGoalSettingsSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(goalCtx.removeGoal).toHaveBeenCalledWith(5))
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledWith(null)
  })

  it('Cancel button closes without saving', () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal]
    render(<UserDailyGoalSettingsSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(goalCtx.updateGoal).not.toHaveBeenCalled()
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledWith(null)
  })

  it('backdrop click closes; inner click does not', () => {
    goalCtx.settingsGoalId = 5
    goalCtx.goals = [baseGoal]
    const { container } = render(<UserDailyGoalSettingsSheet />)
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(goalCtx.setSettingsGoalId).toHaveBeenCalledTimes(1)

    goalCtx.setSettingsGoalId.mockClear()
    fireEvent.click(screen.getByPlaceholderText('Name'))
    expect(goalCtx.setSettingsGoalId).not.toHaveBeenCalled()
  })
})
