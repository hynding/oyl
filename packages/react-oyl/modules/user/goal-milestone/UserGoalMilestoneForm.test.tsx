import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserGoalMilestoneForm from './UserGoalMilestoneForm'

const goals = [
  { id: 1, name: 'Lose weight' },
  { id: 2, name: 'Read more' },
] as never[]

describe('UserGoalMilestoneForm', () => {
  let onSubmit: ReturnType<typeof vi.fn<(...args: any[]) => any>>
  let onCancel: ReturnType<typeof vi.fn<(...args: any[]) => any>>

  beforeEach(() => {
    onSubmit = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    onCancel = vi.fn<(...args: any[]) => any>()
  })

  it('preselects the first goal option', () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('1')
  })

  it('respects initialGoalId override', () => {
    render(
      <UserGoalMilestoneForm
        goals={goals}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialGoalId={2}
      />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('2')
  })

  it('submits with selected goal and shaped values', async () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: 'Halfway book' } })
    const dateInput = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      user_goal: { id: 2, name: 'Read more' },
      title: 'Halfway book',
      target_date: '2026-08-01',
    })
  })

  it('trims the title before submitting', async () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: '  Phase 1  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].title).toBe('Phase 1')
  })

  it('omits target_date when blank', async () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: 'Phase 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].target_date).toBeUndefined()
  })

  it('does not submit when title is empty (HTML required)', () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit when goals is empty', () => {
    render(<UserGoalMilestoneForm goals={[] as never[]} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Milestone title'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders the provided submitLabel', () => {
    render(
      <UserGoalMilestoneForm
        goals={goals}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLabel="Save milestone"
      />,
    )
    expect(screen.getByRole('button', { name: 'Save milestone' })).toBeInTheDocument()
  })

  it('cancel calls onCancel without submitting', () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders one option per goal', () => {
    render(<UserGoalMilestoneForm goals={goals} onSubmit={onSubmit} onCancel={onCancel} />)
    expect(screen.getByRole('option', { name: 'Lose weight' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Read more' })).toBeInTheDocument()
  })
})
