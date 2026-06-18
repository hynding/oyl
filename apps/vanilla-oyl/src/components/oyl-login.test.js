import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineLogin } from './oyl-login.js'

beforeAll(() => defineLogin())

describe('<oyl-login>', () => {
  it('has no skip button (account-required)', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-login'))
    el.auth = { login: vi.fn().mockResolvedValue({}), register: vi.fn() }
    document.body.append(el)
    expect(el.shadowRoot.querySelector('[data-act="skip"]')).toBeNull()
    el.remove()
  })

  it('renders the sign-in heading and a register link, and forwards auth success', async () => {
    const onAuthenticated = vi.fn()
    const auth = { login: vi.fn().mockResolvedValue({}), register: vi.fn() }
    const el = /** @type {any} */ (document.createElement('oyl-login'))
    el.auth = auth; el.onAuthenticated = onAuthenticated
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('h2')).toBeTruthy()
    expect(root.querySelector('a[href="/register"]')).toBeTruthy()

    const formEl = root.querySelector('oyl-auth-form')
    formEl.shadowRoot.querySelector('input[name="identifier"]').value = 'a'
    formEl.shadowRoot.querySelector('input[name="password"]').value = 'b'
    formEl.shadowRoot.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(onAuthenticated).toHaveBeenCalled()
    el.remove()
  })
})
