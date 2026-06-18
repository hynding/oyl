import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineAuthForm } from './oyl-auth-form.js'

beforeAll(() => defineAuthForm())

/** @param {any} mode @param {any} auth @param {() => void} [onSuccess] @returns {any} */
function mount(mode, auth, onSuccess = () => {}) {
  const el = /** @type {any} */ (document.createElement('oyl-auth-form'))
  el.auth = auth; el.mode = mode; el.onSuccess = onSuccess
  document.body.append(el)
  return el
}

describe('<oyl-auth-form>', () => {
  it('login mode calls auth.login and onSuccess', async () => {
    const auth = { login: vi.fn().mockResolvedValue({}), register: vi.fn() }
    const onSuccess = vi.fn()
    const el = mount('login', auth, onSuccess)
    const root = el.shadowRoot
    root.querySelector('input[name="identifier"]').value = 'avery'
    root.querySelector('input[name="password"]').value = 'pw'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.login).toHaveBeenCalledWith('avery', 'pw')
    expect(onSuccess).toHaveBeenCalled()
    el.remove()
  })

  it('register mode calls auth.register with username/email/password', async () => {
    const auth = { login: vi.fn(), register: vi.fn().mockResolvedValue({}) }
    const el = mount('register', auth)
    const root = el.shadowRoot
    root.querySelector('input[name="username"]').value = 'avery'
    root.querySelector('input[name="email"]').value = 'a@b.c'
    root.querySelector('input[name="password"]').value = 'pw'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(auth.register).toHaveBeenCalledWith('avery', 'a@b.c', 'pw')
    el.remove()
  })

  it('renders the error message when auth rejects', async () => {
    const auth = { login: vi.fn().mockRejectedValue(new Error('bad creds')), register: vi.fn() }
    const el = mount('login', auth)
    const root = el.shadowRoot
    root.querySelector('input[name="identifier"]').value = 'x'
    root.querySelector('input[name="password"]').value = 'y'
    root.querySelector('form').requestSubmit()
    await Promise.resolve(); await Promise.resolve()
    expect(root.querySelector('[data-role="error"]').textContent).toContain('bad creds')
    el.remove()
  })
})
