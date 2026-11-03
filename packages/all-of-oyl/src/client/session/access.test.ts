import { describe, expect, it, vi } from 'vitest'
import { createAccessState } from './access.js'
import { ACCESS_KEY } from '../storage/keys.js'
import type { FetchFn } from '../ports.js'

function fakeStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _map: m,
  }
}
const json = (body: unknown, status = 200): FetchFn => vi.fn(async () => new Response(JSON.stringify(body), { status })) as any
const opts = (fetch: FetchFn, userId: number | null = 7) => ({ baseUrl: 'http://x/api', fetch, getToken: async () => 'jwt', userId: () => userId })

describe('createAccessState', () => {
  it('is not admin until the backend says so', () => {
    expect(createAccessState(fakeStorage(), opts(json({}))).admin.get()).toBe(false)
  })

  it('load() asks GET /access with the bearer token and adopts + persists the answer for this user', async () => {
    const storage = fakeStorage()
    const fetch = json({ admin: true }) as any
    const access = createAccessState(storage, opts(fetch))
    await access.load()
    expect(String(fetch.mock.calls[0][0])).toBe('http://x/api/access')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt')
    expect(access.admin.get()).toBe(true)
    expect(JSON.parse(storage._map.get(ACCESS_KEY) as string)).toEqual({ userId: 7, admin: true })
  })

  it('starts from the cached flag only when it belongs to the signed-in user', () => {
    const cached = { [ACCESS_KEY]: JSON.stringify({ userId: 7, admin: true }) }
    expect(createAccessState(fakeStorage(cached), opts(json({}), 7)).admin.get()).toBe(true)
    expect(createAccessState(fakeStorage(cached), opts(json({}), 8)).admin.get()).toBe(false)
    expect(createAccessState(fakeStorage(cached), opts(json({}), null)).admin.get()).toBe(false)
  })

  it('a demotion takes effect on the next load', async () => {
    const storage = fakeStorage({ [ACCESS_KEY]: JSON.stringify({ userId: 7, admin: true }) })
    const access = createAccessState(storage, opts(json({ admin: false })))
    await access.load()
    expect(access.admin.get()).toBe(false)
  })

  it('an unreachable backend keeps the last-known flag; a non-2xx answer (e.g. an older backend 404) revokes it', async () => {
    const seed = { [ACCESS_KEY]: JSON.stringify({ userId: 7, admin: true }) }
    const offline = createAccessState(fakeStorage(seed), opts(vi.fn(async () => { throw new TypeError('offline') }) as any))
    await offline.load()
    expect(offline.admin.get()).toBe(true)
    const missing = createAccessState(fakeStorage(seed), opts(json({}, 404)))
    await missing.load()
    expect(missing.admin.get()).toBe(false)
  })

  it('load() with no signed-in user and clear() both drop the flag', async () => {
    const storage = fakeStorage({ [ACCESS_KEY]: JSON.stringify({ userId: 7, admin: true }) })
    const fetch = json({ admin: true }) as any
    const anon = createAccessState(storage, opts(fetch, null))
    await anon.load()
    expect(fetch).not.toHaveBeenCalled()
    expect(anon.admin.get()).toBe(false)
    const access = createAccessState(storage, opts(json({ admin: true })))
    await access.load()
    access.clear()
    expect(access.admin.get()).toBe(false)
    expect(storage._map.has(ACCESS_KEY)).toBe(false)
  })
})
