import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TNutritionItemData } from '@oyl/all-of-oyl/modules'
import UserNutritionItemRow from './UserNutritionItemRow'

const baseItem: TNutritionItemData = {
  id: 1, documentId: 'i-1', name: 'Oatmeal', brand: 'Brand', serving_unit: 'g', source: 'user',
  nutri_score: 'b', nova_group: 2, allergens: ['gluten'],
} as TNutritionItemData

const minimalItem: TNutritionItemData = {
  id: 2, documentId: 'i-2', name: 'Plain', serving_unit: 'g', source: 'user',
} as TNutritionItemData

describe('UserNutritionItemRow', () => {
  it('renders name and brand', () => {
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText('Brand')).toBeInTheDocument()
  })

  it('renders Nutri-Score and NOVA badges when present', () => {
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.getByLabelText(/Nutri-Score B/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/NOVA 2/i)).toBeInTheDocument()
  })

  it('omits badges when fields are absent', () => {
    render(<UserNutritionItemRow item={minimalItem} timezone="UTC" onLogAgain={vi.fn()} />)
    expect(screen.queryByLabelText(/Nutri-Score/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/NOVA/i)).not.toBeInTheDocument()
  })

  it('renders lastLoggedAt formatted in the given timezone when provided', () => {
    render(
      <UserNutritionItemRow
        item={baseItem}
        timezone="UTC"
        lastLoggedAt="2026-06-04T08:00:00.000Z"
        onLogAgain={vi.fn()}
      />,
    )
    expect(screen.getByText(/Last logged/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-04/)).toBeInTheDocument()
  })

  it('renders logCount when provided with correct pluralization', () => {
    const { rerender } = render(
      <UserNutritionItemRow item={baseItem} timezone="UTC" logCount={5} onLogAgain={vi.fn()} />,
    )
    expect(screen.getByText(/logged 5 times/i)).toBeInTheDocument()
    rerender(
      <UserNutritionItemRow item={baseItem} timezone="UTC" logCount={1} onLogAgain={vi.fn()} />,
    )
    expect(screen.getByText(/logged 1 time(?!s)/i)).toBeInTheDocument()
  })

  it('clicking "Log again" calls onLogAgain with the item', () => {
    const onLogAgain = vi.fn()
    render(<UserNutritionItemRow item={baseItem} timezone="UTC" onLogAgain={onLogAgain} />)
    fireEvent.click(screen.getByRole('button', { name: /log again/i }))
    expect(onLogAgain).toHaveBeenCalledWith(baseItem)
  })
})
