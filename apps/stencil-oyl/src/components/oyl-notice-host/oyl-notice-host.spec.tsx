import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

describe('oyl-notice-host', () => {
  it('shows a dismissible warn notice while the signal is non-null', async () => {
    const { signal } = await core()
    const notice = signal<string | null>(null)
    const onDismiss = vi.fn()
    const { root, waitForChanges } = await render(<oyl-notice-host notice={notice} />)
    root.addEventListener('dismiss', onDismiss)
    expect(root.shadowRoot!.querySelector('ui-notice')).toBeNull()
    notice.set('Offline')
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    const n = root.shadowRoot!.querySelector('ui-notice')!
    expect(n).toHaveAttribute('tone', 'warn')
    expect(n).toHaveTextContent('Offline')
    n.dispatchEvent(new CustomEvent('dismiss', { bubbles: true }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
