import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivityRow } from '../useUserDailyOrchestrator'

const orch: {
  activityRows: ActivityRow[]
  addLog: ReturnType<typeof vi.fn>
  selectedDate: string
} = {
  activityRows: [],
  addLog: vi.fn().mockResolvedValue(undefined),
  selectedDate: '2026-05-30',
}

vi.mock('../useUserDailyOrchestrator', () => ({
  useUserDailyOrchestrator: () => orch,
}))

import UserDailyLogActivityForm from './UserDailyLogActivityForm'

const rowFor = (id: number, name: string): ActivityRow => ({
  activity: { id, name } as never,
  logs: [],
  isDone: false,
})

describe('UserDailyLogActivityForm', () => {
  beforeEach(() => {
    orch.addLog.mockClear()
  })

  it('preselects the first activity option', () => {
    orch.activityRows = [rowFor(1, 'Running'), rowFor(2, 'Reading')]
    render(<UserDailyLogActivityForm onClose={vi.fn()} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('1')
  })

  it('submits with selected activity and shaped log fields', async () => {
    orch.activityRows = [rowFor(1, 'Running'), rowFor(2, 'Reading')]
    const onClose = vi.fn()
    render(<UserDailyLogActivityForm onClose={onClose} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '15' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: 'pages' } })
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'good session' } })
    fireEvent.change(screen.getByPlaceholderText('Mood (1-5)'), { target: { value: '4' } })

    fireEvent.click(screen.getByRole('button', { name: 'Log' }))

    await vi.waitFor(() => expect(orch.addLog).toHaveBeenCalledTimes(1))
    const arg = orch.addLog.mock.calls[0][0]
    expect(arg.user_activity).toEqual({ id: 2, name: 'Reading' })
    expect(arg.logged_at).toMatch(/^2026-05-30T\d{2}:\d{2}:\d{2}Z$/)
    expect(arg.value).toBe(15)
    expect(arg.unit).toBe('pages')
    expect(arg.note).toBe('good session')
    expect(arg.mood).toBe(4)
    expect(onClose).toHaveBeenCalled()
  })

  it('omits unset optional fields', async () => {
    orch.activityRows = [rowFor(1, 'Running')]
    render(<UserDailyLogActivityForm onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    await vi.waitFor(() => expect(orch.addLog).toHaveBeenCalled())
    const arg = orch.addLog.mock.calls[0][0]
    expect(arg.value).toBeUndefined()
    expect(arg.unit).toBeUndefined()
    expect(arg.note).toBeUndefined()
    expect(arg.mood).toBeUndefined()
  })

  it('does not submit when there are no activities', () => {
    orch.activityRows = []
    render(<UserDailyLogActivityForm onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Log' }))
    expect(orch.addLog).not.toHaveBeenCalled()
  })

  it('cancel calls onClose without submitting', () => {
    orch.activityRows = [rowFor(1, 'Running')]
    const onClose = vi.fn()
    render(<UserDailyLogActivityForm onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(orch.addLog).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
