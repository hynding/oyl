import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserGoalForm from './UserGoalForm'

describe('UserGoalForm', () => {
  let onSubmit: ReturnType<typeof vi.fn>
  let onCancel: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSubmit = vi.fn().mockResolvedValue(undefined)
    onCancel = vi.fn()
  })

  it('submits with shaped values incl. defaults (current_status, progress)', async () => {
    render(<UserGoalForm onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Goal name'), { target: { value: 'Run 5K' } })
    fireEvent.change(screen.getByPlaceholderText('Category'), { target: { value: 'fitness' } })
    fireEvent.change(screen.getByDisplayValue('Medium'), { target: { value: 'high' } })
    fireEvent.change(screen.getByPlaceholderText('Target value'), { target: { value: '5' } })
    const dateInput = document.getElementById('goal-target-date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Run 5K',
      category: 'fitness',
      target: 5,
      target_date: '2026-12-31',
      priority: 'high',
      current_status: 'active',
      progress: 0,
    })
  })

  it('renders the provided submitLabel', () => {
    render(<UserGoalForm onSubmit={onSubmit} onCancel={onCancel} submitLabel="Save changes" />)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('populates fields from initialValues', () => {
    render(
      <UserGoalForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialValues={{
          name: 'Read books',
          category: 'learning',
          target: 12,
          target_date: '2026-12-31',
          priority: 'low',
          current_status: 'paused',
          progress: 4,
        }}
      />,
    )
    expect((screen.getByPlaceholderText('Goal name') as HTMLInputElement).value).toBe('Read books')
    expect((screen.getByPlaceholderText('Category') as HTMLInputElement).value).toBe('learning')
    expect((screen.getByPlaceholderText('Target value') as HTMLInputElement).value).toBe('12')
    expect((document.getElementById('goal-target-date') as HTMLInputElement).value).toBe('2026-12-31')
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('low')
  })

  it('preserves current_status and progress from initialValues on submit', async () => {
    render(
      <UserGoalForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialValues={{ name: 'Read books', current_status: 'archived', progress: 7 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.current_status).toBe('archived')
    expect(arg.progress).toBe(7)
  })

  it('does not submit when name is empty (HTML required)', () => {
    render(<UserGoalForm onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('omits category/target/target_date when unset; defaults priority to medium', async () => {
    render(<UserGoalForm onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByPlaceholderText('Goal name'), { target: { value: 'Walk daily' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.category).toBeUndefined()
    expect(arg.target).toBeUndefined()
    expect(arg.target_date).toBeUndefined()
    expect(arg.priority).toBe('medium')
    expect(arg.current_status).toBe('active')
    expect(arg.progress).toBe(0)
  })

  it('cancel calls onCancel without submitting', () => {
    render(<UserGoalForm onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })
})
