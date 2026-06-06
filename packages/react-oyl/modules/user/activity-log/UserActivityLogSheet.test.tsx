import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserActivityLogSheet from './UserActivityLogSheet'

const baseLog = {
  id: 77,
  value: 5,
  unit: 'km',
  note: 'fast',
  mood: 4,
} as never

describe('UserActivityLogSheet', () => {
  let onSave: ReturnType<typeof vi.fn>
  let onDelete: ReturnType<typeof vi.fn>
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined)
    onDelete = vi.fn().mockResolvedValue(undefined)
    onClose = vi.fn()
  })

  it('populates the form fields from log on mount', () => {
    render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    expect((screen.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('5')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('km')
    expect((screen.getByPlaceholderText('Note') as HTMLTextAreaElement).value).toBe('fast')
    expect((screen.getByPlaceholderText('Mood (1-5)') as HTMLInputElement).value).toBe('4')
  })

  it('Save calls onSave with shaped patch then onClose', async () => {
    render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '7' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: 'better' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const patch = onSave.mock.calls[0][0]
    expect(patch.value).toBe(7)
    expect(patch.unit).toBe('km')
    expect(patch.note).toBe('better')
    expect(patch.mood).toBe(4)
    expect(onClose).toHaveBeenCalled()
  })

  it('Save with cleared fields sends undefined for empties', async () => {
    render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Unit'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Note'), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Mood (1-5)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const patch = onSave.mock.calls[0][0]
    expect(patch.value).toBeUndefined()
    expect(patch.unit).toBeUndefined()
    expect(patch.note).toBeUndefined()
    expect(patch.mood).toBeUndefined()
  })

  it('Delete calls onDelete then onClose', async () => {
    render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalled()
  })

  it('Cancel button calls onClose without saving', () => {
    render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onDelete).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('backdrop click calls onClose; inner click does not', () => {
    const { container } = render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    fireEvent.click(screen.getByPlaceholderText('Value'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('repopulates fields when the log prop changes', () => {
    const { rerender } = render(<UserActivityLogSheet log={baseLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    const newLog = { id: 99, value: 12, unit: 'mi', note: 'easy', mood: 3 } as never
    rerender(<UserActivityLogSheet log={newLog} onSave={onSave} onDelete={onDelete} onClose={onClose} />)
    expect((screen.getByPlaceholderText('Value') as HTMLInputElement).value).toBe('12')
    expect((screen.getByPlaceholderText('Unit') as HTMLInputElement).value).toBe('mi')
  })
})
