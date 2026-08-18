import { describe, expect, it, vi } from 'vitest'
import { createAuthState, googleErrorMessage } from './auth.js'
import { AUTH_KEY } from '../storage/keys.js'

/** @param {Record<string,string>} [seed] */
function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed))
  return {
    /** @param {string} k */ getItem: (k) => m.get(k) ?? null,
    /** @param {string} k @param {string} v */ setItem: (k, v) => void m.set(k, v),
    /** @param {string} k */ removeItem: (k) => void m.delete(k),
    _map: m,
  }
}

/** @param {string} [jwt] @param {{ id: number, username: string, email: string }} [user] @returns {typeof globalThis.fetch} */
const okFetch = (jwt = 'jwt-1', user = { id: 1, username: 'a', email: 'a@x.dev' }) =>
  /** @type {any} */ (vi.fn(async () => new Response(JSON.stringify({ jwt, user }), { status: 200 })))

/** @param {number} [status] @param {string} [message] @returns {typeof globalThis.fetch} */
const errFetch = (status = 400, message = 'Invalid identifier or password') =>
  /** @type {any} */ (vi.fn(async () => new Response(JSON.stringify({ error: { message } }), { status })))

describe('createAuthState', () => {
  it('login posts to /auth/local, sets session, persists, and getToken returns the jwt', async () => {
    const storage = fakeStorage()
    const fetch = /** @type {any} */ (okFetch())
    const auth = createAuthState(storage, { baseUrl: 'http://x/api', fetch })
    const user = await auth.login('a', 'pw')
    expect(user.username).toBe('a')
    expect(String(fetch.mock.calls[0][0])).toBe('http://x/api/auth/local')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ identifier: 'a', password: 'pw' })
    expect(auth.session.get()?.token).toBe('jwt-1')
    expect(await auth.getToken()).toBe('jwt-1')
    expect(JSON.parse(/** @type {string} */ (storage._map.get(AUTH_KEY))).token).toBe('jwt-1')
  })

  it('register posts to /auth/local/register', async () => {
    const fetch = /** @type {any} */ (okFetch())
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    await auth.register('a', 'a@x.dev', 'pw')
    expect(String(fetch.mock.calls[0][0])).toBe('http://x/api/auth/local/register')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'a', email: 'a@x.dev', password: 'pw' })
  })

  it('rejects with the server message on failure; session stays null', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: errFetch(400, 'nope') })
    await expect(auth.login('a', 'bad')).rejects.toThrow('nope')
    expect(auth.session.get()).toBeNull()
  })

  it('hydrates a stored session; getToken returns it; logout clears storage + signal', async () => {
    const storage = fakeStorage({ [AUTH_KEY]: JSON.stringify({ token: 't', user: { id: 1, username: 'a', email: 'a@x.dev' } }) })
    const auth = createAuthState(storage, { baseUrl: 'http://x/api', fetch: okFetch() })
    expect(await auth.getToken()).toBe('t')
    auth.logout()
    expect(auth.session.get()).toBeNull()
    expect(storage._map.get(AUTH_KEY)).toBeUndefined()
  })

  it('getToken returns null when signed out', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: okFetch() })
    expect(await auth.getToken()).toBeNull()
  })
})

describe('adoptTokenFromHash', () => {
  /** @param {string} hash */
  const fakeWindow = (hash) => {
    const calls = /** @type {string[]} */ ([])
    return {
      win: { location: { hash, pathname: '/login', search: '' }, history: { replaceState: (/** @type {any} */ _a, /** @type {string} */ _b, /** @type {string} */ url) => calls.push(url) } },
      calls,
    }
  }

  it('adopts #google=<jwt>: fetches /users/me, persists the session, cleans the hash', async () => {
    const storage = fakeStorage()
    const fetch = /** @type {any} */ (vi.fn(async (/** @type {string} */ url) => {
      expect(url).toBe('http://api.test/api/users/me')
      return { ok: true, status: 200, json: async () => ({ id: 7, username: 'g', email: 'g@gmail.test' }) }
    }))
    const auth = createAuthState(storage, { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (fetch) })
    const { win, calls } = fakeWindow('#google=jwt-abc')
    const result = await auth.adoptTokenFromHash(win)
    expect(result).toEqual({ adopted: true, error: null })
    expect(auth.session.get()).toEqual({ token: 'jwt-abc', user: { id: 7, username: 'g', email: 'g@gmail.test' } })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-abc')
    expect(calls).toEqual(['/login'])
  })

  it('surfaces #google_error=<code> and cleans the hash without touching the session', async () => {
    const storage = fakeStorage()
    const auth = createAuthState(storage, { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (vi.fn()) })
    const { win, calls } = fakeWindow('#google_error=account_exists')
    const result = await auth.adoptTokenFromHash(win)
    expect(result).toEqual({ adopted: false, error: 'account_exists' })
    expect(auth.session.get()).toBeNull()
    expect(calls).toEqual(['/login'])
  })

  it('is a no-op on an unrelated hash', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (vi.fn()) })
    const { win, calls } = fakeWindow('#section-2')
    expect(await auth.adoptTokenFromHash(win)).toEqual({ adopted: false, error: null })
    expect(calls).toEqual([])
  })

  it('a rejected token cleans the hash and reports a session error', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (fetch) })
    const { win } = fakeWindow('#google=bad')
    expect(await auth.adoptTokenFromHash(win)).toEqual({ adopted: false, error: 'session' })
    expect(auth.session.get()).toBeNull()
  })
})

describe('googleErrorMessage', () => {
  it('maps every callback error code to a human sentence and unknown codes to a fallback', () => {
    for (const code of ['denied', 'bad_state', 'account_exists', 'no_refresh_token', 'exchange_failed', 'already_linked']) {
      const message = googleErrorMessage(code)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toContain('_')
    }
    expect(googleErrorMessage('surprise')).toBe(googleErrorMessage('unknown'))
  })
})
