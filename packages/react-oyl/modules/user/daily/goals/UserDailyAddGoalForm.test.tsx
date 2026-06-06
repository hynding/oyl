import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const orch = { addGoal: vi.fn().mockResolvedValue(undefined) }

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))

import UserDailyAddGoalForm from './UserDailyAddGoalForm'

describe('UserDailyAddGoalForm', () => {
  beforeEach(() => {
    orch.addGoal.mockClear()
  })

  it('submits with form values and closes', async () => {
    const onClose = vi.fn()
    render(<UserDailyAddGoalForm onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('Goal name'), { target: { value: 'Run 5K' } })
    fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: 'fitness' } })
    fireEvent.change(screen.getByDisplayValue('Medium'), { target: { value: 'high' } })
    fireEvent.change(screen.getByPlaceholderText('Target value'), { target: { value: '5' } })
    const dateInput = document.getElementById('goal-target-date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    await vi.waitFor(() => expect(orch.addGoal).toHaveBeenCalledTimes(1))
    expect(orch.addGoal).toHaveBeenCalledWith({
      name: 'Run 5K',
      category: 'fitness',
      target: 5,
      target_date: '2026-12-31',
      priority: 'high',
      current_status: 'active',
      progress: 0,
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not submit when name is empty (HTML required)', () => {
    const onClose = vi.fn()
    render(<UserDailyAddGoalForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(orch.addGoal).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without submitting', () => {
    const onClose = vi.fn()
    render(<UserDailyAddGoalForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(orch.addGoal).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('omits category/target/target_date when not set; defaults priority to medium', async () => {
    render(<UserDailyAddGoalForm onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Goal name'), { target: { value: 'Read more' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    await vi.waitFor(() => expect(orch.addGoal).toHaveBeenCalled())
    const arg = orch.addGoal.mock.calls[0][0]
    expect(arg.category).toBeUndefined()
    expect(arg.target).toBeUndefined()
    expect(arg.target_date).toBeUndefined()
    expect(arg.priority).toBe('medium')
    expect(arg.current_status).toBe('active')
    expect(arg.progress).toBe(0)
  })
})
