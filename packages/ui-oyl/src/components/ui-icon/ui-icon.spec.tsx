import { render, h, describe, it, expect } from '@stencil/vitest'

const svg = (root: HTMLElement) => root.shadowRoot!.querySelector('svg')

describe('ui-icon', () => {
  it('renders an inline 24-grid svg for a known name', async () => {
    const { root } = await render(<ui-icon name="check" />)
    const el = svg(root)!
    expect(el).toHaveAttribute('viewBox', '0 0 24 24')
    expect(el.querySelector('path')).not.toBeNull()
  })

  it('is decorative by default', async () => {
    const { root } = await render(<ui-icon name="check" />)
    const el = svg(root)!
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.hasAttribute('role')).toBe(false)
  })

  it('is an accessible image when labelled', async () => {
    const { root } = await render(<ui-icon name="warning" label="Warning" />)
    const el = svg(root)!
    expect(el).toHaveAttribute('role', 'img')
    expect(el).toHaveAttribute('aria-label', 'Warning')
    expect(el.hasAttribute('aria-hidden')).toBe(false)
  })

  it('reflects size with a medium default', async () => {
    const { root, setProps, waitForChanges } = await render(<ui-icon name="check" />)
    expect(root).toHaveAttribute('size', 'm')
    await setProps({ size: 's' })
    await waitForChanges()
    expect(root).toHaveAttribute('size', 's')
  })

  it('renders nothing for an unknown name', async () => {
    const { root } = await render(<ui-icon name={'nope' as any} />)
    expect(svg(root)).toBeNull()
  })
})
