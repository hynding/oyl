import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./UserDailyGoalsList', () => ({
  default: () => <div data-testid="list" />,
}))
vi.mock('./UserDailyAddGoalForm', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-goal-form"><button onClick={onClose}>x-goal</button></div>
  ),
}))
vi.mock('./UserDailyAddMilestoneForm', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-milestone-form"><button onClick={onClose}>x-milestone</button></div>
  ),
}))
vi.mock('./UserDailyGoalSettingsSheet', () => ({
  default: () => <div data-testid="settings-sheet" />,
}))

import UserDailyGoals from './UserDailyGoals'

describe('UserDailyGoals', () => {
  it('mounts list and settings sheet; forms hidden by default', () => {
    render(<UserDailyGoals />)
    expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument()
    expect(screen.getByTestId('list')).toBeInTheDocument()
    expect(screen.getByTestId('settings-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('add-goal-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-milestone-form')).not.toBeInTheDocument()
  })

  it('toggles the add-goal form', () => {
    render(<UserDailyGoals />)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(screen.getByTestId('add-goal-form')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByTestId('add-goal-form')).not.toBeInTheDocument()
  })

  it('toggles the add-milestone form', () => {
    render(<UserDailyGoals />)
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(screen.getByTestId('add-milestone-form')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByTestId('add-milestone-form')).not.toBeInTheDocument()
  })

  it('closing the add-goal form via onClose hides it', () => {
    render(<UserDailyGoals />)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    fireEvent.click(screen.getByRole('button', { name: 'x-goal' }))
    expect(screen.queryByTestId('add-goal-form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add goal' })).toBeInTheDocument()
  })
})
