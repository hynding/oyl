import { render, h, describe, it, expect, vi } from '@stencil/vitest'
import { core } from '../../../vitest-setup.js'

const field = (root: HTMLElement, name: string) => root.shadowRoot!.querySelector(`ui-field[name="${name}"]`) as HTMLElement & { value: string }
const form = (root: HTMLElement) => root.shadowRoot!.querySelector('form')!
const submitEvent = (f: HTMLFormElement) => { const ev = f.ownerDocument.createEvent('Event'); ev.initEvent('submit', true, true); return ev }
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('oyl-auth-form', () => {
  it('login mode: identifier + password, submits through auth.login then onSuccess', async () => {
    const auth = { login: vi.fn(async () => ({})), register: vi.fn(async () => ({})) }
    const { root } = await render(<oyl-auth-form mode="login" auth={auth} />)
    const success = vi.fn()
    root.addEventListener('success', success)
    expect(field(root, 'identifier')).not.toBeNull()
    expect(field(root, 'password')).not.toBeNull()
    expect(root.shadowRoot!.querySelector('ui-field[name="email"]')).toBeNull()
    expect(root.shadowRoot!.querySelector('ui-button')).toHaveTextContent('Sign in')
    field(root, 'identifier').value = 'ada'
    field(root, 'password').value = 'pw'
    form(root).dispatchEvent(submitEvent(form(root)))
    await flush()
    expect(auth.login).toHaveBeenCalledWith('ada', 'pw')
    expect(success).toHaveBeenCalledTimes(1)
  })

  it('register mode: username + email + password through auth.register', async () => {
    const auth = { login: vi.fn(async () => ({})), register: vi.fn(async () => ({})) }
    const { root } = await render(<oyl-auth-form mode="register" auth={auth} />)
    expect(root.shadowRoot!.querySelector('ui-button')).toHaveTextContent('Create account')
    field(root, 'username').value = 'ada'
    field(root, 'email').value = 'a@x'
    field(root, 'password').value = 'pw'
    form(root).dispatchEvent(submitEvent(form(root)))
    await flush()
    expect(auth.register).toHaveBeenCalledWith('ada', 'a@x', 'pw')
  })

  it('shows a rejected request as a live error and keeps the form usable', async () => {
    const auth = { login: vi.fn(async () => { throw new Error('Invalid identifier or password') }), register: vi.fn() }
    const { root, waitForChanges } = await render(<oyl-auth-form mode="login" auth={auth} />)
    form(root).dispatchEvent(submitEvent(form(root)))
    await flush()
    await waitForChanges()
    const err = root.shadowRoot!.querySelector('[data-role="error"]')!
    expect(err).toHaveAttribute('aria-live', 'polite')
    expect(err).toHaveTextContent('Invalid identifier or password')
    expect((root.shadowRoot!.querySelector('ui-button') as any).disabled).toBe(false)
  })

  it('offers Google sign-in as an external link when configured', async () => {
    const { signal } = await core()
    const googleAuth = signal<{ href: string } | null>(null)
    const auth = { login: vi.fn(), register: vi.fn() }
    const { root, waitForChanges } = await render(<oyl-auth-form mode="login" auth={auth} googleAuth={googleAuth} />)
    expect(root.shadowRoot!.querySelector('a[data-act="google"]')).toBeNull()
    googleAuth.set({ href: 'http://api/google/connect?mode=login' })
    await flush()
    await waitForChanges()
    const a = root.shadowRoot!.querySelector('a[data-act="google"]')!
    expect(a).toHaveAttribute('rel', 'external')
    expect(a).toHaveAttribute('href', 'http://api/google/connect?mode=login')
  })
})
