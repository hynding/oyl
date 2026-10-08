import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-app', () => {
  it('renders the boot fallback text when createApp fails', async () => {
    const boot = async () => { throw new Error('nope') }
    const { root, waitForChanges } = await render(<oyl-app boot={boot} />)
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    expect(root).toHaveTextContent('OYL failed to start: nope')
  })
})
