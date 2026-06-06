import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserNutritionLogForm from './UserNutritionLogForm'

const item = { id: 1, documentId: 'i', name: 'Yogurt', serving_unit: 'g', source: 'user', allergens: ['milk'] } as never

describe('UserNutritionLogForm', () => {
  it('shows allergen warning', () => {
    render(<UserNutritionLogForm item={item} selectedDate="2026-06-02" timezone="UTC" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/Contains.*milk/i)).toBeInTheDocument()
  })

  it('rejects servings <= 0', () => {
    const onSubmit = vi.fn()
    render(<UserNutritionLogForm item={item} selectedDate="2026-06-02" timezone="UTC" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with servings + datetime (UTC pass-through)', () => {
    const onSubmit = vi.fn()
    render(<UserNutritionLogForm item={item} selectedDate="2026-06-02" timezone="UTC" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText(/time/i), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5 }))
    expect(onSubmit.mock.calls[0][0].datetime).toBe('2026-06-02T14:00:00.000Z')
  })

  it('converts wall-clock time in a non-UTC timezone to the correct UTC instant', () => {
    const onSubmit = vi.fn()
    render(
      <UserNutritionLogForm
        item={item}
        selectedDate="2026-06-06"
        timezone="America/Los_Angeles"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByLabelText(/time/i), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: /log/i }))
    // 14:00 in LA on 2026-06-06 (PDT, UTC-7) equals 21:00 UTC
    expect(onSubmit.mock.calls[0][0].datetime).toBe('2026-06-06T21:00:00.000Z')
  })
})
