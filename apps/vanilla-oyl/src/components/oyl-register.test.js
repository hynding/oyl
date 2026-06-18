import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineRegister } from './oyl-register.js'

beforeAll(() => defineRegister())

describe('<oyl-register>', () => {
  it('forwards register success with the collected profile patch (incl. timezone)', async () => {
    const onAuthenticated = vi.fn(); const onSkip = vi.fn()
    const auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    const el = /** @type {any} */ (document.createElement('oyl-register'))
    el.auth = auth; el.onAuthenticated = onAuthenticated; el.onSkip = onSkip
    document.body.append(el)
    const root = el.shadowRoot
    expect(root.querySelector('a[href="/login"]')).toBeTruthy()
    root.querySelector('[data-act="skip"]').click()
    expect(onSkip).toHaveBeenCalled()

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
})
