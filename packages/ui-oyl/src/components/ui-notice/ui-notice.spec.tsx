import { render, h, describe, it, expect, vi } from '@stencil/vitest'

const q = (root: HTMLElement, sel: string) => root.shadowRoot!.querySelector(sel)

describe('ui-notice', () => {
  it('defaults to the info tone as a status region', async () => {
    const { root } = await render(<ui-notice>Saved</ui-notice>)
    expect(root).toHaveAttribute('tone', 'info')
    expect(q(root, '[role="status"]')).not.toBeNull()
    expect(q(root, 'ui-icon')).toHaveAttribute('name', 'info')
    expect(root).toHaveTextContent('Saved')
  })

  it('maps tones to icons', async () => {
    for (const [tone, icon] of [['ok', 'check'], ['warn', 'warning'], ['danger', 'danger']] as const) {
      const { root } = await render(<ui-notice tone={tone}>x</ui-notice>)
      expect(q(root, 'ui-icon')).toHaveAttribute('name', icon)
    }
  })

  it('danger is an alert', async () => {
    const { root } = await render(<ui-notice tone="danger">Offline</ui-notice>)
    expect(q(root, '[role="alert"]')).not.toBeNull()
    expect(q(root, '[role="status"]')).toBeNull()
  })

  it('has no dismiss control unless dismissible', async () => {
    const { root } = await render(<ui-notice>x</ui-notice>)
    expect(q(root, 'ui-button')).toBeNull()
  })

  it('dismissible renders a labelled close control that emits dismiss', async () => {
    const { root } = await render(<ui-notice dismissible>x</ui-notice>)
    const handler = vi.fn()
    root.addEventListener('dismiss', handler)
    const close = q(root, 'ui-button')!
    expect(close).toHaveAttribute('aria-label', 'Dismiss')
    close.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
