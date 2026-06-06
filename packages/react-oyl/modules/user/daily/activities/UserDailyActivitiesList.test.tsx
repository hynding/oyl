import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '../useUserDailyOrchestrator'

const orchestrator: { activityRows: ActivityRow[] } = { activityRows: [] }
vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orchestrator,
}))
vi.mock('./UserDailyActivityRow', () => ({
  default: ({ row }: { row: ActivityRow }) => (
    <div data-testid="row" data-id={String(row.activity.id)}>{row.activity.name}</div>
  ),
}))

import UserDailyActivitiesList from './UserDailyActivitiesList'

const rowFor = (id: number, name: string): ActivityRow => ({
  activity: { id, name } as never,
  logs: [],
  isDone: false,
})

describe('UserDailyActivitiesList', () => {
  it('shows empty-state message when there are no rows', () => {
    orchestrator.activityRows = []
    render(<UserDailyActivitiesList />)
    expect(screen.getByText(/no activities scheduled/i)).toBeInTheDocument()
    expect(screen.queryByTestId('row')).not.toBeInTheDocument()
  })

  it('renders one row per activityRow', () => {
    orchestrator.activityRows = [rowFor(1, 'Running'), rowFor(2, 'Reading')]
    render(<UserDailyActivitiesList />)
    const rows = screen.getAllByTestId('row')
    expect(rows.map(r => r.getAttribute('data-id'))).toEqual(['1', '2'])
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Reading')).toBeInTheDocument()
  })
})
