import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserDailyNutritionList from './UserDailyNutritionList'

describe('UserDailyNutritionList', () => {
  it('renders empty state', () => {
    render(<UserDailyNutritionList rows={[]} timezone="UTC" onServingsChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/nothing logged/i)).toBeInTheDocument()
  })
})
