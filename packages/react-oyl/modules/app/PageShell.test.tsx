import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageShell from './PageShell'

describe('PageShell', () => {
  it('renders title in a heading and children inside', () => {
    render(
      <PageShell title="My Activities">
        <p>child content</p>
      </PageShell>,
    )
    expect(screen.getByRole('heading', { name: 'My Activities' })).toBeInTheDocument()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
