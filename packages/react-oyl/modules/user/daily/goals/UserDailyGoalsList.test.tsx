import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GoalRow } from '../useUserDailyOrchestrator'

const orchestrator: { goalRows: GoalRow[] } = { goalRows: [] }
vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orchestrator,
}))
vi.mock('./UserDailyGoalRow', () => ({
  default: ({ row }: { row: GoalRow }) => (
    <div data-testid="row" data-id={String(row.goal.id)}>{row.goal.name}</div>
  ),
}))

import UserDailyGoalsList from './UserDailyGoalsList'

const rowFor = (id: number, name: string): GoalRow => ({
  goal: { id, name } as never,
  milestones: [],
  progressPct: 0,
  isComplete: false,
})

describe('UserDailyGoalsList', () => {
  it('shows empty-state message when there are no rows', () => {
    orchestrator.goalRows = []
    render(<UserDailyGoalsList />)
    expect(screen.getByText(/no goals for this date/i)).toBeInTheDocument()
    expect(screen.queryByTestId('row')).not.toBeInTheDocument()
  })

  it('renders one row per goalRow', () => {
    orchestrator.goalRows = [rowFor(1, 'Lose weight'), rowFor(2, 'Read more')]
    render(<UserDailyGoalsList />)
    const rows = screen.getAllByTestId('row')
    expect(rows.map(r => r.getAttribute('data-id'))).toEqual(['1', '2'])
    expect(screen.getByText('Lose weight')).toBeInTheDocument()
    expect(screen.getByText('Read more')).toBeInTheDocument()
  })
})
