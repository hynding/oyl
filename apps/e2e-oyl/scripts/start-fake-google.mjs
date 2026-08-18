/**
 * Standalone fake Google OAuth server for e2e runs (auth + token + revoke + /health).
 * Same contract as apps/strapi-oyl/test/fake-google.ts, kept dependency-free so
 * Playwright's webServer can spawn it directly.
 */
import http from 'node:http'

const PORT = Number(process.env.FAKE_GOOGLE_PORT ?? 1342)
const CLIENT_ID = 'e2e-google-client'
let seq = 0

const b64url = (s) => Buffer.from(s).toString('base64url')
const idToken = (sub, email) =>
  `${b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, email, email_verified: true }))}.`

/** @type {Map<string, { sub: string, email: string, refreshToken: string }>} */
const grants = new Map()

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/health') { res.writeHead(200).end('ok'); return }
  if (req.method === 'GET' && url.pathname === '/auth') {
    seq += 1
    const code = `code-${seq}`
    grants.set(code, { sub: `e2e-sub-${seq}`, email: `e2e-google-${seq}@gmail.test`, refreshToken: `rt-${seq}` })
    const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
    redirect.searchParams.set('code', code)
    redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
    res.writeHead(302, { Location: redirect.toString() }).end()
    return
  }
  if (req.method === 'POST' && url.pathname === '/token') {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      const body = new URLSearchParams(raw)
      res.setHeader('Content-Type', 'application/json')
      if (body.get('grant_type') === 'authorization_code') {
        const grant = grants.get(body.get('code') ?? '')
        if (!grant) { res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant' })); return }
        res.writeHead(200).end(JSON.stringify({
          access_token: `at-${body.get('code')}`, expires_in: 3599, token_type: 'Bearer',
          refresh_token: grant.refreshToken, id_token: idToken(grant.sub, grant.email),
        }))
        return
      }
      if (body.get('grant_type') === 'refresh_token') {
        res.writeHead(200).end(JSON.stringify({ access_token: `at-refreshed-${Date.now()}`, expires_in: 3599, token_type: 'Bearer' }))
        return
      }
      res.writeHead(400).end(JSON.stringify({ error: 'unsupported_grant_type' }))
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/revoke') { res.writeHead(200).end('{}'); return }
  res.writeHead(404).end()
})

server.listen(PORT, () => console.log(`fake-google on :${PORT}`))
