import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserDailyAddNutritionForm from './UserDailyAddNutritionForm'

const item = { id: 1, documentId: 'i', name: 'Yogurt', serving_unit: 'g', source: 'user', allergens: ['milk'] } as never

describe('UserDailyAddNutritionForm', () => {
  it('shows allergen warning', () => {
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(/Contains.*milk/i)).toBeInTheDocument()
  })

  it('rejects servings <= 0', () => {
    const onSubmit = vi.fn()
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits with servings + datetime', () => {
    const onSubmit = vi.fn()
    render(<UserDailyAddNutritionForm item={item} selectedDate="2026-06-02" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/servings/i), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: /log/i }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5 }))
    expect(onSubmit.mock.calls[0][0].datetime).toMatch(/^2026-06-02T/)
  })
})
