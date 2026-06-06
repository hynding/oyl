import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UserActivitiesList from './UserActivitiesList'

describe('UserActivitiesList', () => {
  it('renders the default empty message when items is empty', () => {
    render(<UserActivitiesList items={[]} renderItem={() => null} />)
    expect(screen.getByText('No activities.')).toBeInTheDocument()
  })

  it('renders a custom empty message when provided', () => {
    render(
      <UserActivitiesList
        items={[] as number[]}
        renderItem={() => null}
        emptyMessage="Nothing here yet."
      />,
    )
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
  })

  it('renders empty-message JSX (ReactNode)', () => {
    render(
      <UserActivitiesList
        items={[] as number[]}
        renderItem={() => null}
        emptyMessage={<span data-testid="custom">x</span>}
      />,
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
  })

  it('renders one element per item via renderItem', () => {
    render(
      <UserActivitiesList
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
      <UserActivitiesList
        items={[1]}
        renderItem={n => <div key={n}>x</div>}
      />,
    )
    expect((container.firstChild as HTMLElement).className).toContain('space-y-3')
  })

  it('applies a className override', () => {
    const { container } = render(
      <UserActivitiesList
        items={[1]}
        renderItem={n => <div key={n}>x</div>}
        className="custom-grid"
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toBe('custom-grid')
  })
})
