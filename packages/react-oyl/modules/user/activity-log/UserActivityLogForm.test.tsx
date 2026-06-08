import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserActivityLogForm from './UserActivityLogForm'

const activities = [
  { id: 1, name: 'Running' },
  { id: 2, name: 'Reading' },
] as never[]

describe('UserActivityLogForm', () => {
  let onSubmit: ReturnType<typeof vi.fn<(...args: any[]) => any>>
  let onCancel: ReturnType<typeof vi.fn<(...args: any[]) => any>>

  beforeEach(() => {
    onSubmit = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    onCancel = vi.fn<(...args: any[]) => any>()
  })

  it('preselects the first activity', () => {
    render(<UserActivityLogForm activities={activities} onSubmit={onSubmit} onCancel={onCancel} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('1')
  })

  it('respects initialActivityId override', () => {
    render(
      <UserActivityLogForm
        activities={activities}
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialActivityId={2}
      />,
    )
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('2')
  })

  it('submits with selected activity and shaped log fields', async () => {
    render(<UserActivityLogForm activities={activities} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '15' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: 'pages' } })
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'good session' } })
    fireEvent.change(screen.getByPlaceholderText('Mood (1-5)'), { target: { value: '4' } })

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.user_activity).toEqual({ id: 2, name: 'Reading' })
    expect(arg.value).toBe(15)
    expect(arg.unit).toBe('pages')
    expect(arg.note).toBe('good session')
    expect(arg.mood).toBe(4)
  })

  it('omits unset optional fields', async () => {
    render(<UserActivityLogForm activities={activities} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.value).toBeUndefined()
    expect(arg.unit).toBeUndefined()
    expect(arg.note).toBeUndefined()
    expect(arg.mood).toBeUndefined()
  })

  it('does not submit when activities is empty', () => {
    render(<UserActivityLogForm activities={[] as never[]} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders the provided submitLabel', () => {
    render(
      <UserActivityLogForm
        activities={activities}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLabel="Save log"
      />,
    )
    expect(screen.getByRole('button', { name: 'Save log' })).toBeInTheDocument()
  })

  it('cancel calls onCancel without submitting', () => {
    render(<UserActivityLogForm activities={activities} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders one option per activity', () => {
    render(<UserActivityLogForm activities={activities} onSubmit={onSubmit} onCancel={onCancel} />)
    expect(screen.getByRole('option', { name: 'Running' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Reading' })).toBeInTheDocument()
  })
})
