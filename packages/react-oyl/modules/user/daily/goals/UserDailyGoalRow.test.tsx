import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoalRow } from '../useUserDailyOrchestrator'

const orch = {
  setProgress: vi.fn(),
  markGoalComplete: vi.fn(),
  appendGoalNote: vi.fn(),
  toggleMilestone: vi.fn(),
  openGoalSettings: vi.fn(),
}

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))

import UserDailyGoalRow from './UserDailyGoalRow'

const baseGoal = {
  id: 5,
  name: 'Lose weight',
  priority: 'high' as const,
  current_status: 'active' as const,
  target_date: '2026-12-31T00:00:00.000Z',
  progress: 3,
  target: 10,
}

const rowFor = (overrides: Partial<GoalRow> = {}): GoalRow => ({
  goal: baseGoal as never,
  milestones: [],
  progressPct: 0.3,
  isComplete: false,
  ...overrides,
})

describe('UserDailyGoalRow', () => {
  beforeEach(() => {
    orch.setProgress.mockClear()
    orch.markGoalComplete.mockClear()
    orch.appendGoalNote.mockClear()
    orch.toggleMilestone.mockClear()
    orch.openGoalSettings.mockClear()
  })

  it('renders name, priority, status, and target date', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    expect(screen.getByText('Lose weight')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('by 2026-12-31')).toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('strikes through the name when isComplete is true and hides Done button', () => {
    render(<UserDailyGoalRow row={rowFor({ isComplete: true })} />)
    expect(screen.getByText('Lose weight').className).toContain('line-through')
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  })

  it('+ button bumps setProgress by +1 from current progress', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(orch.setProgress).toHaveBeenCalledWith(5, 4)
  })

  it('- button decrements but clamps to 0', () => {
    render(<UserDailyGoalRow row={rowFor({ goal: { ...baseGoal, progress: 0 } as never })} />)
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    expect(orch.setProgress).toHaveBeenCalledWith(5, 0)
  })

  it('Done button calls markGoalComplete(id)', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(orch.markGoalComplete).toHaveBeenCalledWith(5)
  })

  it('Settings cog calls openGoalSettings(id)', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(orch.openGoalSettings).toHaveBeenCalledWith(5)
  })

  it('toggles the milestones panel and shows empty-state when none', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    expect(screen.getByRole('button', { name: 'Milestones (0)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    expect(screen.getByText('No milestones.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('No milestones.')).not.toBeInTheDocument()
  })

  it('milestone checkbox click calls toggleMilestone(id)', () => {
    const m = { id: 88, title: 'Halfway there', completed_at: null } as never
    render(<UserDailyGoalRow row={rowFor({ milestones: [m] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (1)' }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(orch.toggleMilestone).toHaveBeenCalledWith(88)
  })

  it('milestone with completed_at strikes through and is checked', () => {
    const m = { id: 88, title: 'Halfway there', completed_at: '2026-06-01T00:00:00Z' } as never
    render(<UserDailyGoalRow row={rowFor({ milestones: [m] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (1)' }))
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(screen.getByText('Halfway there').className).toContain('line-through')
  })

  it('note Save calls appendGoalNote and clears the draft', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    const input = screen.getByPlaceholderText('Add note…') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'making progress' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(orch.appendGoalNote).toHaveBeenCalledWith(5, 'making progress')
    expect(input.value).toBe('')
  })

  it('empty / whitespace-only note does not call appendGoalNote', () => {
    render(<UserDailyGoalRow row={rowFor()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    fireEvent.change(screen.getByPlaceholderText('Add note…'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(orch.appendGoalNote).not.toHaveBeenCalled()
  })

  it('returns null when goal.id is null', () => {
    const { container } = render(
      <UserDailyGoalRow row={rowFor({ goal: { ...baseGoal, id: null } as never })} />,
    )
    expect(container.firstChild).toBeNull()
  })
})
