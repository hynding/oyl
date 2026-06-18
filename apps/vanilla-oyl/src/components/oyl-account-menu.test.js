import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineAccountMenu } from './oyl-account-menu.js'

beforeAll(() => defineAccountMenu())

describe('<oyl-account-menu>', () => {
  it('shows Sign in when logged out, Log out when logged in', async () => {
    const session = signal(/** @type {any} */ (null))
    const onLogout = vi.fn()
    const el = /** @type {any} */ (document.createElement('oyl-account-menu'))
    el.session = session; el.onLogout = onLogout
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    expect(root.querySelector('[data-act="logout"]')).toBeFalsy()

    session.set({ token: 't', user: { id: 1, username: 'a', email: 'a@b.c' } })
    await Promise.resolve()
    expect(root.querySelector('a[href="/login"]')).toBeFalsy()
    const logout = root.querySelector('[data-act="logout"]')
    expect(logout).toBeTruthy()
    logout.click()
    expect(onLogout).toHaveBeenCalled()
    el.remove()
  })
})
