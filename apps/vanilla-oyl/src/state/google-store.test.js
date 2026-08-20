import { describe, it, expect, vi } from 'vitest'
import { createGoogleStore } from './google-store.js'

/** @param {Array<{ status: number, body?: any }>} responses */
function fakeFetch(responses) {
  const calls = /** @type {any[]} */ ([])
  const fetch = /** @type {any} */ (vi.fn(async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, init })
    const next = responses.shift() ?? { status: 500 }
    return { status: next.status, ok: next.status < 300, json: async () => next.body ?? {} }
  }))
  return { fetch, calls }
}

const BASE = 'http://api.test/api'
const getToken = async () => 'jwt-1'

describe('google-store', () => {
  it('probe: configured=false → unconfigured; true → disconnected', async () => {
    const a = createGoogleStore({ baseUrl: BASE, fetch: fakeFetch([{ status: 200, body: { configured: false } }]).fetch, getToken })
    await a.probe()
    expect(a.connection.get()).toEqual({ state: 'unconfigured' })
    const b = createGoogleStore({ baseUrl: BASE, fetch: fakeFetch([{ status: 200, body: { configured: true } }]).fetch, getToken })
    await b.probe()
    expect(b.connection.get()).toEqual({ state: 'disconnected' })
  })

  it('probe failure leaves state unknown (no crash, no console error)', async () => {
    const store = createGoogleStore({ baseUrl: BASE, fetch: vi.fn(async () => { throw new Error('offline') }), getToken })
    await store.probe()
    expect(store.connection.get().state).toBe('unknown')
  })

  it('loadStatus maps connected/disconnected/501', async () => {
    const { fetch } = fakeFetch([{ status: 200, body: { connected: true, email: 'a@gmail.test' } }])
    const store = createGoogleStore({ baseUrl: BASE, fetch, getToken })
    await store.loadStatus()
    expect(store.connection.get()).toEqual({ state: 'connected', email: 'a@gmail.test' })

    const b = createGoogleStore({ baseUrl: BASE, fetch: fakeFetch([{ status: 501 }]).fetch, getToken })
    await b.loadStatus()
    expect(b.connection.get().state).toBe('unconfigured')
  })

  it('getAccessToken caches until near expiry and force bypasses the cache', async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: { accessToken: 't1', expiresAt: Date.now() + 3_600_000 } },
      { status: 200, body: { accessToken: 't2', expiresAt: Date.now() + 3_600_000 } },
    ])
    const store = createGoogleStore({ baseUrl: BASE, fetch, getToken })
    expect(await store.getAccessToken()).toBe('t1')
    expect(await store.getAccessToken()).toBe('t1')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await store.getAccessToken({ force: true })).toBe('t2')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('410 flips connection to reconnect-needed and throws', async () => {
    const store = createGoogleStore({ baseUrl: BASE, fetch: fakeFetch([{ status: 410 }]).fetch, getToken })
    await expect(store.getAccessToken()).rejects.toThrow('google-reconnect-needed')
    expect(store.connection.get().state).toBe('reconnect-needed')
  })

  it('connectUrl returns the server-minted url with the JWT attached, sent with credentials', async () => {
    const { fetch, calls } = fakeFetch([{ status: 200, body: { url: 'https://google/auth?x=1' } }])
    const store = createGoogleStore({ baseUrl: BASE, fetch, getToken })
    expect(await store.connectUrl()).toBe('https://google/auth?x=1')
    expect(calls[0].init.headers.Authorization).toBe('Bearer jwt-1')
    // credentials:'include' is required cross-origin so the browser keeps the session-binding
    // cookie the backend's Set-Cookie response header carries — see authed()'s doc comment.
    expect(calls[0].init.credentials).toBe('include')
  })

  it('disconnect POSTs then sets disconnected and clears the token cache', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 200, body: { accessToken: 't1', expiresAt: Date.now() + 3_600_000 } },
      { status: 200, body: { ok: true } },
      { status: 200, body: { accessToken: 't3', expiresAt: Date.now() + 3_600_000 } },
    ])
    const store = createGoogleStore({ baseUrl: BASE, fetch, getToken })
    await store.getAccessToken()
    await store.disconnect()
    expect(calls[1].init.method).toBe('POST')
    expect(store.connection.get().state).toBe('disconnected')
    expect(await store.getAccessToken()).toBe('t3')
  })

  it('disconnect throws on a non-ok response and does not clear the cache or change state', async () => {
    const { fetch } = fakeFetch([
      { status: 200, body: { accessToken: 't1', expiresAt: Date.now() + 3_600_000 } },
      { status: 502 },
    ])
    const store = createGoogleStore({ baseUrl: BASE, fetch, getToken })
    await store.getAccessToken()
    store.connection.set({ state: 'connected', email: 'a@gmail.test' })
    await expect(store.disconnect()).rejects.toThrow('disconnect failed (502)')
    expect(store.connection.get()).toEqual({ state: 'connected', email: 'a@gmail.test' })
    // Cache untouched: no further fetch is issued for a subsequent getAccessToken() call.
    expect(await store.getAccessToken()).toBe('t1')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
