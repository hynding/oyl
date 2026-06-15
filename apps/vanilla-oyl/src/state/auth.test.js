import { describe, expect, it, vi } from 'vitest'
import { createAuthState } from './auth.js'
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
