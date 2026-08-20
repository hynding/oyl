import { describe, expect, it, beforeAll, vi } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
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

describe('oyl-auth-form google button', () => {
  it('renders the Google anchor reactively from the googleAuth signal', async () => {
    defineAuthForm()
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = { login: async () => {}, register: async () => {} }
    const googleAuth = signal(/** @type {{ href: string } | null} */ (null))
    form.googleAuth = googleAuth
    document.body.append(form)
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    googleAuth.set({ href: 'http://api.test/api/google/connect?mode=login' })
    await Promise.resolve()
    expect(form.shadowRoot.querySelector('a[data-act="google"]')?.getAttribute('href')).toBe('http://api.test/api/google/connect?mode=login')
    googleAuth.set(null)
    await Promise.resolve()
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    form.remove()
  })

  it('sets rel="external" on the Google anchor so the SPA link-interceptor skips it', async () => {
    defineAuthForm()
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = { login: async () => {}, register: async () => {} }
    const googleAuth = signal(/** @type {{ href: string } | null} */ (null))
    form.googleAuth = googleAuth
    document.body.append(form)
    googleAuth.set({ href: 'http://api.test/api/google/connect?mode=login' })
    await Promise.resolve()
    const a = form.shadowRoot.querySelector('a[data-act="google"]')
    expect(a.getAttribute('rel')).toBe('external')
    form.remove()
  })

  it('renders no Google UI when the prop is unset', () => {
    defineAuthForm()
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = { login: async () => {}, register: async () => {} }
    document.body.append(form)
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    form.remove()
  })
})
