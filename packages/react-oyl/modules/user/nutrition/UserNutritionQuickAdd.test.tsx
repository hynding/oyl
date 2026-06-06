import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import UserNutritionQuickAdd from './UserNutritionQuickAdd'

describe('UserNutritionQuickAdd', () => {
  it('renders nothing when list empty', () => {
    const { container } = render(<UserNutritionQuickAdd items={[]} onPick={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('clicking a chip calls onPick', () => {
    const items = [{ id: 1, documentId: 'a', name: 'Oat', serving_unit: 'g', source: 'user' } as never]
    const onPick = vi.fn()
    render(<UserNutritionQuickAdd items={items} onPick={onPick} />)
    fireEvent.click(screen.getByText('Oat'))
    expect(onPick).toHaveBeenCalledWith(items[0])
  })
})
