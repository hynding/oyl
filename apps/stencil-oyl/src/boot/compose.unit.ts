import { describe, expect, it } from 'vitest'
import { AUTH_KEY, API_BASE_URL_KEY, STORAGE_MODE_KEY } from '@oyl/all-of-oyl/client'
import { createApp } from './compose.js'
import type { BootWindow } from './types.js'

/** A Storage over a Map (happy-dom is not loaded in the unit project). */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed))
  return {
    get length() { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  }
}

const ORIGIN = 'http://localhost:8043'
const API = 'http://localhost:1341/api'

/** A BootWindow over an in-memory history stack and a scripted fetch. */
function fakeWindow(initialPath: string, opts: { storage?: Storage; fetch?: typeof fetch } = {}) {
  let current = new URL(initialPath, ORIGIN)
  const entries: string[] = [current.pathname + current.search]
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const calls: string[] = []
  const win = {
    location: {
      get pathname() { return current.pathname }, get search() { return current.search }, get hash() { return current.hash },
      origin: ORIGIN, hostname: 'localhost',
      reload: () => calls.push('reload'), assign: (u: string) => calls.push(`assign:${u}`),
    },
    history: {
      scrollRestoration: 'auto',
      pushState: (_d: unknown, _u: string, url: string) => { current = new URL(url, current); entries.push(current.pathname + current.search); calls.push(`push:${url}`) },
      replaceState: (_d: unknown, _u: string, url: string) => { current = new URL(url, current); entries[entries.length - 1] = current.pathname + current.search; calls.push(`replace:${url}`) },
    },
    URL,
    navigator: { onLine: true },
    document: { title: '', querySelector: () => null, documentElement: { dataset: {}, style: { colorScheme: '' } }, addEventListener() {}, removeEventListener() {} },
    localStorage: opts.storage ?? memoryStorage(),
    sessionStorage: memoryStorage(),
    fetch: opts.fetch ?? (async () => new Response('{}', { status: 404 })),
    addEventListener: (t: string, fn: (e: unknown) => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(fn) },
    removeEventListener: (t: string, fn: (e: unknown) => void) => { listeners.get(t)?.delete(fn) },
  }
  return { win: win as unknown as BootWindow, entries, calls, listeners }
}

const remoteSignedOut = () => memoryStorage({ [STORAGE_MODE_KEY]: 'remote', [API_BASE_URL_KEY]: API })
const remoteSignedIn = () =>
  memoryStorage({ [STORAGE_MODE_KEY]: 'remote', [API_BASE_URL_KEY]: API, [AUTH_KEY]: JSON.stringify({ token: 't', user: { id: 1, username: 'u', email: 'u@x' } }) })

/** A fetch that answers the boot's requests: /bootstrap (empty), /users (profile list), /google/config. */
function apiFetch(log: string[], bootstrap: Record<string, unknown[]> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    log.push(url.replace(API, ''))
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/bootstrap')) return json({ data: bootstrap })
    if (url.includes('/users')) return json({ data: [], meta: {} })
    if (url.includes('/google/config')) return json({ data: { configured: false } })
    return json({ data: [], meta: {} })
  }) as typeof fetch
}

describe('createApp boot order', () => {
  it('remote mode with no session: redirects to /login with replaceState before any API call', async () => {
    const log: string[] = []
    const { win, calls } = fakeWindow('/journal', { storage: remoteSignedOut(), fetch: apiFetch(log) })
    const app = await createApp(win)
    expect(app.routeState.route.get()).toBe('login')
    expect(calls).toContain('replace:/login')
    expect(calls.some((c) => c.startsWith('push:'))).toBe(false)
    expect(log.filter((u) => u.includes('bootstrap'))).toEqual([])
  })

  it('with a session: boots from one /bootstrap and lands on the requested route', async () => {
    const log: string[] = []
    const { win } = fakeWindow('/status', { storage: remoteSignedIn(), fetch: apiFetch(log) })
    const app = await createApp(win)
    expect(app.routeState.route.get()).toBe('status')
    expect(log.filter((u) => u.endsWith('/bootstrap'))).toHaveLength(1)
    expect(app.dataState.counts.get()).toBeTypeOf('object')
    expect(app.mode).toBe('remote')
    expect(app.apiBase).toBe(API)
  })

  it("'/' redirects to '/status' (keeping the query)", async () => {
    const log: string[] = []
    const { win, calls } = fakeWindow('/?x=1', { storage: remoteSignedIn(), fetch: apiFetch(log) })
    const app = await createApp(win)
    expect(app.routeState.route.get()).toBe('status')
    expect(calls).toContain('replace:/status?x=1')
  })

  it('a dead backend surfaces the reach-failure notice instead of throwing', async () => {
    const failing = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    const { win } = fakeWindow('/status', { storage: remoteSignedIn(), fetch: failing })
    const app = await createApp(win)
    expect(app.noticeState.notice.get()).toMatch(/Couldn't reach the backend/)
  })

  it('adopts a #google= session before the guard runs and lands on /status', async () => {
    const log: string[] = []
    const base = apiFetch(log)
    const withMe = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/users/me')) return new Response(JSON.stringify({ id: 7, username: 'g', email: 'g@x' }), { status: 200 })
      return base(input, init)
    }) as typeof fetch
    const { win, calls } = fakeWindow('/login#google=JWT', { storage: remoteSignedOut(), fetch: withMe })
    const app = await createApp(win)
    expect(app.authState.session.get()?.user.username).toBe('g')
    expect(app.routeState.route.get()).toBe('status')
    // The last history write is the post-adoption redirect, not the guard's /login.
    expect(calls.filter((c) => c.startsWith('replace:')).at(-1)).toBe('replace:/status')
    // Hash removed from history (never survives into a shared link).
    expect(win.location.hash).toBe('')
  })

  it('exposes the connection settings and onAuthenticated wiring', async () => {
    const log: string[] = []
    const { win, calls } = fakeWindow('/status', { storage: remoteSignedIn(), fetch: apiFetch(log) })
    const app = await createApp(win)
    expect(app.connection).toMatchObject({ mode: 'remote', apiBaseUrl: API })
    app.connection.onApply('remote', 'http://x/api')
    expect(app.storage.getItem(API_BASE_URL_KEY)).toBe('http://x/api')
    expect(calls).toContain('reload')
    app.onAuthenticated()
    expect(calls).toContain('assign:/status')
  })
})
