import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const control = (root: HTMLElement) => root.shadowRoot!.querySelector('button, a')!

describe('ui-button', () => {
  it('defaults to the secondary variant and a native button', async () => {
    const { root } = await render(<ui-button>Save</ui-button>)
    expect(root).toHaveAttribute('variant', 'secondary')
    const el = control(root)
    expect(el.tagName).toBe('BUTTON')
    expect(el).toHaveAttribute('type', 'button')
    expect(el).toHaveClass('secondary')
    expect(root).toHaveTextContent('Save')
  })

  it('applies the variant class', async () => {
    const { root } = await render(<ui-button variant="primary">Go</ui-button>)
    expect(control(root)).toHaveClass('primary')
  })

  it('renders an anchor when href is set', async () => {
    const { root } = await render(<ui-button href="/journal">Journal</ui-button>)
    const el = control(root)
    expect(el.tagName).toBe('A')
    expect(el).toHaveAttribute('href', '/journal')
  })

  it('reflects disabled and disables the control', async () => {
    const { root } = await render(<ui-button disabled>No</ui-button>)
    expect(root).toHaveAttribute('disabled', '')
    expect(control(root)).toHaveAttribute('disabled', '')
  })

  it('a disabled link loses its href and is aria-disabled', async () => {
    const { root } = await render(<ui-button href="/x" disabled>No</ui-button>)
    const el = control(root)
    expect(el.hasAttribute('href')).toBe(false)
    expect(el).toHaveAttribute('aria-disabled', 'true')
  })

  it('type=submit submits the enclosing light-DOM form', async () => {
    const { root } = await render(
      <form>
        <ui-button type="submit">Send</ui-button>
      </form>,
    )
    const form = root as unknown as HTMLFormElement
    const requestSubmit = vi.fn()
    form.requestSubmit = requestSubmit
    const button = form.querySelector('ui-button')!
    control(button).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(requestSubmit).toHaveBeenCalledTimes(1)
  })

  it('a disabled submit does not submit', async () => {
    const { root } = await render(
      <form>
        <ui-button type="submit" disabled>Send</ui-button>
      </form>,
    )
    const form = root as unknown as HTMLFormElement
    const requestSubmit = vi.fn()
    form.requestSubmit = requestSubmit
    control(form.querySelector('ui-button')!).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(requestSubmit).not.toHaveBeenCalled()
  })
})
