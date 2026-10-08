import { render, h, describe, it, expect } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)

describe('ui-card', () => {
  it('renders slotted content in the body', async () => {
    const { root } = await render(<ui-card>Hello</ui-card>)
    expect(root).toHaveTextContent('Hello')
    expect(q(root, '.body')).not.toBeNull()
    expect(q(root, 'header')).toBeNull()
    expect(q(root, 'footer')).toBeNull()
  })

  it('renders a heading in a header region', async () => {
    const { root } = await render(<ui-card heading="Connection">Body</ui-card>)
    const h2 = q(root, 'header h2')!
    expect(h2).toHaveTextContent('Connection')
  })

  it('a header slot replaces the heading', async () => {
    const { root } = await render(
      <ui-card heading="Ignored">
        <strong slot="header">Custom</strong>
        Body
      </ui-card>,
    )
    expect(q(root, 'header h2')).toBeNull()
    expect(q(root, 'header slot[name="header"]')).not.toBeNull()
  })

  it('renders a footer region when the footer slot is used', async () => {
    const { root } = await render(
      <ui-card>
        Body
        <span slot="footer">Actions</span>
      </ui-card>,
    )
    expect(q(root, 'footer slot[name="footer"]')).not.toBeNull()
  })

  it('padding=none reflects and removes body padding', async () => {
    const { root } = await render(<ui-card padding="none">Rows</ui-card>)
    expect(root).toHaveAttribute('padding', 'none')
    expect(q(root, '.body')).toHaveClass('flush')
  })
})
