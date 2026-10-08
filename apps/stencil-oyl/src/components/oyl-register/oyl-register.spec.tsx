import { render, h, describe, it, expect, vi } from '@stencil/vitest'

describe('oyl-register', () => {
  it('renders the heading, the form and the cross-link', async () => {
    const auth = { login: vi.fn(), register: vi.fn() }
    const { root } = await render(<oyl-register auth={auth} />)
    const sr = root.shadowRoot!
    expect(sr.querySelector('h2')).toHaveTextContent('Create account')
    expect(sr.querySelector('oyl-auth-form')).toHaveAttribute('mode', 'register')
    expect(sr.querySelector('a[href="/login"]')).not.toBeNull()
  })

  it('re-emits the form success as authenticated', async () => {
    const auth = { login: vi.fn(), register: vi.fn() }
    const { root } = await render(<oyl-register auth={auth} />)
    const done = vi.fn()
    root.addEventListener('authenticated', done)
    root.shadowRoot!.querySelector('oyl-auth-form')!.dispatchEvent(new CustomEvent('success', { bubbles: true }))
    expect(done).toHaveBeenCalledTimes(1)
  })
})
