import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-app', () => {
  it('renders the brand', async () => {
    const { root } = await render(<oyl-app />)
    expect(root.shadowRoot!.querySelector('h1')).toHaveTextContent('OYL')
  })
})
