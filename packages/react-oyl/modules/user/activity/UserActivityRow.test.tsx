import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@oyl/all-of-oyl/modules', async (orig) => {
  const actual = await orig<typeof import('@oyl/all-of-oyl/modules')>()
  return { ...actual, describeSchedule: () => 'every day' }
})

import UserActivityRow from './UserActivityRow'

const baseActivity = {
  id: 7,
  name: 'Running',
  type: 'habit' as const,
  schedule: { rrule: 'FREQ=DAILY' },
} as never

describe('UserActivityRow', () => {
  let onOpenSettings: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onOpenSettings = vi.fn()
  })

  it('renders name, schedule, and type', () => {
    render(<UserActivityRow activity={baseActivity} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText(/every day/)).toBeInTheDocument()
    expect(screen.getByText(/habit/)).toBeInTheDocument()
  })

  it('renders fallback name when activity.name is missing', () => {
    const a = { ...(baseActivity as object), name: undefined } as never
    render(<UserActivityRow activity={a} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText('(unnamed)')).toBeInTheDocument()
  })

  it('renders progress bar with value/target/direction when provided', () => {
    render(
      <UserActivityRow
        activity={baseActivity}
        onOpenSettings={onOpenSettings}
        progress={{ value: 2, target: 5, direction: 'min' }}
      />,
    )
    expect(screen.getByText(/2 \/ 5/)).toBeInTheDocument()
    expect(screen.getByText(/\(min\)/)).toBeInTheDocument()
  })

  it('Settings cog calls onOpenSettings with the activity id', () => {
    render(<UserActivityRow activity={baseActivity} onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onOpenSettings).toHaveBeenCalledWith(7)
  })

  it('toggles the logs list; empty-state shown when no logs', () => {
    render(<UserActivityRow activity={baseActivity} onOpenSettings={onOpenSettings} />)
    expect(screen.getByRole('button', { name: 'Logs (0)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Logs (0)' }))
    expect(screen.getByText('(no logs)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByText('(no logs)')).not.toBeInTheDocument()
  })

  it('renders log entries when expanded', () => {
    const log = { id: 10, logged_at: '2026-05-30T14:30:00Z', value: 3, unit: 'km' } as never
    render(<UserActivityRow activity={baseActivity} onOpenSettings={onOpenSettings} logs={[log]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Logs (1)' }))
    expect(screen.getByText(/14:30/)).toBeInTheDocument()
    expect(screen.getByText(/3 km/)).toBeInTheDocument()
  })

  it('renders leadingControl and trailingActions slots', () => {
    render(
      <UserActivityRow
        activity={baseActivity}
        onOpenSettings={onOpenSettings}
        leadingControl={<input type="checkbox" data-testid="leading" />}
        trailingActions={<button>Custom action</button>}
      />,
    )
    expect(screen.getByTestId('leading')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom action' })).toBeInTheDocument()
  })

  it('applies nameClassName override to the activity name', () => {
    render(
      <UserActivityRow
        activity={baseActivity}
        onOpenSettings={onOpenSettings}
        nameClassName="line-through text-red-500"
      />,
    )
    const name = screen.getByText('Running')
    expect(name.className).toContain('line-through')
    expect(name.className).toContain('text-red-500')
  })

  it('renders nothing when activity.id is null', () => {
    const a = { ...(baseActivity as object), id: null } as never
    const { container } = render(<UserActivityRow activity={a} onOpenSettings={onOpenSettings} />)
    expect(container.firstChild).toBeNull()
  })
})
