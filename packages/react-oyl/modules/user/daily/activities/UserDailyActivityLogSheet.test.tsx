import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Log = {
  id: number | null
  value?: number
  unit?: string
  note?: string
  mood?: number
}

const logCtx: {
  editingLogId: number | null
  setEditingLogId: ReturnType<typeof vi.fn>
  logs: Log[]
  updateLog: ReturnType<typeof vi.fn>
  removeLog: ReturnType<typeof vi.fn>
} = {
  editingLogId: null,
  setEditingLogId: vi.fn(),
  logs: [],
  updateLog: vi.fn().mockResolvedValue(undefined),
  removeLog: vi.fn().mockResolvedValue(undefined),
}

// Partial-mock the activity-log barrel so the real UserActivityLogSheet primitive
// is used while we override the context hook.
vi.mock('@/modules/user/activity-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/activity-log')>()
  return { ...actual, useUserActivityLogContext: () => logCtx }
})

import UserDailyActivityLogSheet from './UserDailyActivityLogSheet'

const baseLog: Log = { id: 77, value: 5, unit: 'km', note: 'fast', mood: 4 }

describe('UserDailyActivityLogSheet', () => {
  beforeEach(() => {
    logCtx.setEditingLogId.mockClear()
    logCtx.updateLog.mockClear()
    logCtx.removeLog.mockClear()
    logCtx.editingLogId = null
    logCtx.logs = []
  })

  it('renders nothing when editingLogId is null', () => {
    const { container } = render(<UserDailyActivityLogSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the log is not found', () => {
    logCtx.editingLogId = 999
    logCtx.logs = [baseLog]
    const { container } = render(<UserDailyActivityLogSheet />)
    expect(container.firstChild).toBeNull()
  })

  it('populates the form fields from the log on open', () => {
    logCtx.editingLogId = 77
    logCtx.logs = [baseLog]
    render(<UserDailyActivityLogSheet />)
    expect((screen.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('5')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('km')
    expect((screen.getByPlaceholderText('Note') as HTMLTextAreaElement).value).toBe('fast')
    expect((screen.getByPlaceholderText('Mood (1-5)') as HTMLInputElement).value).toBe('4')
  })

  it('Save calls updateLog with shaped patch and closes', async () => {
    logCtx.editingLogId = 77
    logCtx.logs = [baseLog]
    render(<UserDailyActivityLogSheet />)
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '7' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: 'better' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(logCtx.updateLog).toHaveBeenCalledTimes(1))
    const [id, patch] = logCtx.updateLog.mock.calls[0]
    expect(id).toBe(77)
    expect(patch.value).toBe(7)
    expect(patch.unit).toBe('km')
    expect(patch.note).toBe('better')
    expect(patch.mood).toBe(4)
    expect(logCtx.setEditingLogId).toHaveBeenCalledWith(null)
  })

  it('Save with cleared fields sends undefined for empties', async () => {
    logCtx.editingLogId = 77
    logCtx.logs = [baseLog]
    render(<UserDailyActivityLogSheet />)
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Mood (1-5)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(logCtx.updateLog).toHaveBeenCalled())
    const [, patch] = logCtx.updateLog.mock.calls[0]
    expect(patch.value).toBeUndefined()
    expect(patch.unit).toBeUndefined()
    expect(patch.note).toBeUndefined()
    expect(patch.mood).toBeUndefined()
  })

  it('Delete calls removeLog and closes', async () => {
    logCtx.editingLogId = 77
    logCtx.logs = [baseLog]
    render(<UserDailyActivityLogSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(logCtx.removeLog).toHaveBeenCalledWith(77))
    expect(logCtx.setEditingLogId).toHaveBeenCalledWith(null)
  })

  it('Cancel button closes without saving', () => {
    logCtx.editingLogId = 77
    logCtx.logs = [baseLog]
    render(<UserDailyActivityLogSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(logCtx.updateLog).not.toHaveBeenCalled()
    expect(logCtx.setEditingLogId).toHaveBeenCalledWith(null)
  })
})
