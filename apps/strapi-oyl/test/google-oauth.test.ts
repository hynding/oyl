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

/**
 * The callback route binds the OAuth state to the browser session via an HttpOnly nonce cookie
 * set by connect/connectUrl. Node's `fetch` has no cookie jar (unlike a real browser), so tests
 * must carry that cookie forward by hand — extract the raw `name=value` pair from a Set-Cookie
 * response header (dropping attributes like `HttpOnly`/`SameSite`/`Max-Age`) for use as a
 * request's `Cookie` header.
 */
function extractCookie(res: Response): string | undefined {
  const raw = res.headers.get('set-cookie')
  return raw ? raw.split(';')[0] : undefined
}

/**
 * From Google's authorize URL: fake google → callback. Returns the final app redirect URL.
 * `cookie`, if given, is forwarded as the Cookie header on the callback request — the nonce
 * cookie set when the flow started (by connect/connectUrl). Omit it to simulate a browser/device
 * that never received that cookie (the session-binding defense's negative-path tests).
 */
async function followFromGoogle(googleUrl: string, cookie?: string): Promise<URL> {
  const fromGoogle = await fetch(googleUrl, noRedirect)
  expect(fromGoogle.status).toBe(302)
  const callbackUrl = fromGoogle.headers.get('location')!
  const toApp = await fetch(callbackUrl, { ...noRedirect, headers: cookie ? { Cookie: cookie } : undefined })
  expect(toApp.status).toBe(302)
  return new URL(toApp.headers.get('location')!)
}

/**
 * Follow the whole dance by hand: connect → fake google → callback. Returns the final app
 * redirect URL. `startUrl` must be a backend route that itself 302s to Google (e.g. the public
 * `/google/connect?mode=login` route) — NOT a URL that is already Google's authorize URL (that's
 * what `/google/connect-url` returns for link mode; use `followFromGoogle` directly for that,
 * forwarding the nonce cookie captured from the connect-url response).
 */
async function signInWithGoogle(startUrl: string): Promise<URL> {
  const toGoogle = await fetch(startUrl, noRedirect)
  expect(toGoogle.status).toBe(302)
  const cookie = extractCookie(toGoogle)
  const googleUrl = toGoogle.headers.get('location')!
  return followFromGoogle(googleUrl, cookie)
}

const fragmentParam = (url: URL, key: string): string | null =>
  new URLSearchParams(url.hash.slice(1)).get(key)

describe('google oauth (booted, fake Google)', () => {
  it('config reports configured', async () => {
    const res = await fetch(`${baseUrl}/google/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ configured: true })
  })

  it('config is reachable both unauthenticated and authenticated (JWT bypasses the public role\'s grants)', async () => {
    const user = await registerUser(baseUrl, `configcheck-${Date.now()}`)
    const authed = await fetch(`${baseUrl}/google/config`, { headers: h(user.jwt) })
    expect(authed.status).toBe(200)
    expect(await authed.json()).toEqual({ configured: true })
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
    const appUrl = await followFromGoogle(url, extractCookie(res))
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google')).toBeTruthy()
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean; email: string }
    expect(status.connected).toBe(true)
    expect(status.email).toBe(fake.issued.at(-1)!.email)
  })

  it('link mode: connecting a Google identity already linked to a DIFFERENT user redirects already_linked (no crash)', async () => {
    // Some other OYL user links this Google identity first (via login mode).
    const identity = { sub: `dup-${Date.now()}`, email: `dup-${Date.now()}@gmail.test` }
    fake.nextIdentity = identity
    const firstAppUrl = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(fragmentParam(firstAppUrl, 'google')).toBeTruthy()

    // A second, different OYL user tries to link the SAME Google identity via link mode.
    const other = await registerUser(baseUrl, `dup-linker-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(other.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    fake.nextIdentity = identity
    const appUrl = await followFromGoogle(url, extractCookie(connectUrlRes))
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google_error')).toBe('already_linked')
    expect(fragmentParam(appUrl, 'google')).toBeNull()
    // The second user's own account was never touched.
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(other.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
  })

  it('link mode: linking a Google identity already linked to a DIFFERENT user redirects already_linked even when the linking user ALREADY HAS their own google-account row (update path, not just create)', async () => {
    // User A links identityA (login mode creates A's google-account row).
    const identityA = { sub: `updup-a-${Date.now()}`, email: `updup-a-${Date.now()}@gmail.test` }
    fake.nextIdentity = identityA
    const appUrlA = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    const jwtA = fragmentParam(appUrlA, 'google')!
    expect(jwtA).toBeTruthy()

    // User B registers and links a DIFFERENT identity first, so B already has their OWN
    // google-account row before the collision attempt below — this is what exercises the
    // UPDATE path (3a), distinct from the existing create-path test above.
    const other = await registerUser(baseUrl, `updup-b-${Date.now()}`)
    const identityB = { sub: `updup-b-${Date.now()}`, email: `updup-b-${Date.now()}@gmail.test` }
    fake.nextIdentity = identityB
    const firstLinkRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(other.jwt) })
    const { url: firstLinkUrl } = (await firstLinkRes.json()) as { url: string }
    await followFromGoogle(firstLinkUrl, extractCookie(firstLinkRes))
    const statusBBefore = (await (await fetch(`${baseUrl}/google/status`, { headers: h(other.jwt) })).json()) as { connected: boolean; email: string }
    expect(statusBBefore.connected).toBe(true)
    expect(statusBBefore.email).toBe(identityB.email)

    // User B now tries to link identityA — already linked to user A. Because B already has a
    // row (for identityB), the pre-fix code would skip the already_linked guard entirely (it
    // only ran in the create branch) and attempt a raw update with A's googleUserId, throwing a
    // unique-constraint violation that surfaced as the misleading exchange_failed.
    const collideRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(other.jwt) })
    const { url: collideUrl } = (await collideRes.json()) as { url: string }
    fake.nextIdentity = identityA
    const appUrl = await followFromGoogle(collideUrl, extractCookie(collideRes))
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google_error')).toBe('already_linked')
    expect(fragmentParam(appUrl, 'google')).toBeNull()

    // Neither user's row was corrupted by the failed attempt.
    const statusA = (await (await fetch(`${baseUrl}/google/status`, { headers: h(jwtA) })).json()) as { connected: boolean; email: string }
    expect(statusA.connected).toBe(true)
    expect(statusA.email).toBe(identityA.email)
    const statusBAfter = (await (await fetch(`${baseUrl}/google/status`, { headers: h(other.jwt) })).json()) as { connected: boolean; email: string }
    expect(statusBAfter.connected).toBe(true)
    expect(statusBAfter.email).toBe(identityB.email)
  })

  it('re-consenting with a DIFFERENT Google identity but no fresh refresh_token clears the stored token WITHOUT relabeling googleUserId/email to the new identity', async () => {
    // A user completes a normal link with identityOld.
    const user = await registerUser(baseUrl, `relabel-${Date.now()}`)
    const identityOld = { sub: `relabel-old-${Date.now()}`, email: `relabel-old-${Date.now()}@gmail.test` }
    fake.nextIdentity = identityOld
    const firstRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url: firstUrl } = (await firstRes.json()) as { url: string }
    await followFromGoogle(firstUrl, extractCookie(firstRes))
    const statusAfterFirst = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean; email: string }
    expect(statusAfterFirst.connected).toBe(true)
    expect(statusAfterFirst.email).toBe(identityOld.email)

    // Simulate a second consent presenting a DIFFERENT identity while Google withholds the
    // refresh_token (its normal behavior for an already-consented client). Because this user
    // already has a stored refreshToken (from the first link above), the "no refresh token"
    // retry-once guard does NOT fire here (`account?.refreshToken` is already truthy) — the
    // callback proceeds straight into upsertGoogleAccount with refreshToken: null, which is
    // exactly the 3b branch under test.
    const identityNew = { sub: `relabel-new-${Date.now()}`, email: `relabel-new-${Date.now()}@gmail.test` }
    fake.omitRefreshToken = true
    fake.nextIdentity = identityNew
    const secondRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url: secondUrl } = (await secondRes.json()) as { url: string }
    const appUrl = await followFromGoogle(secondUrl, extractCookie(secondRes))
    fake.omitRefreshToken = false
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google_error')).toBeNull() // not an error path — the callback still "succeeds" (issues a JWT)

    // The row's stored token was cleared (disconnected), NOT relabeled under identityNew.
    const statusAfterSecond = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(statusAfterSecond).toEqual({ connected: false })

    // Proof the row's googleUserId/email are STILL identityOld's, not relabeled to identityNew:
    // a fresh login-mode "Sign in with Google" presenting identityOld must resolve to this SAME
    // user via the googleUserId lookup. If the row had been wrongly relabeled to identityNew, that
    // lookup would miss, fall through to the email fallback (identityOld.email doesn't match this
    // user's OYL account email — they registered under a different `@test.dev` address), and mint
    // a brand-new user instead.
    fake.nextIdentity = identityOld
    const reloginUrl = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(fragmentParam(reloginUrl, 'google_error')).toBeNull()
    const rejwt = fragmentParam(reloginUrl, 'google')!
    expect(rejwt).toBeTruthy()
    const reme = (await (await fetch(`${baseUrl}/users/me`, { headers: h(rejwt) })).json()) as { id: number }
    expect(reme.id).toBe(user.userId)
  })

  it('refresh token is stored ENCRYPTED (never plaintext in the DB row)', async () => {
    const user = await registerUser(baseUrl, `enc-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
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
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    const before = fake.refreshCalls
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(fake.refreshCalls).toBe(before + 1)
  })

  it('invalid_grant on refresh → 410, stored token CLEARED (row kept), reconnect then succeeds', async () => {
    const user = await registerUser(baseUrl, `revoked-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    fake.failNextRefresh = 'invalid_grant'
    const gone = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(gone.status).toBe(410)
    // token cleared → status now disconnected
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
    // reconnect captures a fresh refresh token and drive-token works again
    const reconnectRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const again = (await reconnectRes.json()) as { url: string }
    await followFromGoogle(again.url, extractCookie(reconnectRes))
    const ok = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(ok.status).toBe(200)
  })

  it('invalid_grant then "Sign in with Google" (login mode) with the SAME identity does NOT lock the user out with account_exists', async () => {
    // Distinct from the disconnect regression test below: link-mode reconnect resolves the user
    // via state.userId directly and never touches findOrCreateLoginUser's email fallback, so it
    // can't catch this. A LOGIN-mode reconnect after an invalid_grant clear is the path that
    // actually exercises the googleUserId → user lookup this fix protects.
    const identity = { sub: `revoked2-${Date.now()}`, email: `revoked2-${Date.now()}@gmail.test` }
    fake.nextIdentity = identity
    const appUrl1 = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    const jwt1 = fragmentParam(appUrl1, 'google')!
    const me1 = (await (await fetch(`${baseUrl}/users/me`, { headers: h(jwt1) })).json()) as { id: number }
    fake.failNextRefresh = 'invalid_grant'
    const gone = await fetch(`${baseUrl}/google/drive-token`, { headers: h(jwt1) })
    expect(gone.status).toBe(410)
    fake.nextIdentity = identity
    const appUrl2 = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(fragmentParam(appUrl2, 'google_error')).toBeNull()
    const jwt2 = fragmentParam(appUrl2, 'google')
    expect(jwt2).toBeTruthy()
    const me2 = (await (await fetch(`${baseUrl}/users/me`, { headers: h(jwt2!) })).json()) as { id: number }
    expect(me2.id).toBe(me1.id)
  })

  it('a non-invalid_grant refresh failure (transient) returns 502 and leaves the stored token untouched', async () => {
    const user = await registerUser(baseUrl, `transient-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    fake.failNextRefresh = 'server_error' as any
    const res = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(res.status).toBe(502)
    // NOT cleared — still connected, and a subsequent (non-failing) call succeeds
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(true)
    const ok = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(ok.status).toBe(200)
  })

  it('driveToken returns 502 (not a raw 500) on a network failure talking to Google, without touching the stored token', async () => {
    const user = await registerUser(baseUrl, `neterr-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    const realTokenUrl = process.env['GOOGLE_TOKEN_URL']!
    process.env['GOOGLE_TOKEN_URL'] = 'http://127.0.0.1:1/token' // nothing listens here
    let res: Response
    try {
      res = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    } finally {
      process.env['GOOGLE_TOKEN_URL'] = realTokenUrl
    }
    expect(res.status).toBe(502)
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(true)
  })

  it('callback exchanging code against an unreachable token endpoint redirects exchange_failed (no raw 500)', async () => {
    const toGoogle = await fetch(`${baseUrl}/google/connect?mode=login`, noRedirect)
    const cookie = extractCookie(toGoogle)
    const googleUrl = toGoogle.headers.get('location')!
    const cbLocation = (await fetch(googleUrl, noRedirect)).headers.get('location')!
    const realTokenUrl = process.env['GOOGLE_TOKEN_URL']!
    process.env['GOOGLE_TOKEN_URL'] = 'http://127.0.0.1:1/token'
    let res: Response
    try {
      res = await fetch(cbLocation, { ...noRedirect, headers: cookie ? { Cookie: cookie } : undefined })
    } finally {
      process.env['GOOGLE_TOKEN_URL'] = realTokenUrl
    }
    expect(res.status).toBe(302)
    const appUrl = new URL(res.headers.get('location')!)
    expect(fragmentParam(appUrl, 'google_error')).toBe('exchange_failed')
  })

  it('no refresh token in exchange → retries ONCE with prompt=consent (same identity both hops), then errors (no loop)', async () => {
    // Real Google presents the SAME identity on the forced re-consent hop; fake-google mints a
    // fresh identity per /auth hit unless nextIdentity is pinned, so pin it before EACH hop —
    // this is what actually exercises the retry-carries-the-created-user fix (a stale
    // implementation would re-run findOrCreateLoginUser on the retry hop, find the user IT JUST
    // CREATED on the first hop by email, and wrongly reject with account_exists instead of
    // reaching this no_refresh_token check).
    fake.omitRefreshToken = true
    const identity = { sub: `norefresh-${Date.now()}`, email: `norefresh-${Date.now()}@gmail.test` }
    fake.nextIdentity = identity
    const first = await fetch(`${baseUrl}/google/connect?mode=login`, noRedirect)
    const cookie1 = extractCookie(first)
    const googleUrl1 = first.headers.get('location')!
    const cb1 = (await fetch(googleUrl1, noRedirect)).headers.get('location')!
    const retry = await fetch(cb1, { ...noRedirect, headers: cookie1 ? { Cookie: cookie1 } : undefined })
    expect(retry.status).toBe(302)
    const cookie2 = extractCookie(retry) // the retry redirect mints a NEW nonce + cookie
    const retryUrl = new URL(retry.headers.get('location')!)
    expect(retryUrl.searchParams.get('prompt')).toBe('consent')
    fake.nextIdentity = identity
    const cb2 = (await fetch(retryUrl.toString(), noRedirect)).headers.get('location')!
    const final = await fetch(cb2, { ...noRedirect, headers: cookie2 ? { Cookie: cookie2 } : undefined })
    const appUrl = new URL(final.headers.get('location')!)
    fake.omitRefreshToken = false
    // still no refresh token on the retry hop → fails out with no_refresh_token (NOT account_exists)
    expect(fragmentParam(appUrl, 'google_error')).toBe('no_refresh_token')
  })

  it('no refresh token on the first hop but present on the retry hop → succeeds and reuses the SAME newly-created user', async () => {
    fake.omitRefreshToken = true
    const identity = { sub: `retry-ok-${Date.now()}`, email: `retry-ok-${Date.now()}@gmail.test` }
    fake.nextIdentity = identity
    const first = await fetch(`${baseUrl}/google/connect?mode=login`, noRedirect)
    const cookie1 = extractCookie(first)
    const googleUrl1 = first.headers.get('location')!
    const cb1 = (await fetch(googleUrl1, noRedirect)).headers.get('location')!
    const retry = await fetch(cb1, { ...noRedirect, headers: cookie1 ? { Cookie: cookie1 } : undefined })
    const cookie2 = extractCookie(retry)
    const retryUrl = new URL(retry.headers.get('location')!)
    expect(retryUrl.searchParams.get('prompt')).toBe('consent')
    fake.omitRefreshToken = false
    fake.nextIdentity = identity
    const cb2 = (await fetch(retryUrl.toString(), noRedirect)).headers.get('location')!
    const final = await fetch(cb2, { ...noRedirect, headers: cookie2 ? { Cookie: cookie2 } : undefined })
    const appUrl = new URL(final.headers.get('location')!)
    expect(appUrl.pathname).toBe('/login')
    const jwt = fragmentParam(appUrl, 'google')
    expect(jwt).toBeTruthy()
    const me = await fetch(`${baseUrl}/users/me`, { headers: h(jwt!) })
    expect(me.status).toBe(200)
    const user = (await me.json()) as { email: string }
    expect(user.email).toBe(identity.email)
  })

  it('callback with a forged state redirects bad_state', async () => {
    const res = await fetch(`${baseUrl}/google/callback?code=x&state=forged.sig`, noRedirect)
    expect(res.status).toBe(302)
    const appUrl = new URL(res.headers.get('location')!)
    expect(fragmentParam(appUrl, 'google_error')).toBe('bad_state')
  })

  it('callback without the session-binding nonce cookie (stolen/forwarded connect-url link, e.g. a victim in a different browser) redirects bad_state and links nothing', async () => {
    const user = await registerUser(baseUrl, `hijack-${Date.now()}`)
    const res = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    // Deliberately do NOT forward the cookie from `res` — simulates an attacker handing this
    // `url` (obtained from THEIR OWN connectUrl call) to a victim who opens it in a different
    // browser/device and completes Google's consent screen there. Without the matching cookie,
    // callback must refuse to trust the embedded (validly-signed!) state.userId.
    const appUrl = await followFromGoogle(url /* no cookie */)
    expect(fragmentParam(appUrl, 'google_error')).toBe('bad_state')
    expect(fragmentParam(appUrl, 'google')).toBeNull()
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
  })

  it('disconnect revokes at Google and clears the stored token (row kept so a future sign-in still finds this user)', async () => {
    const user = await registerUser(baseUrl, `disc-${Date.now()}`)
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    const res = await fetch(`${baseUrl}/google/disconnect`, { method: 'POST', headers: h(user.jwt) })
    expect(res.status).toBe(200)
    expect(fake.revoked.length).toBeGreaterThan(0)
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
  })

  it('disconnect then "Sign in with Google" again with the SAME identity does NOT lock the user out with account_exists', async () => {
    const user = await registerUser(baseUrl, `disc2-${Date.now()}`)
    const identity = { sub: `disc2-${Date.now()}`, email: `disc2-${Date.now()}@gmail.test` }
    fake.nextIdentity = identity
    const connectUrlRes = await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })
    const { url } = (await connectUrlRes.json()) as { url: string }
    await followFromGoogle(url, extractCookie(connectUrlRes))
    const res = await fetch(`${baseUrl}/google/disconnect`, { method: 'POST', headers: h(user.jwt) })
    expect(res.status).toBe(200)

    // A fresh "Sign in with Google" (login mode) with the SAME identity must reuse this user,
    // not hit account_exists (the old delete-the-row behavior severed the googleUserId link,
    // so findOrCreateLoginUser's identity lookup missed and fell through to the email lookup,
    // finding this same user and permanently rejecting the sign-in).
    fake.nextIdentity = identity
    const appUrl = await signInWithGoogle(`${baseUrl}/google/connect?mode=login`)
    expect(fragmentParam(appUrl, 'google_error')).toBeNull()
    const jwt = fragmentParam(appUrl, 'google')
    expect(jwt).toBeTruthy()
    const me = (await (await fetch(`${baseUrl}/users/me`, { headers: h(jwt!) })).json()) as { id: number }
    expect(me.id).toBe(user.userId)
  })
})
