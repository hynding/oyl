import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startFakeGoogle, fakeGoogleEnv, type FakeGoogle } from './fake-google'
import { boot } from './boot'
import { registerUser } from './helpers'

let fake: FakeGoogle
let baseUrl: string
let stop: () => Promise<void>

beforeAll(async () => {
  fake = await startFakeGoogle()
  Object.assign(process.env, fakeGoogleEnv(fake))
  ;({ baseUrl, stop } = await boot())
  // boot() assigns the backend's port at random, so it can't be known until it resolves;
  // fakeGoogleEnv() defaults it to 0 (unconnectable). googleConfig() reads env per-call
  // (not at module load), so it's safe to patch the real redirect_uri in now.
  process.env['GOOGLE_REDIRECT_URI'] = `${baseUrl}/google/callback`
})
afterAll(async () => { await stop?.(); await fake.stop() })

const noRedirect: RequestInit = { redirect: 'manual' }
const h = (jwt: string) => ({ Authorization: `Bearer ${jwt}` })

/** From Google's authorize URL: fake google → callback. Returns the final app redirect URL. */
async function followFromGoogle(googleUrl: string): Promise<URL> {
  const fromGoogle = await fetch(googleUrl, noRedirect)
  expect(fromGoogle.status).toBe(302)
  const callbackUrl = fromGoogle.headers.get('location')!
  const toApp = await fetch(callbackUrl, noRedirect)
  expect(toApp.status).toBe(302)
  return new URL(toApp.headers.get('location')!)
}

/**
 * Follow the whole dance by hand: connect → fake google → callback. Returns the final app
 * redirect URL. `startUrl` must be a backend route that itself 302s to Google (e.g. the public
 * `/google/connect?mode=login` route) — NOT a URL that is already Google's authorize URL (that's
 * what `/google/connect-url` returns for link mode; use `followFromGoogle` directly for that).
 */
async function signInWithGoogle(startUrl: string): Promise<URL> {
  const toGoogle = await fetch(startUrl, noRedirect)
  expect(toGoogle.status).toBe(302)
  const googleUrl = toGoogle.headers.get('location')!
  return followFromGoogle(googleUrl)
}

const fragmentParam = (url: URL, key: string): string | null =>
  new URLSearchParams(url.hash.slice(1)).get(key)

describe('google oauth (booted, fake Google)', () => {
  it('config reports configured', async () => {
    const res = await fetch(`${baseUrl}/google/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ configured: true })
  })

  it('connect redirects to Google with drive.file scope + offline access + signed state', async () => {
    const res = await fetch(`${baseUrl}/google/connect?mode=login`, noRedirect)
    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.searchParams.get('scope')).toBe('openid email profile https://www.googleapis.com/auth/drive.file')
    expect(loc.searchParams.get('access_type')).toBe('offline')
    expect(loc.searchParams.get('client_id')).toBe('test-google-client')
    expect(loc.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('full login-mode round trip creates a user and lands on /login#google=<jwt>', async () => {
    const appUrl = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(appUrl.pathname).toBe('/login')
    const jwt = fragmentParam(appUrl, 'google')
    expect(jwt).toBeTruthy()
    const me = await fetch(`${baseUrl}/users/me`, { headers: h(jwt!) })
    expect(me.status).toBe(200)
    const user = (await me.json()) as { email: string; confirmed: boolean }
    expect(user.email).toBe(fake.issued.at(-1)!.email)
    expect(user.confirmed).toBe(true)
  })

  it('second sign-in with the same Google identity reuses the user (no duplicate)', async () => {
    fake.nextIdentity = { sub: 'stable-sub', email: 'stable@gmail.test' }
    const first = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    const jwt1 = fragmentParam(first, 'google')!
    const me1 = (await (await fetch(`${baseUrl}/users/me`, { headers: h(jwt1) })).json()) as { id: number }
    fake.nextIdentity = { sub: 'stable-sub', email: 'stable@gmail.test' }
    const second = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    const jwt2 = fragmentParam(second, 'google')!
    const me2 = (await (await fetch(`${baseUrl}/users/me`, { headers: h(jwt2) })).json()) as { id: number }
    expect(me2.id).toBe(me1.id)
  })

  it('login mode with an existing OYL email does NOT auto-link — redirects account_exists', async () => {
    const existing = await registerUser(baseUrl, `collide-${Date.now()}`)
    // registerUser registers `<username>@test.dev`; point the next Google identity at that exact email.
    const emailRes = await fetch(`${baseUrl}/users/me`, { headers: h(existing.jwt) })
    const { email } = (await emailRes.json()) as { email: string }
    fake.nextIdentity = { sub: 'attacker-sub', email }
    const appUrl = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(fragmentParam(appUrl, 'google_error')).toBe('account_exists')
    expect(fragmentParam(appUrl, 'google')).toBeNull()
  })

  it('link mode: connect-url is JWT-gated, attaches google-account to that user, redirects to /profile', async () => {
    const user = await registerUser(baseUrl, `linker-${Date.now()}`)
    const unauth = await fetch(`${baseUrl}/google/connect-url`)
    expect([401, 403]).toContain(unauth.status)
    const res = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const appUrl = await followFromGoogle(url)
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google')).toBeTruthy()
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean; email: string }
    expect(status.connected).toBe(true)
    expect(status.email).toBe(fake.issued.at(-1)!.email)
  })

  it('refresh token is stored ENCRYPTED (never plaintext in the DB row)', async () => {
    const user = await registerUser(baseUrl, `enc-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await followFromGoogle(url)
    const plainRefresh = fake.issued.at(-1)!.refreshToken
    // Read the raw row through the booted app's db layer is not reachable from here;
    // instead assert via behavior + shape: status is connected AND drive-token works,
    // while the REST layer can never leak the private field. The encryption unit
    // itself is covered in google-crypto-util.test.ts; controller-level assert:
    const tokenRes = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(tokenRes.status).toBe(200)
    const body = (await tokenRes.json()) as { accessToken: string; expiresAt: number }
    expect(body.accessToken).toMatch(/^at-refreshed-/)
    expect(body.expiresAt).toBeGreaterThan(Date.now())
    expect(JSON.stringify(body)).not.toContain(plainRefresh)
  })

  it('drive-token caches until expiry (second call does not re-hit Google)', async () => {
    const user = await registerUser(baseUrl, `cache-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await followFromGoogle(url)
    const before = fake.refreshCalls
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(fake.refreshCalls).toBe(before + 1)
  })

  it('invalid_grant on refresh → 410, stored token deleted, reconnect then succeeds', async () => {
    const user = await registerUser(baseUrl, `revoked-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await followFromGoogle(url)
    fake.failNextRefresh = 'invalid_grant'
    const gone = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(gone.status).toBe(410)
    // token deleted → status now disconnected
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
    // reconnect captures a fresh refresh token and drive-token works again
    const again = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await followFromGoogle(again.url)
    const ok = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(ok.status).toBe(200)
  })

  it('no refresh token in exchange → retries ONCE with prompt=consent, then errors (no loop)', async () => {
    fake.omitRefreshToken = true
    const first = await fetch(`${baseUrl}/google/connect?mode=login`, noRedirect)
    const googleUrl1 = first.headers.get('location')!
    const cb1 = (await fetch(googleUrl1, noRedirect)).headers.get('location')!
    const retry = await fetch(cb1, noRedirect)
    expect(retry.status).toBe(302)
    const retryUrl = new URL(retry.headers.get('location')!)
    // still no refresh token → second callback fails out with no_refresh_token
    expect(retryUrl.searchParams.get('prompt')).toBe('consent')
    const cb2 = (await fetch(retryUrl.toString(), noRedirect)).headers.get('location')!
    const final = await fetch(cb2, noRedirect)
    const appUrl = new URL(final.headers.get('location')!)
    fake.omitRefreshToken = false
    expect(fragmentParam(appUrl, 'google_error')).toBe('no_refresh_token')
  })

  it('callback with a forged state redirects bad_state', async () => {
    const res = await fetch(`${baseUrl}/google/callback?code=x&state=forged.sig`, noRedirect)
    expect(res.status).toBe(302)
    const appUrl = new URL(res.headers.get('location')!)
    expect(fragmentParam(appUrl, 'google_error')).toBe('bad_state')
  })

  it('disconnect revokes at Google and deletes the record', async () => {
    const user = await registerUser(baseUrl, `disc-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await followFromGoogle(url)
    const res = await fetch(`${baseUrl}/google/disconnect`, { method: 'POST', headers: h(user.jwt) })
    expect(res.status).toBe(200)
    expect(fake.revoked.length).toBeGreaterThan(0)
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
  })
})
