import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserGoalsList from './UserGoalsList'

describe('UserGoalsList', () => {
  it('renders the default empty message when items is empty', () => {
    render(<UserGoalsList items={[]} renderItem={() => null} />)
    expect(screen.getByText('No goals.')).toBeInTheDocument()
  })

  it('renders a custom empty message when provided', () => {
    render(
      <UserGoalsList
        items={[] as number[]}
        renderItem={() => null}
        emptyMessage="Nothing here yet."
      />,
    )
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
  })

  it('renders empty-message JSX (ReactNode)', () => {
    render(
      <UserGoalsList
        items={[] as number[]}
        renderItem={() => null}
        emptyMessage={<span data-testid="custom">x</span>}
      />,
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })

  it('renders one element per item via renderItem', () => {
    render(
      <UserGoalsList
        items={[1, 2, 3]}
        renderItem={n => <div key={n} data-testid="row">{`item ${n}`}</div>}
      />,
    )
    const rows = screen.getAllByTestId('row')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toBe('item 1')
    expect(rows[2].textContent).toBe('item 3')
  })

  it('wraps rendered items in a container with the default layout className', () => {
    const { container } = render(
      <UserGoalsList items={[1]} renderItem={n => <div key={n}>x</div>} />,
    )
    expect((container.firstChild as HTMLElement).className).toContain('space-y-3')
  })

  it('applies a className override', () => {
    const { container } = render(
      <UserGoalsList
        items={[1]}
        renderItem={n => <div key={n}>x</div>}
        className="custom-grid"
      />,
    )
    expect((container.firstChild as HTMLElement).className).toBe('custom-grid')
  })
})
