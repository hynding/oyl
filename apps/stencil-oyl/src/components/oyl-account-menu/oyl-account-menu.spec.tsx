import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

/** Click a ui-button the way a user does: on its inner control. */
const click = (el: Element) => (el.shadowRoot?.querySelector('button, a') ?? el).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

describe('oyl-account-menu', () => {
  it('offers Profile always, Log out when signed in, Sign in when not', async () => {
    const { signal } = await core()
    const session = signal<{ token: string } | null>({ token: 't' })
    const onLogout = vi.fn()
    const { root, waitForChanges } = await render(<oyl-account-menu session={session} />)
    root.addEventListener('logout', onLogout)
    const sr = root.shadowRoot!
    expect(sr.querySelector('a[href="/profile"]')).not.toBeNull()
    expect(sr.querySelector('ui-button[data-act="logout"]')).not.toBeNull()
    expect(sr.querySelector('a[href="/login"]')).toBeNull()
    click(sr.querySelector('ui-button[data-act="logout"]')!)
    expect(onLogout).toHaveBeenCalledTimes(1)
    session.set(null)
    await new Promise((r) => setTimeout(r, 0))
    await waitForChanges()
    expect(sr.querySelector('ui-button[data-act="logout"]')).toBeNull()
    expect(sr.querySelector('a[href="/login"]')).toHaveTextContent('Sign in')
  })
})
