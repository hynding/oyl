import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserNutritionList from './UserNutritionList'

describe('UserNutritionList', () => {
  it('renders empty state', () => {
    render(<UserNutritionList rows={[]} timezone="UTC" onServingsChange={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/nothing logged/i)).toBeInTheDocument()
  })
})
