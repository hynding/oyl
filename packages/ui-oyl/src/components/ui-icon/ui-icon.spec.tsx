import { render, h, describe, it, expect } from '@stencil/vitest'

describe('ui-icon', () => {
  it('renders a host element', async () => {
    const { root } = await render(<ui-icon name="check" />)
    expect(root).toHaveShadowRoot()
  })
})
