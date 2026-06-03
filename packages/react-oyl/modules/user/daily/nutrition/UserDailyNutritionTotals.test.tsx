import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserDailyNutritionTotals from './UserDailyNutritionTotals'

describe('UserDailyNutritionTotals', () => {
  it('renders four metrics with current values when no targets', () => {
    render(<UserDailyNutritionTotals totals={{
      calories: 1200, protein: 90, carbs: 130, fat: 40,
      targets: {}, progress: {},
    }} />)
    expect(screen.getByText(/kcal 1200/i)).toBeInTheDocument()
    expect(screen.getByText(/P 90/)).toBeInTheDocument()
    expect(screen.getByText(/C 130/)).toBeInTheDocument()
    expect(screen.getByText(/F 40/)).toBeInTheDocument()
  })

  it('renders bars when target present', () => {
    render(<UserDailyNutritionTotals totals={{
      calories: 2200, protein: 80, carbs: 130, fat: 40,
      targets: { calories: 2000, protein: 100 },
      progress: { calories: 1.1, protein: 0.8 },
    }} />)
    expect(screen.getByRole('progressbar', { name: /calories/i })).toHaveAttribute('aria-valuenow', '1.1')
    expect(screen.getByRole('progressbar', { name: /protein/i })).toHaveAttribute('aria-valuenow', '0.8')
  })
})
