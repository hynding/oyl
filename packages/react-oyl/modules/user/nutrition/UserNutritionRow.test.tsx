import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserNutritionRow from './UserNutritionRow'
import type { NutritionRow } from './types'

const row: NutritionRow = {
  log: {
    id: 1, documentId: 'l1', date: '2026-06-02T08:30:00.000Z',
    servings: 1, name: 'Oatmeal', user: 1,
    nutrition_item: { documentId: 'i1', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 380 } as never,
  } as never,
  item: { documentId: 'i1', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user', serving_size: 100, calories_per_100: 380 } as never,
}

describe('UserNutritionRow', () => {
  it('renders name, time, kcal', () => {
    render(<UserNutritionRow row={row} timezone="UTC" onServingsChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText(/08:30/)).toBeInTheDocument()
    expect(screen.getByText(/380/)).toBeInTheDocument()
  })

  it('debounces servings change', async () => {
    vi.useFakeTimers()
    const onServingsChange = vi.fn()
    render(<UserNutritionRow row={row} timezone="UTC" onServingsChange={onServingsChange} onRemove={vi.fn()} />)
    const input = screen.getByLabelText(/servings/i)
    fireEvent.change(input, { target: { value: '2' } })
    expect(onServingsChange).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(onServingsChange).toHaveBeenCalledWith(2)
    vi.useRealTimers()
  })

  it('Remove confirms then calls onRemove', async () => {
    const onRemove = vi.fn()
    render(<UserNutritionRow row={row} timezone="UTC" onServingsChange={vi.fn()} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /remove/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onRemove).toHaveBeenCalled()
  })
})
