import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserNutritionItemsList from './UserNutritionItemsList'

describe('UserNutritionItemsList', () => {
  it('renders the emptyMessage when items is empty', () => {
    render(
      <UserNutritionItemsList items={[]} emptyMessage="No items yet." renderItem={() => null} />,
    )
    expect(screen.getByText('No items yet.')).toBeInTheDocument()
  })

  it('renders each item via renderItem', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    render(
      <UserNutritionItemsList
        items={items}
        renderItem={i => <span key={i.id} data-testid={`row-${i.id}`}>{i.id}</span>}
      />,
    )
    expect(screen.getByTestId('row-a')).toBeInTheDocument()
    expect(screen.getByTestId('row-b')).toBeInTheDocument()
  })
})
