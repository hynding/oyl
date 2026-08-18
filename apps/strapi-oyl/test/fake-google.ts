/**
 * Minimal in-process stand-in for Google's OAuth endpoints, used by the google
 * smoke tests via the GOOGLE_*_URL env overrides. The id_token is an UNSIGNED
 * JWT (header.payload.) — the controller decodes the payload and checks `aud`
 * but does not verify the signature (the real token arrives over TLS directly
 * from Google's token endpoint), so no signing key is needed here.
 */
import http from 'node:http'

export type IssuedGrant = { code: string; sub: string; email: string; refreshToken: string }
export type FakeGoogle = {
  baseUrl: string
  issued: IssuedGrant[]
  revoked: string[]
  refreshCalls: number
  failNextRefresh: 'invalid_grant' | null
  omitRefreshToken: boolean
  nextIdentity: { sub: string; email: string } | null
  stop(): Promise<void>
}

const CLIENT_ID = 'test-google-client'

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url')
}

function idToken(sub: string, email: string): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, email, email_verified: true }))
  return `${header}.${payload}.`
}

async function readBody(req: http.IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

export async function startFakeGoogle(): Promise<FakeGoogle> {
  let seq = 0
  const state: FakeGoogle = {
    baseUrl: '', issued: [], revoked: [], refreshCalls: 0,
    failNextRefresh: null, omitRefreshToken: false, nextIdentity: null,
    stop: async () => {},
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/auth') {
        seq += 1
        const identity = state.nextIdentity ?? { sub: `sub-${seq}`, email: `google-${seq}@gmail.test` }
        state.nextIdentity = null
        const grant: IssuedGrant = { code: `code-${seq}`, ...identity, refreshToken: `rt-${seq}` }
        state.issued.push(grant)
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
        redirect.searchParams.set('code', grant.code)
        redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
        res.writeHead(302, { Location: redirect.toString() }).end()
        return
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const body = await readBody(req)
        res.setHeader('Content-Type', 'application/json')
        if (body.get('grant_type') === 'authorization_code') {
          const grant = state.issued.find((g) => g.code === body.get('code'))
          if (!grant) { res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' })); return }
          const payload: Record<string, unknown> = {
            access_token: `at-${grant.code}`, expires_in: 3599, token_type: 'Bearer',
            id_token: idToken(grant.sub, grant.email),
          }
          if (!state.omitRefreshToken) payload['refresh_token'] = grant.refreshToken
          res.writeHead(200).end(JSON.stringify(payload))
          return
        }
        if (body.get('grant_type') === 'refresh_token') {
          state.refreshCalls += 1
          if (state.failNextRefresh) {
            const error = state.failNextRefresh
            state.failNextRefresh = null
            res.writeHead(400).end(JSON.stringify({ error }))
            return
          }
          res.writeHead(200).end(JSON.stringify({ access_token: `at-refreshed-${state.refreshCalls}`, expires_in: 3599, token_type: 'Bearer' }))
          return
        }
        res.writeHead(400).end(JSON.stringify({ error: 'unsupported_grant_type' }))
        return
      }
      if (req.method === 'POST' && url.pathname === '/revoke') {
        const body = await readBody(req)
        state.revoked.push(body.get('token') ?? '')
        res.writeHead(200).end('{}')
        return
      }
      res.writeHead(404).end()
    })().catch(() => { res.writeHead(500).end() })
  })

  await new Promise<void>((resolve) => server.listen(0, resolve))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no port')
  state.baseUrl = `http://127.0.0.1:${addr.port}`
  state.stop = () => new Promise((resolve) => server.close(() => resolve()))
  return state
}

/** Env the strapi boot needs to talk to this fake instead of Google. Call BEFORE boot(). */
export function fakeGoogleEnv(fake: FakeGoogle, backendPort = 0): Record<string, string> {
  return {
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GOOGLE_AUTH_BASE_URL: `${fake.baseUrl}/auth`,
    GOOGLE_TOKEN_URL: `${fake.baseUrl}/token`,
    GOOGLE_REVOKE_URL: `${fake.baseUrl}/revoke`,
    GOOGLE_REDIRECT_URI: `http://127.0.0.1:${backendPort}/api/google/callback`,
    APP_URL: 'http://localhost:8041',
  }
}
