import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserGoalRow from './UserGoalRow'

const baseGoal = {
  id: 5,
  name: 'Lose weight',
  priority: 'high' as const,
  current_status: 'active' as const,
  target_date: '2026-12-31T00:00:00.000Z',
  progress: 3,
  target: 10,
} as never

type Handlers = {
  onSetProgress: ReturnType<typeof vi.fn>
  onMarkComplete: ReturnType<typeof vi.fn>
  onToggleMilestone: ReturnType<typeof vi.fn>
  onAppendNote: ReturnType<typeof vi.fn>
  onOpenSettings: ReturnType<typeof vi.fn>
}

const makeHandlers = (): Handlers => ({
  onSetProgress: vi.fn(),
  onMarkComplete: vi.fn(),
  onToggleMilestone: vi.fn(),
  onAppendNote: vi.fn(),
  onOpenSettings: vi.fn(),
})

describe('UserGoalRow', () => {
  let h: Handlers
  beforeEach(() => {
    h = makeHandlers()
  })

  it('renders name, priority, status, and target date', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    expect(screen.getByText('Lose weight')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('by 2026-12-31')).toBeInTheDocument()
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
  })

  it('strikes through name and hides Done when isComplete', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={1} isComplete={true} {...h} />)
    expect(screen.getByText('Lose weight').className).toContain('line-through')
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
  })

  it('+ button calls onSetProgress with current + 1', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    expect(h.onSetProgress).toHaveBeenCalledWith(4)
  })

  it('- button clamps at 0', () => {
    const goal = { ...(baseGoal as object), progress: 0 } as never
    render(<UserGoalRow goal={goal} milestones={[]} progressPct={0} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    expect(h.onSetProgress).toHaveBeenCalledWith(0)
  })

  it('Done button calls onMarkComplete', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(h.onMarkComplete).toHaveBeenCalledTimes(1)
  })

  it('Settings cog calls onOpenSettings with the goal id', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(h.onOpenSettings).toHaveBeenCalledWith(5)
  })

  it('toggles milestones panel and shows empty state', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    expect(screen.getByRole('button', { name: 'Milestones (0)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    expect(screen.getByText('No milestones.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('No milestones.')).not.toBeInTheDocument()
  })

  it('milestone checkbox click calls onToggleMilestone with the milestone id', () => {
    const m = { id: 88, title: 'Halfway there', completed_at: null } as never
    render(<UserGoalRow goal={baseGoal} milestones={[m]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (1)' }))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(h.onToggleMilestone).toHaveBeenCalledWith(88)
  })

  it('completed milestone is checked and struck through', () => {
    const m = { id: 88, title: 'Halfway there', completed_at: '2026-06-01T00:00:00Z' } as never
    render(<UserGoalRow goal={baseGoal} milestones={[m]} progressPct={0.5} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (1)' }))
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(screen.getByText('Halfway there').className).toContain('line-through')
  })

  it('note Save calls onAppendNote with trimmed text and clears draft', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    const input = screen.getByPlaceholderText('Add note…') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  making progress  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onAppendNote).toHaveBeenCalledWith('making progress')
    expect(input.value).toBe('')
  })

  it('whitespace-only note does not call onAppendNote', () => {
    render(<UserGoalRow goal={baseGoal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    fireEvent.change(screen.getByPlaceholderText('Add note…'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(h.onAppendNote).not.toHaveBeenCalled()
  })

  it('returns null when goal.id is null', () => {
    const goal = { ...(baseGoal as object), id: null } as never
    const { container } = render(
      <UserGoalRow goal={goal} milestones={[]} progressPct={0} isComplete={false} {...h} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders fallback name when goal.name is missing', () => {
    const goal = { ...(baseGoal as object), name: undefined } as never
    render(<UserGoalRow goal={goal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    expect(screen.getByText('(unnamed)')).toBeInTheDocument()
  })

  it('renders goal.note inside the expanded panel', () => {
    const goal = { ...(baseGoal as object), note: 'feeling good' } as never
    render(<UserGoalRow goal={goal} milestones={[]} progressPct={0.3} isComplete={false} {...h} />)
    expect(screen.queryByText('feeling good')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Milestones (0)' }))
    expect(screen.getByText('feeling good')).toBeInTheDocument()
  })
})
