import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./UserDailyActivitiesList', () => ({
  default: () => <div data-testid="list" />,
}))
vi.mock('./UserDailyAddActivityForm', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="add-form"><button onClick={onClose}>x-add</button></div>
  ),
}))
vi.mock('./UserDailyLogActivityForm', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="log-form"><button onClick={onClose}>x-log</button></div>
  ),
}))
vi.mock('./UserDailyActivityLogSheet', () => ({
  default: () => <div data-testid="log-sheet" />,
}))
vi.mock('./UserDailyActivitySettingsSheet', () => ({
  default: () => <div data-testid="settings-sheet" />,
}))

import UserDailyActivities from './UserDailyActivities'

describe('UserDailyActivities', () => {
  it('mounts list and sheets; forms hidden by default', () => {
    render(<UserDailyActivities />)
    expect(screen.getByRole('heading', { name: 'Activities' })).toBeInTheDocument()
    expect(screen.getByTestId('list')).toBeInTheDocument()
    expect(screen.getByTestId('log-sheet')).toBeInTheDocument()
    expect(screen.getByTestId('settings-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('add-form')).not.toBeInTheDocument()
    expect(screen.queryByTestId('log-form')).not.toBeInTheDocument()
  })

  it('toggles the add-activity form', () => {
    render(<UserDailyActivities />)
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    expect(screen.getByTestId('add-form')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByTestId('add-form')).not.toBeInTheDocument()
  })

  it('toggles the log-activity form', () => {
    render(<UserDailyActivities />)
    fireEvent.click(screen.getByRole('button', { name: 'Log activity' }))
    expect(screen.getByTestId('log-form')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByTestId('log-form')).not.toBeInTheDocument()
  })

  it('closing the add-form via onClose hides it', () => {
    render(<UserDailyActivities />)
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    fireEvent.click(screen.getByRole('button', { name: 'x-add' }))
    expect(screen.queryByTestId('add-form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument()
  })
})
