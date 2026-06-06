import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalRow } from '../useUserDailyOrchestrator'

const orch: {
  goalRows: GoalRow[]
  addMilestone: ReturnType<typeof vi.fn>
} = {
  goalRows: [],
  addMilestone: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))

import UserDailyAddMilestoneForm from './UserDailyAddMilestoneForm'

const rowFor = (id: number, name: string): GoalRow => ({
  goal: { id, name } as never,
  milestones: [],
  progressPct: 0,
  isComplete: false,
})

describe('UserDailyAddMilestoneForm', () => {
  beforeEach(() => {
    orch.addMilestone.mockClear()
  })

  it('preselects the first goal option', () => {
    orch.goalRows = [rowFor(1, 'Lose weight'), rowFor(2, 'Read more')]
    render(<UserDailyAddMilestoneForm onClose={vi.fn()} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('1')
  })

  it('submits with selected goal and milestone fields', async () => {
    orch.goalRows = [rowFor(1, 'Lose weight'), rowFor(2, 'Read more')]
    const onClose = vi.fn()
    render(<UserDailyAddMilestoneForm onClose={onClose} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: 'Halfway book' } })
    const dateInput = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))

    await vi.waitFor(() => expect(orch.addMilestone).toHaveBeenCalledTimes(1))
    expect(orch.addMilestone).toHaveBeenCalledWith({
      user_goal: { id: 2, name: 'Read more' },
      title: 'Halfway book',
      target_date: '2026-08-01',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('omits target_date when blank', async () => {
    orch.goalRows = [rowFor(1, 'Lose weight')]
    render(<UserDailyAddMilestoneForm onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: 'Phase 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    await vi.waitFor(() => expect(orch.addMilestone).toHaveBeenCalled())
    const arg = orch.addMilestone.mock.calls[0][0]
    expect(arg.target_date).toBeUndefined()
  })

  it('does not submit when title is empty (HTML required)', () => {
    orch.goalRows = [rowFor(1, 'Lose weight')]
    render(<UserDailyAddMilestoneForm onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(orch.addMilestone).not.toHaveBeenCalled()
  })

  it('does not submit when goalRows is empty', () => {
    orch.goalRows = []
    render(<UserDailyAddMilestoneForm onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(orch.addMilestone).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without submitting', () => {
    orch.goalRows = [rowFor(1, 'Lose weight')]
    const onClose = vi.fn()
    render(<UserDailyAddMilestoneForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(orch.addMilestone).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
