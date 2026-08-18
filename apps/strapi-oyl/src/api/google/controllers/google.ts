import type { Core } from '@strapi/strapi'
import { randomBytes, randomUUID } from 'node:crypto'
import { googleConfig } from '../../../utils/google-config'
import { encryptToken, decryptToken, signState, verifyState, type OauthState } from '../../../utils/google-crypto'

declare const strapi: Core.Strapi

const GOOGLE_ACCOUNT_UID = 'api::google-account.google-account' as const
const USER_UID = 'plugin::users-permissions.user' as const
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file'
const STATE_TTL_MS = 10 * 60 * 1000

type GoogleAccountRow = { id: number; googleUserId: string; email: string | null; scopes: string | null; refreshToken: string | null; user?: { id: number } }
type UserRow = { id: number; email: string; username: string }

/** In-process per-user access-token cache; cleared on disconnect/invalid_grant. Lost on restart (harmless). */
const tokenCache = new Map<number, { accessToken: string; expiresAt: number }>()

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

async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string | null; idPayload: { sub: string; email?: string; aud?: string } } | null> {
  const c = googleConfig()
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

async function upsertGoogleAccount(userId: number, idPayload: { sub: string; email?: string }, refreshToken: string | null): Promise<void> {
  const data: Record<string, unknown> = {
    googleUserId: idPayload.sub,
    email: idPayload.email ?? null,
    scopes: SCOPES,
    connectedAt: new Date().toISOString(),
    user: userId,
    ...(refreshToken ? { refreshToken: encryptToken(refreshToken) } : {}),
  }
  const existing = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: userId } } })) as GoogleAccountRow | null
  if (existing) await strapi.db.query(GOOGLE_ACCOUNT_UID).update({ where: { id: existing.id }, data })
  else await strapi.db.query(GOOGLE_ACCOUNT_UID).create({ data })
}

export default {
  config(ctx: any) {
    ctx.body = { configured: googleConfig().configured }
  },

  connect(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    // Public connect is LOGIN mode only; link mode goes through the JWT-gated connectUrl.
    const state: OauthState = { nonce: randomUUID(), mode: 'login', retried: false, exp: Date.now() + STATE_TTL_MS }
    ctx.redirect(authorizeUrl(state))
  },

  connectUrl(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const me = ctx.state.user?.id
    if (me == null) return ctx.unauthorized()
    const state: OauthState = { nonce: randomUUID(), mode: 'link', retried: false, userId: me, exp: Date.now() + STATE_TTL_MS }
    ctx.body = { url: authorizeUrl(state) }
  },

  async callback(ctx: any) {
    if (!googleConfig().configured) return ctx.throw(501, 'google oauth not configured')
    const { code, state: rawState, error } = ctx.request.query as Record<string, string | undefined>
    const state = rawState ? verifyState(rawState, Date.now()) : null
    if (!state) return ctx.redirect(errorRedirect('login', 'bad_state'))
    if (error) return ctx.redirect(errorRedirect(state.mode, 'denied'))
    if (!code) return ctx.redirect(errorRedirect(state.mode, 'exchange_failed'))

    const exchanged = await exchangeCode(code)
    if (!exchanged) return ctx.redirect(errorRedirect(state.mode, 'exchange_failed'))
    const { idPayload, refreshToken } = exchanged

    let user: UserRow
    if (state.mode === 'link') {
      if (state.userId == null) return ctx.redirect(errorRedirect('link', 'bad_state'))
      const row = (await strapi.db.query(USER_UID).findOne({ where: { id: state.userId } })) as UserRow | null
      if (!row) return ctx.redirect(errorRedirect('link', 'bad_state'))
      user = row
    } else {
      const found = await findOrCreateLoginUser(idPayload)
      if ('error' in found) return ctx.redirect(errorRedirect('login', found.error))
      user = found.user
    }

    // Google returns refresh_token only on first consent (or prompt=consent). If we got none
    // and hold none, retry ONCE with forced consent; a second miss fails out (no loop).
    if (!refreshToken) {
      const account = (await strapi.db.query(GOOGLE_ACCOUNT_UID).findOne({ where: { user: { id: user.id } } })) as GoogleAccountRow | null
      if (!account?.refreshToken) {
        if (state.retried) return ctx.redirect(errorRedirect(state.mode, 'no_refresh_token'))
        const retryState: OauthState = { ...state, nonce: randomUUID(), retried: true, exp: Date.now() + STATE_TTL_MS }
        return ctx.redirect(authorizeUrl(retryState, { prompt: 'consent' }))
      }
    }

    await upsertGoogleAccount(user.id, idPayload, refreshToken)
    tokenCache.delete(user.id)
    const jwt = strapi.plugin('users-permissions').service('jwt').issue({ id: user.id }) as string
    ctx.redirect(`${googleConfig().appUrl}${appPath(state.mode)}#google=${jwt}`)
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
    const res = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: decryptToken(account.refreshToken),
        client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) {
      // Stale grant (revoked, or 7-day testing-mode expiry): DELETE the token so the next
      // connect flow's "none stored" check passes and re-consent captures a fresh one.
      await strapi.db.query(GOOGLE_ACCOUNT_UID).delete({ where: { id: account.id } })
      tokenCache.delete(me)
      ctx.status = 410
      ctx.body = { error: 'reconnect_needed' }
      return
    }
    const body = (await res.json()) as { access_token: string; expires_in: number }
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
        // Best-effort revoke; the row is deleted regardless (the user can always revoke
        // from their Google account page — a dangling row here is the worse failure).
        try {
          await fetch(googleConfig().revokeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: decryptToken(account.refreshToken) }),
          })
        } catch { /* best-effort */ }
      }
      await strapi.db.query(GOOGLE_ACCOUNT_UID).delete({ where: { id: account.id } })
    }
    tokenCache.delete(me)
    ctx.body = { ok: true }
  },
}
