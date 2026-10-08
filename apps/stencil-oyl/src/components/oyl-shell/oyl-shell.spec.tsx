import { render, h, describe, it, expect } from '@stencil/vitest'

describe('oyl-shell', () => {
  it('renders the brand, toolbar/nav/main slots and the page frame', async () => {
    const { root } = await render(
      <oyl-shell>
        <span slot="toolbar">T</span>
        <span slot="nav">N</span>
        <span slot="main">M</span>
      </oyl-shell>,
    )
    const sr = root.shadowRoot!
    expect(sr.querySelector('h1')).toHaveTextContent('OYL')
    for (const name of ['toolbar', 'nav', 'main']) expect(sr.querySelector(`slot[name="${name}"]`), name).not.toBeNull()
    expect(sr.querySelector('.page')).not.toBeNull()
  })

  it('reflects docked for the mobile bottom bar', async () => {
    const { root, setProps, waitForChanges } = await render(<oyl-shell />)
    expect(root.hasAttribute('docked')).toBe(false)
    await setProps({ docked: true })
    await waitForChanges()
    expect(root).toHaveAttribute('docked', '')
  })
})
