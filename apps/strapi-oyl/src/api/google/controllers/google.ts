import type { Core } from '@strapi/strapi'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { googleConfig } from '../../../utils/google-config'
import { encryptToken, decryptToken, signState, verifyState, type OauthState } from '../../../utils/google-crypto'

declare const strapi: Core.Strapi

const GOOGLE_ACCOUNT_UID = 'api::google-account.google-account' as const
const USER_UID = 'plugin::users-permissions.user' as const
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'
const STATE_TTL_MS = 10 * 60 * 1000
const OAUTH_NONCE_COOKIE = 'oyl_oauth_nonce'

type GoogleAccountRow = { id: number; googleUserId: string; email: string | null; scopes: string | null; refreshToken: string | null; user?: { id: number } }
type UserRow = { id: number; email: string; username: string }

/** In-process per-user access-token cache; cleared on disconnect/invalid_grant. Lost on restart (harmless). */
const tokenCache = new Map<number, { accessToken: string; expiresAt: number }>()

/**
 * Bind the OAuth state to the browser that started the flow (CSRF / account-link hijack
 * defense). Without this, a validly-SIGNED state.userId (from an attacker's own connectUrl
 * call) would be trusted at callback time regardless of which browser presents it — letting an
 * attacker mint a link-mode URL, get a victim to complete Google's consent screen on it, and
 * have the victim's Google/Drive access attached to the ATTACKER's OYL account. The nonce cookie
 * is HttpOnly (no JS access) and set only by connect/connectUrl, on the same response that hands
 * out the authorize URL — a different browser/device never receives it.
 */
function setNonceCookie(ctx: any, nonce: string) {
  ctx.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    maxAge: STATE_TTL_MS,
  })
}

function clearNonceCookie(ctx: any) {
  ctx.cookies.set(OAUTH_NONCE_COOKIE, null, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
  })
}

function nonceMatches(cookieNonce: string | undefined, stateNonce: string): boolean {
  if (!cookieNonce) return false
  const a = Buffer.from(cookieNonce)
  const b = Buffer.from(stateNonce)
  return a.length === b.length && timingSafeEqual(a, b)
}

function authorizeUrl(state: OauthState, opts: { prompt?: 'consent' } = {}): string {
  const c = googleConfig()
  const url = new URL(c.authBaseUrl)
  url.searchParams.set('client_id', c.clientId)
  url.searchParams.set('redirect_uri', c.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('access_type', 'offline')
  if (opts.prompt) url.searchParams.set('prompt', opts.prompt)
  url.searchParams.set('state', signState(state))
  return url.toString()
}

const appPath = (mode: 'login' | 'link') => (mode === 'link' ? '/profile' : '/login')
const errorRedirect = (mode: 'login' | 'link', code: string) => `${googleConfig().appUrl}${appPath(mode)}#google_error=${code}`

/** Never throws — a DNS blip or truncated response mid-exchange must fail soft (caller redirects exchange_failed), not 500 the browser mid-redirect-from-Google. */
async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string | null; idPayload: { sub: string; email?: string; aud?: string } } | null> {
  const c = googleConfig()
  try {
    const res = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: c.clientId, client_secret: c.clientSecret,
        redirect_uri: c.redirectUri, grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string }
    if (!body.access_token || !body.id_token) return null
    const segments = body.id_token.split('.')
    if (segments.length < 2) return null
    // The token came directly from Google's token endpoint over TLS — decode, then check aud.
    let idPayload: { sub: string; email?: string; aud?: string }
    try { idPayload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) } catch { return null }
    if (idPayload.aud !== c.clientId || !idPayload.sub) return null
    return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null, idPayload }
  } catch {
    return null
  }
}

async function findOrCreateLoginUser(idPayload: { sub: string; email?: string }): Promise<{ user: UserRow } | { error: 'account_exists' }> {
  const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { googleUserId: idPayload.sub }, populate: { user: true } })) as GoogleAccountRow | null
  if (account?.user) {
    const user = (await strapi.db.query(USER_UID).findOne({ where: { id: account.user.id } })) as UserRow
    return { user }
  }
  const email = idPayload.email ?? `${idPayload.sub}@google-user.invalid`
  const existing = (await strapi.db.query(USER_UID).findOne({ where: { email } })) as UserRow | null
  // NO silent auto-link: OYL registration never verifies email, so linking here would let an
  // attacker pre-register a victim's email and capture their Google/Drive connection.
  if (existing) return { error: 'account_exists' }
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })) as { id: number } | null
  const localPart = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '') || 'google-user'
  const user = (await strapi.db.query(USER_UID).create({
    data: {
      username: `${localPart}-${randomBytes(3).toString('hex')}`,
      email,
      provider: 'google',
      password: randomBytes(24).toString('base64url'),
      confirmed: true,
      blocked: false,
      ...(role ? { role: role.id } : {}),
    },
  })) as UserRow
  return { user }
}

/**
 * Create or update the google-account row for this user. Returns `already_linked` (instead of
 * throwing a unique-constraint violation) when the Google identity is already tied to a
 * DIFFERENT OYL user — this can only happen in link mode, since login mode always resolves the
 * owning user via the same googleUserId lookup first.
 */
async function upsertGoogleAccount(userId: number, idPayload: { sub: string; email?: string }, refreshToken: string | null): Promise<{ ok: true } | { error: 'already_linked' }> {
  const data: Record<string, unknown> = {
    googleUserId: idPayload.sub,
    email: idPayload.email ?? null,
    scopes: SCOPES,
    connectedAt: new Date().toISOString(),
    user: userId,
    ...(refreshToken ? { refreshToken: encryptToken(refreshToken) } : {}),
  }
  const existing = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: userId } } })) as GoogleAccountRow | null
  if (existing) {
    await strapi.db.query(GOOGLE_ACCOUNT_UID).update({ where: { id: existing.id }, data })
    return { ok: true }
  }
  const byGoogleId = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { googleUserId: idPayload.sub } })) as GoogleAccountRow | null
  if (byGoogleId) return { error: 'already_linked' }
  await strapi.db.query(GOOGLE_ACCOUNT_UID).create({ data })
  return { ok: true }
}

export default {
  config(ctx: any) {
    ctx.body = { configured: googleConfig().configured }
  },

  connect(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    // Public connect is LOGIN mode only; link mode goes through the JWT-gated connectUrl.
    const state: OauthState = { nonce: randomUUID(), mode: 'login', retried: false, exp: Date.now() + STATE_TTL_MS }
    setNonceCookie(ctx, state.nonce)
    ctx.redirect(authorizeUrl(state))
  },

  connectUrl(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()
    const state: OauthState = { nonce: randomUUID(), mode: 'link', retried: false, userId: me, exp: Date.now() + STATE_TTL_MS }
    setNonceCookie(ctx, state.nonce)
    ctx.body = { url: authorizeUrl(state) }
  },

  async callback(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const { code, state: rawState, error } = ctx.request.query as Record<string, string | undefined>
    const state = rawState ? verifyState(rawState, Date.now()) : null
    try {
      if (!state) return ctx.redirect(errorRedirect('login', 'bad_state'))

      // Session-binding check (see setNonceCookie doc comment) — done BEFORE trusting anything
      // else in `state` (mode/userId included), so a stolen/forwarded connect-url link can't be
      // completed from a browser/device that never received the matching cookie. On success we
      // deliberately do NOT clear the cookie here: the retry branch below overwrites it with a
      // fresh nonce for the SAME cookie name, and issuing both a clear and a fresh Set-Cookie on
      // one response yields two same-name headers, of which `Headers.get()` only surfaces the
      // first — losing the fresh value. Leaving it be otherwise is harmless: state.exp (10 min)
      // already bounds any replay window, and the cookie's own maxAge expires it besides.
      const cookieNonce = ctx.cookies.get(OAUTH_NONCE_COOKIE) as string | undefined
      if (!nonceMatches(cookieNonce, state.nonce)) {
        clearNonceCookie(ctx)
        return ctx.redirect(errorRedirect('login', 'bad_state'))
      }

      if (error) return ctx.redirect(errorRedirect(state.mode, 'denied'))
      if (!code) return ctx.redirect(errorRedirect(state.mode, 'exchange_failed'))

      const exchanged = await exchangeCode(code)
      if (!exchanged) return ctx.redirect(errorRedirect(state.mode, 'exchange_failed'))
      const { idPayload, refreshToken } = exchanged

      // `state.userId` is set for BOTH link mode (from the start) and a login-mode
      // no_refresh_token retry hop (minted below) — either way we already know exactly which
      // user this is and must not re-run findOrCreateLoginUser (its email fallback would find
      // the very user this same flow just created/is acting as, and reject it as account_exists).
      // Only a genuine first-hit login-mode callback (no userId yet) resolves via identity lookup.
      let user: UserRow
      if (state.userId != null) {
        const row = (await strapi.db.query(USER_UID).findOne({ where: { id: state.userId } })) as UserRow | null
        if (!row) return ctx.redirect(errorRedirect(state.mode, 'bad_state'))
        user = row
      } else {
        const found = await findOrCreateLoginUser(idPayload)
        if ('error' in found) return ctx.redirect(errorRedirect(state.mode, found.error))
        user = found.user
      }

      // Google returns refresh_token only on first consent (or prompt=consent). If we got none
      // and hold none, retry ONCE with forced consent; a second miss fails out (no loop).
      if (!refreshToken) {
        const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: user.id } } })) as GoogleAccountRow | null
        if (!account?.refreshToken) {
          if (state.retried) return ctx.redirect(errorRedirect(state.mode, 'no_refresh_token'))
          const retryState: OauthState = { ...state, nonce: randomUUID(), retried: true, userId: user.id, exp: Date.now() + STATE_TTL_MS }
          // A fresh nonce for the retry hop needs its own cookie — the original was already
          // consumed above.
          setNonceCookie(ctx, retryState.nonce)
          return ctx.redirect(authorizeUrl(retryState, { prompt: 'consent' }))
        }
      }

      const upserted = await upsertGoogleAccount(user.id, idPayload, refreshToken)
      if ('error' in upserted) return ctx.redirect(errorRedirect(state.mode, upserted.error))
      tokenCache.delete(user.id)
      const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id }) as string
      ctx.redirect(`${googleConfig().appUrl}${appPath(state.mode)}#google=${jwt}`)
    } catch {
      // Nothing may escape this route as a raw 500 — the browser is mid-redirect FROM Google.
      ctx.redirect(errorRedirect(state?.mode ?? 'login', 'exchange_failed'))
    }
  },

  async driveToken(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()
    const cached = tokenCache.get(me)
    if (cached && cached.expiresAt - 30_000 > Date.now()) { ctx.body = cached; return }

    const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: me } } })) as GoogleAccountRow | null
    if (!account?.refreshToken) return ctx.notFound('google not connected')

    const c = googleConfig()
    let res: Response
    try {
      res = await fetch(c.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: decryptToken(account.refreshToken),
          client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token',
        }),
      })
    } catch {
      // Network failure talking to Google — transient. Leave the stored token untouched.
      ctx.status = 502
      ctx.body = { error: 'google_unavailable' }
      return
    }
    if (!res.ok) {
      let errCode: string | undefined
      try { errCode = ((await res.json()) as { error?: string }).error } catch { /* unparsable body */ }
      if (errCode === 'invalid_grant') {
        // Stale/revoked grant: CLEAR the refresh token but keep the row (and its
        // googleUserId/user link) alive. Deleting the row would sever the link a future
        // "Sign in with Google" needs to find this same user again (findOrCreateLoginUser's
        // googleUserId lookup) — it would instead fall through to the email lookup and hit
        // account_exists against the user's own account, permanently locking them out.
        await strapi.db.query(GOOGLE_ACCOUNT_UID).update({ where: { id: account.id }, data: { refreshToken: null } })
        tokenCache.delete(me)
        ctx.status = 410
        ctx.body = { error: 'reconnect_needed' }
        return
      }
      // Any other failure (429, 502, maintenance window) is transient — don't destroy a good
      // connection over a blip.
      ctx.status = 502
      ctx.body = { error: 'google_unavailable' }
      return
    }
    let body: { access_token: string; expires_in: number }
    try {
      body = (await res.json()) as { access_token: string; expires_in: number }
    } catch {
      ctx.status = 502
      ctx.body = { error: 'google_unavailable' }
      return
    }
    const entry = { accessToken: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
    tokenCache.set(me, entry)
    ctx.body = entry
  },

  async status(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()
    const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: me } } })) as GoogleAccountRow | null
    ctx.body = account?.refreshToken
      ? { connected: true, email: account.email, scopes: account.scopes }
      : { connected: false }
  },

  async disconnect(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()
    const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: me } } })) as GoogleAccountRow | null
    if (account) {
      if (account.refreshToken) {
        // Best-effort revoke; the token is cleared regardless (the user can always revoke
        // from their Google account page — a dangling grant here is the worse failure).
        try {
          await fetch(googleConfig().revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: decryptToken(account.refreshToken) }),
          })
        } catch { /* best-effort */ }
      }
      // CLEAR the token, don't delete the row — see the driveToken invalid_grant comment: the
      // googleUserId/user link must survive so a future "Sign in with Google" resolves to this
      // same user instead of falling through to account_exists.
      await strapi.db.query(GOOGLE_ACCOUNT_UID).update({ where: { id: account.id }, data: { refreshToken: null } })
    }
    tokenCache.delete(me)
    ctx.body = { ok: true }
  },
}
