import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserNutritionSearchInput from './UserNutritionSearchInput'
import type { LocalResult } from '@/modules/nutrition/openfoodfacts'

const tier1: LocalResult = {
  source: 'recent',
  item: { id: 1, documentId: 'r', name: 'Oatmeal', brand: 'Generic', serving_unit: 'g', source: 'user', nutri_score: 'b', nova_group: 2, allergens: ['gluten'] } as never,
}

describe('UserNutritionSearchInput', () => {
  it('renders tier-1 row with Nutri-Score and NOVA badges and allergens line', () => {
    render(<UserNutritionSearchInput
      localResults={[tier1]}
      offResults={[]} offLoading={false} offError={null}
      onQueryChange={vi.fn()} onSelect={vi.fn()} onSearchOff={vi.fn()}
    />)
    const input = screen.getByPlaceholderText(/search foods/i)
    fireEvent.change(input, { target: { value: 'o' } })
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText(/Generic/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nutri-Score B/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/NOVA 2/i)).toBeInTheDocument()
    expect(screen.getByText(/Contains.*gluten/i)).toBeInTheDocument()
  })

  it('clicking sentinel calls onSearchOff', () => {
    const onSearchOff = vi.fn()
    render(<UserNutritionSearchInput
      localResults={[]} offResults={[]} offLoading={false} offError={null}
      onQueryChange={vi.fn()} onSelect={vi.fn()} onSearchOff={onSearchOff}
    />)
    const input = screen.getByPlaceholderText(/search foods/i)
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.click(screen.getByText(/Search OpenFoodFacts for/i))
    expect(onSearchOff).toHaveBeenCalled()
  })
})
