import { describe, expect, it, beforeAll, vi } from 'vitest'
import { createAuthState } from '../state/auth.js'
import { defineAuth } from './oyl-auth.js'

beforeAll(() => defineAuth())
const settle = () => new Promise((r) => setTimeout(r, 0))
function fakeStorage() {
  const m = new Map()
  return {
    /** @param {string} k */ getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
    /** @param {string} k */ removeItem: (/** @type {string} */ k) => void m.delete(k),
  }
}
const okFetch = () => /** @type {any} */ (vi.fn(async () => new Response(JSON.stringify({ jwt: 't', user: { id: 1, username: 'ada', email: 'ada@x.dev' } }), { status: 200 })))

/** @param {any} auth */
function mount(auth) {
  const el = /** @type {any} */ (document.createElement('oyl-auth'))
  el.auth = auth
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-auth>', () => {
  it('logs in and shows the signed-in user', async () => {
    const fetch = okFetch()
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, 'input[name="identifier"]').value = 'ada'
    q(el, 'input[name="password"]').value = 'pw'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(String(fetch.mock.calls[0][0])).toContain('/auth/local')
    expect(el.shadowRoot.textContent).toContain('ada')
    el.remove()
  })

  it('switches to register and posts to /auth/local/register', async () => {
    const fetch = okFetch()
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, '.seg button[data-value="register"]').click()
    await Promise.resolve()
    q(el, 'input[name="username"]').value = 'ada'
    q(el, 'input[name="email"]').value = 'ada@x.dev'
    q(el, 'input[name="password"]').value = 'pw'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(String(fetch.mock.calls[0][0])).toContain('/auth/local/register')
    el.remove()
  })

  it('shows the server error on failed login', async () => {
    const fetch = /** @type {any} */ (vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad creds' } }), { status: 400 })))
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, 'input[name="identifier"]').value = 'a'
    q(el, 'input[name="password"]').value = 'x'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(q(el, '[data-role="error"]').textContent).toContain('bad creds')
    el.remove()
  })

  it('signed-in state shows sign out, which logs out', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: okFetch() })
    await auth.login('ada', 'pw')
    const el = mount(auth)
    await Promise.resolve()
    const out = q(el, 'button[data-act="signout"]')
    expect(out).toBeTruthy()
    out.click()
    await Promise.resolve()
    expect(auth.session.get()).toBeNull()
    el.remove()
  })
})
