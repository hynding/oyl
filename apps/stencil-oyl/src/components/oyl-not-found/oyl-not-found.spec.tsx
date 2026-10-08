import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-not-found', () => {
  it('names the missing route as text', async () => {
    const { root } = await render(<oyl-not-found route="<i>nope</i>" />)
    expect(root).toHaveTextContent('Not found')
    expect(root).toHaveTextContent('<i>nope</i>')
    expect(root.shadowRoot!.querySelector('i')).toBeNull()
  })
})
