import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '@oyl/all-of-oyl/client'
import { defineRegister } from './oyl-register.js'

beforeAll(() => defineRegister())

describe('<oyl-register>', () => {
  it('has no skip button (account-required)', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-register'))
    el.auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    document.body.append(el)
    expect(el.shadowRoot.querySelector('[data-act="skip"]')).toBeNull()
    el.remove()
  })

  it('renders the create-account heading and a login link, and forwards register success with profile patch', async () => {
    const onAuthenticated = vi.fn()
    const auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    const el = /** @type {any} */ (document.createElement('oyl-register'))
    el.auth = auth; el.onAuthenticated = onAuthenticated
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()

    const formEl = root.querySelector('oyl-auth-form')
    formEl.shadowRoot.querySelector('input[name="username"]').value = 'avery'
    formEl.shadowRoot.querySelector('input[name="email"]').value = 'a@b.c'
    formEl.shadowRoot.querySelector('input[name="password"]').value = 'pw'
    formEl.shadowRoot.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.register).toHaveBeenCalledWith('avery', 'a@b.c', 'pw')
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
    const patch = /** @type {any} */ (onAuthenticated.mock.calls[0])[0]
    expect(typeof patch.timezone).toBe('string')
    el.remove()
  })

  it('threads the googleAuth signal through to the inner oyl-auth-form', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-register'))
    el.auth = { login: vi.fn(), register: vi.fn() }
    const googleAuth = signal(/** @type {{ href: string } | null} */ (null))
    el.googleAuth = googleAuth
    document.body.append(el)
    const formEl = el.shadowRoot.querySelector('oyl-auth-form')
    expect(formEl.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    googleAuth.set({ href: 'http://api.test/api/google/connect?mode=login' })
    await Promise.resolve()
    expect(formEl.shadowRoot.querySelector('a[data-act="google"]')?.getAttribute('href')).toBe('http://api.test/api/google/connect?mode=login')
    el.remove()
  })
})
