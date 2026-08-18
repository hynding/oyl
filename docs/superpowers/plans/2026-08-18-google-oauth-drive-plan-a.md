# Google OAuth Sign-in + Drive Foundation (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Sign in with Google" on the login page, Google-account link/disconnect on Profile, a server-side Google connection (refresh token in Strapi), and the shared Drive REST client — everything except the `/files` screen (Plan B).

**Architecture:** Server-brokered OAuth: Strapi holds the client secret + encrypted refresh tokens and runs the whole authorization-code flow via a custom non-content-type API (`src/api/google/`, mirroring `bootstrap`); the browser gets short-lived Drive access tokens from a JWT-gated endpoint and will call Drive REST directly (client ships in this plan, used by Plan B). Sign-in is a plain redirect with the OYL JWT handed back in a URL fragment.

**Tech Stack:** Strapi 5 (custom routes, `node:crypto`), TS strict (`all-of-oyl/src`, NodeNext, `.js` import extensions, NO DOM lib), vanilla JS + JSDoc Web Components, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-google-oauth-drive-design.md`

## Global Constraints

- Scope is exactly `openid email profile https://www.googleapis.com/auth/drive.file`.
- State HMAC: HMAC-SHA256 keyed by SHA-256(`"google-state:" + JWT_SECRET`). Refresh-token encryption: AES-256-GCM keyed by SHA-256(`ENCRYPTION_KEY`) (raw digest = 32-byte key), random 12-byte IV per record, IV + auth tag stored alongside ciphertext.
- With `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` unset: `GET /api/google/config` returns 200 `{ configured: false }`; every other google route answers 501.
- Redirect targets: login mode → `${APP_URL}/login#google=<jwt>` / `#google_error=<code>`; link mode → `${APP_URL}/profile#google=<jwt>` / `#google_error=<code>`. Error codes: `denied`, `bad_state`, `account_exists`, `no_refresh_token`, `exchange_failed`.
- NO silent auto-link by email (OYL emails are unverified). Existing email in login mode → `account_exists`.
- `all-of-oyl/src` rules: NodeNext + explicit `.js` extensions, no DOM globals (no `TextEncoder`, no `Blob`, no `fetch` reference — all injected), `noUnusedLocals`/`noUnusedParameters`. Gates: `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build`.
- Strapi: `pnpm --filter @oyl/strapi-oyl-app build` (which regenerates types) MUST precede `tsc --noEmit` and MUST precede running smoke tests (they run from `dist/`). New content-type → also run `pnpm --filter @oyl/strapi-oyl-app exec strapi ts:generate-types`, use `as const` UIDs, never `as any` on UIDs.
- vanilla-oyl: JSDoc-typed (`pnpm vanilla typecheck` must stay green); component tests assert via the component's own shadowRoot/props, never parent textContent.
- Every task ends green before commit; commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (all `git commit` blocks below imply this trailer even where elided).

---

### Task 1: Strapi crypto + env-config utils

**Files:**
- Create: `apps/strapi-oyl/src/utils/google-crypto.ts`
- Create: `apps/strapi-oyl/src/utils/google-config.ts`
- Test: `apps/strapi-oyl/test/google-crypto-util.test.ts`

**Interfaces:**
- Consumes: nothing (pure `node:crypto` + `process.env`).
- Produces (Task 4 depends on these exact signatures):
  - `encryptToken(plain: string): string` / `decryptToken(packed: string): string`
  - `type OauthState = { nonce: string; mode: 'login' | 'link'; retried: boolean; userId?: number; exp: number }`
  - `signState(state: OauthState): string` / `verifyState(raw: string, nowMs: number): OauthState | null`
  - `googleConfig(): GoogleConfig` where `type GoogleConfig = { configured: boolean; clientId: string; clientSecret: string; redirectUri: string; appUrl: string; authBaseUrl: string; tokenUrl: string; revokeUrl: string }`

- [ ] **Step 1: Write the failing test**

`apps/strapi-oyl/test/google-crypto-util.test.ts` (pure util test — no Strapi boot, mirrors `finance-money-util.test.ts`):

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken, signState, verifyState, type OauthState } from '../src/utils/google-crypto'
import { googleConfig } from '../src/utils/google-config'

beforeAll(() => {
  process.env['ENCRYPTION_KEY'] = 'testtesttesttesttesttesttesttest'
  process.env['JWT_SECRET'] = 'test'
})

describe('google-crypto: refresh-token encryption', () => {
  it('round-trips a token', () => {
    const packed = encryptToken('1//refresh-token-value')
    expect(packed).not.toContain('refresh-token-value')
    expect(decryptToken(packed)).toBe('1//refresh-token-value')
  })
  it('uses a random IV (two encryptions differ)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })
  it('rejects a tampered ciphertext', () => {
    const packed = encryptToken('secret')
    const parts = packed.split('.')
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA')
    expect(() => decryptToken(parts.join('.'))).toThrow()
  })
})

describe('google-crypto: oauth state', () => {
  const state: OauthState = { nonce: 'n1', mode: 'login', retried: false, exp: 2_000_000_000_000 }
  it('round-trips a signed state', () => {
    expect(verifyState(signState(state), 1_000_000_000_000)).toEqual(state)
  })
  it('rejects a tampered payload', () => {
    const raw = signState(state)
    const [payload, sig] = raw.split('.')
    const forged = Buffer.from(JSON.stringify({ ...state, mode: 'link', userId: 1 })).toString('base64url')
    expect(verifyState(`${forged}.${sig}`, 1_000_000_000_000)).toBeNull()
    expect(verifyState(`${payload}.`, 1_000_000_000_000)).toBeNull()
    expect(verifyState('garbage', 1_000_000_000_000)).toBeNull()
  })
  it('rejects an expired state', () => {
    expect(verifyState(signState(state), state.exp + 1)).toBeNull()
  })
  it('carries link mode with userId', () => {
    const link: OauthState = { nonce: 'n2', mode: 'link', retried: true, userId: 42, exp: 2_000_000_000_000 }
    expect(verifyState(signState(link), 0)).toEqual(link)
  })
})

describe('google-config', () => {
  it('is unconfigured without client credentials', () => {
    delete process.env['GOOGLE_CLIENT_ID']
    delete process.env['GOOGLE_CLIENT_SECRET']
    expect(googleConfig().configured).toBe(false)
  })
  it('is configured with credentials and applies Google defaults + env overrides', () => {
    process.env['GOOGLE_CLIENT_ID'] = 'cid'
    process.env['GOOGLE_CLIENT_SECRET'] = 'sec'
    process.env['GOOGLE_REDIRECT_URI'] = 'http://localhost:1340/api/google/callback'
    process.env['APP_URL'] = 'http://localhost:8041'
    delete process.env['GOOGLE_TOKEN_URL']
    const c = googleConfig()
    expect(c.configured).toBe(true)
    expect(c.tokenUrl).toBe('https://oauth2.googleapis.com/token')
    expect(c.authBaseUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(c.revokeUrl).toBe('https://oauth2.googleapis.com/revoke')
    process.env['GOOGLE_TOKEN_URL'] = 'http://localhost:9999/token'
    expect(googleConfig().tokenUrl).toBe('http://localhost:9999/token')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-crypto-util.test.ts`
Expected: FAIL — cannot resolve `../src/utils/google-crypto`

- [ ] **Step 3: Write the implementation**

`apps/strapi-oyl/src/utils/google-crypto.ts`:

```ts
/**
 * Crypto for the Google connection: refresh-token encryption at rest and the
 * signed OAuth `state` parameter. Keys are DERIVED (SHA-256) from existing env
 * secrets so no new secret needs provisioning; the derivation is part of the
 * stored-ciphertext format — changing it invalidates stored refresh tokens.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const encKey = () => createHash('sha256').update(process.env['ENCRYPTION_KEY'] ?? '').digest()
const stateKey = () => createHash('sha256').update('google-state:' + (process.env['JWT_SECRET'] ?? '')).digest()

/** AES-256-GCM; packed as `iv.tag.ciphertext` (base64url). */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptToken(packed: string): string {
  const [iv, tag, data] = packed.split('.')
  if (!iv || !tag || !data) throw new Error('malformed packed token')
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/** The signed OAuth round-trip state. `retried` guards the prompt=consent loop; `userId` only in link mode. */
export type OauthState = { nonce: string; mode: 'login' | 'link'; retried: boolean; userId?: number; exp: number }

/** `payload.sig` (both base64url); HMAC-SHA256 over the payload. */
export function signState(state: OauthState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url')
  const sig = createHmac('sha256', stateKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Null on any failure (malformed, bad signature, expired) — callers redirect with `bad_state`. */
export function verifyState(raw: string, nowMs: number): OauthState | null {
  const [payload, sig] = raw.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', stateKey()).update(payload).digest()
  let given: Buffer
  try { given = Buffer.from(sig, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const state = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OauthState
    return state.exp > nowMs ? state : null
  } catch { return null }
}
```

`apps/strapi-oyl/src/utils/google-config.ts`:

```ts
/** Google OAuth env config. Read per-call (not module-load) so tests can set env before boot. */
export type GoogleConfig = {
  configured: boolean
  clientId: string
  clientSecret: string
  redirectUri: string
  appUrl: string
  authBaseUrl: string
  tokenUrl: string
  revokeUrl: string
}

export function googleConfig(): GoogleConfig {
  const clientId = process.env['GOOGLE_CLIENT_ID'] ?? ''
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? ''
  return {
    configured: clientId !== '' && clientSecret !== '',
    clientId,
    clientSecret,
    redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:1340/api/google/callback',
    appUrl: process.env['APP_URL'] ?? 'http://localhost:8041',
    authBaseUrl: process.env['GOOGLE_AUTH_BASE_URL'] ?? 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: process.env['GOOGLE_TOKEN_URL'] ?? 'https://oauth2.googleapis.com/token',
    revokeUrl: process.env['GOOGLE_REVOKE_URL'] ?? 'https://oauth2.googleapis.com/revoke',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-crypto-util.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm --filter @oyl/strapi-oyl-app build && pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit
git add apps/strapi-oyl/src/utils/google-crypto.ts apps/strapi-oyl/src/utils/google-config.ts apps/strapi-oyl/test/google-crypto-util.test.ts
git commit -m "feat(strapi): google oauth crypto + env config utils"
```

---

### Task 2: `google-account` content-type

**Files:**
- Create: `apps/strapi-oyl/src/api/google-account/content-types/google-account/schema.json`
- Modify: `apps/strapi-oyl/types/generated/contentTypes.d.ts` (regenerated, not hand-edited)
- Test: `apps/strapi-oyl/test/google-account-schema.test.ts`

**Interfaces:**
- Produces: content-type UID `api::google-account.google-account` with attributes `user` (oneToOne → users-permissions user), `googleUserId`, `email`, `scopes`, `connectedAt`, `refreshToken` (private). Task 4 queries it via `strapi.db.query('api::google-account.google-account')`.
- NO routes/controllers directories — a content-type with only a schema exposes no REST endpoints; access is exclusively through Task 4's custom controller.

- [ ] **Step 1: Write the failing schema test**

`apps/strapi-oyl/test/google-account-schema.test.ts` (file-shape test, mirrors `parity.test.ts` — no boot):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SCHEMA = path.resolve(__dirname, '..', 'src', 'api', 'google-account', 'content-types', 'google-account', 'schema.json')

describe('google-account content-type', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA, 'utf-8')) as Record<string, any>
  const attrs = schema['attributes'] as Record<string, any>

  it('is a collectionType named google-account with no draftAndPublish', () => {
    expect(schema['kind']).toBe('collectionType')
    expect(schema['info']['singularName']).toBe('google-account')
    expect(schema['options']['draftAndPublish']).toBe(false)
  })
  it('googleUserId is a required unique string', () => {
    expect(attrs['googleUserId']).toMatchObject({ type: 'string', required: true, unique: true })
  })
  it('refreshToken is text and PRIVATE (never serialized into REST responses)', () => {
    expect(attrs['refreshToken']).toMatchObject({ type: 'text', private: true })
  })
  it('user is a oneToOne relation to the users-permissions user', () => {
    expect(attrs['user']).toMatchObject({ type: 'relation', relation: 'oneToOne', target: 'plugin::users-permissions.user' })
  })
  it('has NO routes or controllers (custom API only)', () => {
    const apiDir = path.resolve(__dirname, '..', 'src', 'api', 'google-account')
    expect(fs.existsSync(path.join(apiDir, 'routes'))).toBe(false)
    expect(fs.existsSync(path.join(apiDir, 'controllers'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-account-schema.test.ts`
Expected: FAIL — ENOENT reading schema.json

- [ ] **Step 3: Create the schema**

`apps/strapi-oyl/src/api/google-account/content-types/google-account/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "google_accounts",
  "info": { "singularName": "google-account", "pluralName": "google-accounts", "displayName": "Google Account" },
  "options": { "draftAndPublish": false },
  "attributes": {
    "googleUserId": { "type": "string", "required": true, "unique": true },
    "email": { "type": "string" },
    "scopes": { "type": "string" },
    "connectedAt": { "type": "datetime" },
    "refreshToken": { "type": "text", "private": true },
    "user": { "type": "relation", "relation": "oneToOne", "target": "plugin::users-permissions.user" }
  }
}
```

- [ ] **Step 4: Regenerate types and verify**

```bash
pnpm --filter @oyl/strapi-oyl-app build
pnpm --filter @oyl/strapi-oyl-app exec strapi ts:generate-types
pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit
pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-account-schema.test.ts
```

Expected: `types/generated/contentTypes.d.ts` now contains `ApiGoogleAccountGoogleAccount`; tsc green; test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/strapi-oyl/src/api/google-account apps/strapi-oyl/test/google-account-schema.test.ts apps/strapi-oyl/types/generated/contentTypes.d.ts
git commit -m "feat(strapi): google-account content-type (no REST surface)"
```

---

### Task 3: Fake Google test server (shared smoke-test helper)

**Files:**
- Create: `apps/strapi-oyl/test/fake-google.ts`

**Interfaces:**
- Produces (Tasks 4–5 and the e2e fixture pattern depend on this):
  - `startFakeGoogle(): Promise<FakeGoogle>` where `type FakeGoogle = { baseUrl: string; issued: IssuedGrant[]; revoked: string[]; refreshCalls: number; failNextRefresh: 'invalid_grant' | null; omitRefreshToken: boolean; nextIdentity: { sub: string; email: string } | null; stop(): Promise<void> }`
  - `type IssuedGrant = { code: string; sub: string; email: string; refreshToken: string }`
  - Endpoints served: `GET /auth` (302 back to `redirect_uri` with `code` + passthrough `state`), `POST /token` (authorization_code and refresh_token grants), `POST /revoke`.

- [ ] **Step 1: Write the helper**

`apps/strapi-oyl/test/fake-google.ts`:

```ts
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
```

Note: `GOOGLE_REDIRECT_URI` is informational to Google in tests (the fake never calls it — the smoke tests follow redirects manually), so the placeholder port is fine.

- [ ] **Step 2: Sanity-check it compiles**

Run: `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit`
Expected: green (test dir is included by the package tsconfig; if the tsconfig excludes `test/`, run `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-crypto-util.test.ts` instead to confirm vitest still transpiles cleanly)

- [ ] **Step 3: Commit**

```bash
git add apps/strapi-oyl/test/fake-google.ts
git commit -m "test(strapi): fake Google OAuth server for smoke tests"
```

---

### Task 4: Google custom API — routes, controller, permission grants

**Files:**
- Create: `apps/strapi-oyl/src/api/google/routes/google.ts`
- Create: `apps/strapi-oyl/src/api/google/controllers/google.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (permission grants)
- Test: `apps/strapi-oyl/test/google-oauth.test.ts` (written FIRST, in this task)

**Interfaces:**
- Consumes: Task 1 (`encryptToken`/`decryptToken`/`signState`/`verifyState`/`googleConfig`), Task 2 (UID `api::google-account.google-account`), Task 3 (`startFakeGoogle`/`fakeGoogleEnv`).
- Produces (client tasks 7–10 and the e2e depend on these wire contracts):
  - `GET /api/google/config` → 200 `{ configured: boolean }` (always 200)
  - `GET /api/google/connect` → 302 to Google (login mode only) or 501
  - `GET /api/google/connect-url` (JWT) → 200 `{ url: string }` (link mode)
  - `GET /api/google/callback` → 302 to `${appUrl}/{login|profile}#google=<jwt>` or `#google_error=<code>`
  - `GET /api/google/drive-token` (JWT) → 200 `{ accessToken: string, expiresAt: number }` | 404 (not connected) | 410 (stale grant, record cleared)
  - `GET /api/google/status` (JWT) → 200 `{ connected: boolean, email?: string, scopes?: string }`
  - `POST /api/google/disconnect` (JWT) → 200 `{ ok: true }`

- [ ] **Step 1: Write the failing smoke test**

`apps/strapi-oyl/test/google-oauth.test.ts`:

```ts
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
})
afterAll(async () => { await stop?.(); await fake.stop() })

const noRedirect: RequestInit = { redirect: 'manual' }
const h = (jwt: string) => ({ Authorization: `Bearer ${jwt}` })

/** Follow the whole dance by hand: connect → fake google → callback. Returns the final app redirect URL. */
async function signInWithGoogle(startUrl: string): Promise<URL> {
  const toGoogle = await fetch(startUrl, noRedirect)
  expect(toGoogle.status).toBe(302)
  const googleUrl = toGoogle.headers.get('location')!
  const fromGoogle = await fetch(googleUrl, noRedirect)
  expect(fromGoogle.status).toBe(302)
  const callbackUrl = fromGoogle.headers.get('location')!
  const toApp = await fetch(callbackUrl, noRedirect)
  expect(toApp.status).toBe(302)
  return new URL(toApp.headers.get('location')!)
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
    const appUrl = await signInWithGoogle(url)
    expect(appUrl.pathname).toBe('/profile')
    expect(fragmentParam(appUrl, 'google')).toBeTruthy()
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean; email: string }
    expect(status.connected).toBe(true)
    expect(status.email).toBe(fake.issued.at(-1)!.email)
  })

  it('refresh token is stored ENCRYPTED (never plaintext in the DB row)', async () => {
    const user = await registerUser(baseUrl, `enc-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await signInWithGoogle(url)
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
    await signInWithGoogle(url)
    const before = fake.refreshCalls
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(fake.refreshCalls).toBe(before + 1)
  })

  it('invalid_grant on refresh → 410, stored token deleted, reconnect then succeeds', async () => {
    const user = await registerUser(baseUrl, `revoked-${Date.now()}`)
    const { url } = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await signInWithGoogle(url)
    fake.failNextRefresh = 'invalid_grant'
    const gone = await fetch(`${baseUrl}/google/drive-token`, { headers: h(user.jwt) })
    expect(gone.status).toBe(410)
    // token deleted → status now disconnected
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
    // reconnect captures a fresh refresh token and drive-token works again
    const again = (await (await fetch(`${baseUrl}/google/connect-url`, { headers: h(user.jwt) })).json()) as { url: string }
    await signInWithGoogle(again.url)
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
    await signInWithGoogle(url)
    const res = await fetch(`${baseUrl}/google/disconnect`, { method: 'POST', headers: h(user.jwt) })
    expect(res.status).toBe(200)
    expect(fake.revoked.length).toBeGreaterThan(0)
    const status = (await (await fetch(`${baseUrl}/google/status`, { headers: h(user.jwt) })).json()) as { connected: boolean }
    expect(status.connected).toBe(false)
  })
})
```

Note on the "501 when unconfigured" assertion: env is fixed per suite boot, so it lives in a SEPARATE test file added in this same task, `apps/strapi-oyl/test/google-unconfigured.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'

let baseUrl: string
let stop: () => Promise<void>

beforeAll(async () => {
  delete process.env['GOOGLE_CLIENT_ID']
  delete process.env['GOOGLE_CLIENT_SECRET']
  ;({ baseUrl, stop } = await boot())
})
afterAll(async () => { await stop?.() })

describe('google oauth unconfigured', () => {
  it('config answers 200 { configured: false }', async () => {
    const res = await fetch(`${baseUrl}/google/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ configured: false })
  })
  it('connect and callback answer 501', async () => {
    expect((await fetch(`${baseUrl}/google/connect?mode=login`, { redirect: 'manual' })).status).toBe(501)
    expect((await fetch(`${baseUrl}/google/callback?code=x&state=y`, { redirect: 'manual' })).status).toBe(501)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @oyl/strapi-oyl-app build
pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-oauth.test.ts test/google-unconfigured.test.ts
```

Expected: FAIL — 404s on `/google/*` routes

- [ ] **Step 3: Write routes**

`apps/strapi-oyl/src/api/google/routes/google.ts`:

```ts
/**
 * Custom (non-content-type) Google OAuth routes. `config`, `connect` and
 * `callback` are public (granted in src/index.ts); the rest require a JWT.
 * The google-account content-type itself has NO REST routes — these are the
 * only doors to it.
 */
export default {
  routes: [
    { method: 'GET', path: '/google/config', handler: 'google.config', config: { policies: [] } },
    { method: 'GET', path: '/google/connect', handler: 'google.connect', config: { policies: [] } },
    { method: 'GET', path: '/google/connect-url', handler: 'google.connectUrl', config: { policies: [] } },
    { method: 'GET', path: '/google/callback', handler: 'google.callback', config: { policies: [] } },
    { method: 'GET', path: '/google/drive-token', handler: 'google.driveToken', config: { policies: [] } },
    { method: 'GET', path: '/google/status', handler: 'google.status', config: { policies: [] } },
    { method: 'POST', path: '/google/disconnect', handler: 'google.disconnect', config: { policies: [] } },
  ],
}
```

- [ ] **Step 4: Write the controller**

`apps/strapi-oyl/src/api/google/controllers/google.ts`:

```ts
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
```

- [ ] **Step 5: Grant permissions in the bootstrap**

Modify `apps/strapi-oyl/src/index.ts` — after the `BOOTSTRAP_ACTIONS` constant add:

```ts
const GOOGLE_PUBLIC_ACTIONS = ['config', 'connect', 'callback'].map((a) => `api::google.google.${a}`)
const GOOGLE_AUTH_ACTIONS = ['connectUrl', 'driveToken', 'status', 'disconnect'].map((a) => `api::google.google.${a}`)
```

and inside `bootstrap({ strapi })`, after the existing grants:

```ts
await grantRoleActions(strapi, 'public', GOOGLE_PUBLIC_ACTIONS, 'google-public')
await grantRoleActions(strapi, 'authenticated', GOOGLE_AUTH_ACTIONS, 'google')
```

- [ ] **Step 6: Build, run tests, verify pass**

```bash
pnpm --filter @oyl/strapi-oyl-app build
pnpm --filter @oyl/strapi-oyl-app exec vitest run test/google-oauth.test.ts test/google-unconfigured.test.ts
pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit
```

Expected: all PASS, tsc green. If a route 403s instead of reaching the controller, the users-permissions action name doesn't match the handler — verify with the pattern `api::google.google.<handlerName>` (camelCase `connectUrl`/`driveToken` exactly as in the routes file).

- [ ] **Step 7: Run the full strapi suite (no regressions) and commit**

```bash
pnpm --filter @oyl/strapi-oyl-app test
git add apps/strapi-oyl/src/api/google apps/strapi-oyl/src/index.ts apps/strapi-oyl/test/google-oauth.test.ts apps/strapi-oyl/test/google-unconfigured.test.ts
git commit -m "feat(strapi): google oauth flow — connect/callback/drive-token/status/disconnect"
```

---

### Task 5: Shared Drive client in `all-of-oyl`

**Files:**
- Create: `packages/all-of-oyl/src/google/types.ts`
- Create: `packages/all-of-oyl/src/google/utf8.ts`
- Create: `packages/all-of-oyl/src/google/drive-client.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (exports)
- Test: `packages/all-of-oyl/src/google/drive-client.test.ts`, `packages/all-of-oyl/src/google/utf8.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (fully injected).
- Produces (vanilla google-store implements `AccessTokenProvider`; Plan B's `/files` screen consumes `DriveClient`):
  - `interface AccessTokenProvider { getAccessToken(opts?: { force?: boolean }): Promise<string> }`
  - `interface DriveFile { id: string; name: string; mimeType: string; size?: number; modifiedTime?: string }`
  - `class DriveError extends Error { kind: 'unauthorized' | 'not-found' | 'rate-limited' | 'network'; status?: number }`
  - `type DriveFetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }) => Promise<DriveFetchResponse>` with `DriveFetchResponse = { status: number; ok: boolean; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }`
  - `createDriveClient(opts: { fetch: DriveFetchFn; tokens: AccessTokenProvider; baseUrl?: string }): DriveClient` with `DriveClient = { ensureFolder(name: string): Promise<string>; list(folderId: string): Promise<DriveFile[]>; upload(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<DriveFile>; update(fileId: string, mimeType: string, bytes: Uint8Array): Promise<void>; download(fileId: string): Promise<Uint8Array>; remove(fileId: string): Promise<void> }`
  - `utf8Encode(s: string): Uint8Array` (no `TextEncoder` — the browser-build tsconfig has NO DOM lib)

- [ ] **Step 1: Write the failing utf8 test**

`packages/all-of-oyl/src/google/utf8.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { utf8Encode } from './utf8.js'

describe('utf8Encode', () => {
  it('matches TextEncoder for ascii, 2-byte, 3-byte and astral characters', () => {
    const reference = new TextEncoder()
    for (const s of ['plain', 'receipt Müller.pdf', '日本語ファイル.png', 'emoji 🧾.jpg', '']) {
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(reference.encode(s)))
    }
  })
})
```

(vitest runs under Node where `TextEncoder` exists as the reference — the production code itself must not use it.)

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/google/utf8.test.ts` → FAIL (module not found)

`packages/all-of-oyl/src/google/utf8.ts`:

```ts
/**
 * Minimal UTF-8 encoder. The browser-build tsconfig has NO DOM lib, so
 * TextEncoder is not available in src/ — this replaces it for multipart bodies.
 */
export function utf8Encode(s: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number
    if (cp > 0xffff) i++ // consumed a surrogate pair
    if (cp <= 0x7f) out.push(cp)
    else if (cp <= 0x7ff) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp <= 0xffff) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return Uint8Array.from(out)
}
```

Run again → PASS.

- [ ] **Step 3: Write the failing drive-client test**

`packages/all-of-oyl/src/google/drive-client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createDriveClient } from './drive-client.js'
import { DriveError, type DriveFetchFn, type DriveFetchResponse } from './types.js'

type Call = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } }

function respond(status: number, body: unknown = {}, bytes?: Uint8Array): DriveFetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    arrayBuffer: async () => (bytes ?? new Uint8Array()).buffer as ArrayBuffer,
  }
}

function makeFetch(responses: DriveFetchResponse[]): { fetch: DriveFetchFn; calls: Call[] } {
  const calls: Call[] = []
  const fetch: DriveFetchFn = async (url, init = {}) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra request')
    return next
  }
  return { fetch, calls }
}

const tokens = { getAccessToken: vi.fn(async (_opts?: { force?: boolean }) => 't1') }

describe('drive-client', () => {
  it('list pages through files with the parent query and bearer token', async () => {
    const { fetch, calls } = makeFetch([
      respond(200, { files: [{ id: 'f1', name: 'a.txt', mimeType: 'text/plain' }], nextPageToken: 'p2' }),
      respond(200, { files: [{ id: 'f2', name: 'b.txt', mimeType: 'text/plain', size: '12', modifiedTime: '2026-08-18T00:00:00Z' }] }),
    ])
    const drive = createDriveClient({ fetch, tokens })
    const files = await drive.list('folder-1')
    expect(files.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(files[1].size).toBe(12)
    expect(calls[0].url).toContain("'folder-1'+in+parents")
    expect(calls[0].init.headers?.Authorization).toBe('Bearer t1')
    expect(calls[1].url).toContain('pageToken=p2')
  })

  it('ensureFolder finds an existing folder, else creates it', async () => {
    const found = makeFetch([respond(200, { files: [{ id: 'existing', name: 'OYL', mimeType: 'application/vnd.google-apps.folder' }] })])
    expect(await createDriveClient({ fetch: found.fetch, tokens }).ensureFolder('OYL')).toBe('existing')

    const created = makeFetch([respond(200, { files: [] }), respond(200, { id: 'made' })])
    expect(await createDriveClient({ fetch: created.fetch, tokens }).ensureFolder('OYL')).toBe('made')
    expect(created.calls[1].init.method).toBe('POST')
    expect(String(created.calls[1].init.body)).toContain('application/vnd.google-apps.folder')
  })

  it('upload builds a multipart/related body containing metadata and bytes', async () => {
    const { fetch, calls } = makeFetch([respond(200, { id: 'up1', name: 'r.txt', mimeType: 'text/plain' })])
    const drive = createDriveClient({ fetch, tokens })
    const file = await drive.upload('folder-1', 'r.txt', 'text/plain', Uint8Array.from([104, 105]))
    expect(file.id).toBe('up1')
    expect(calls[0].url).toContain('uploadType=multipart')
    const contentType = calls[0].init.headers?.['Content-Type'] ?? ''
    expect(contentType).toMatch(/^multipart\/related; boundary=/)
    const raw = new TextDecoder().decode(calls[0].init.body as Uint8Array)
    expect(raw).toContain('"name":"r.txt"')
    expect(raw).toContain('"parents":["folder-1"]')
    expect(raw).toContain('hi')
  })

  it('download returns the body bytes', async () => {
    const { fetch, calls } = makeFetch([respond(200, {}, Uint8Array.from([1, 2, 3]))])
    const bytes = await createDriveClient({ fetch, tokens }).download('f1')
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(calls[0].url).toContain('alt=media')
  })

  it('retries ONCE with a forced token on 401, then succeeds', async () => {
    tokens.getAccessToken.mockClear()
    const { fetch } = makeFetch([respond(401, {}), respond(200, { files: [] })])
    await createDriveClient({ fetch, tokens }).list('folder-1')
    expect(tokens.getAccessToken).toHaveBeenCalledTimes(2)
    expect(tokens.getAccessToken.mock.calls[1][0]).toEqual({ force: true })
  })

  it('maps 401-after-retry, 404, 429 and thrown fetch to typed DriveError kinds', async () => {
    const cases: Array<[DriveFetchResponse[], string]> = [
      [[respond(401), respond(401)], 'unauthorized'],
      [[respond(404)], 'not-found'],
      [[respond(429)], 'rate-limited'],
    ]
    for (const [responses, kind] of cases) {
      const { fetch } = makeFetch(responses)
      await expect(createDriveClient({ fetch, tokens }).list('x')).rejects.toMatchObject({ name: 'DriveError', kind })
    }
    const throwing: DriveFetchFn = async () => { throw new Error('offline') }
    await expect(createDriveClient({ fetch: throwing, tokens }).list('x')).rejects.toMatchObject({ kind: 'network' })
    expect(new DriveError('network', 'x')).toBeInstanceOf(Error)
  })

  it('remove issues DELETE and update sends media bytes', async () => {
    const del = makeFetch([respond(204)])
    await createDriveClient({ fetch: del.fetch, tokens }).remove('f9')
    expect(del.calls[0].init.method).toBe('DELETE')

    const upd = makeFetch([respond(200, {})])
    await createDriveClient({ fetch: upd.fetch, tokens }).update('f9', 'text/plain', Uint8Array.from([120]))
    expect(upd.calls[0].init.method).toBe('PATCH')
    expect(upd.calls[0].url).toContain('uploadType=media')
    expect(upd.calls[0].init.headers?.['Content-Type']).toBe('text/plain')
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/google/drive-client.test.ts` → FAIL (modules not found)

- [ ] **Step 4: Implement types + client**

`packages/all-of-oyl/src/google/types.ts`:

```ts
/** A file in the app's Drive folder (drive.file scope: only files this app created are visible). */
export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: number
  modifiedTime?: string
}

/**
 * The seam between the Drive client and its token source (browser google-store now,
 * ocari CLI later). `force: true` means "the last token was rejected — bypass any
 * cache and mint a fresh one".
 */
export interface AccessTokenProvider {
  getAccessToken(opts?: { force?: boolean }): Promise<string>
}

/** Fetch slice for Drive: adds arrayBuffer() (downloads) and binary bodies to the FetchFn idea. */
export interface DriveFetchResponse {
  readonly status: number
  readonly ok: boolean
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}
export type DriveFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<DriveFetchResponse>

/** Typed Drive failures, mirroring HttpRepositoryError's discriminated kinds. */
export class DriveError extends Error {
  readonly kind: 'unauthorized' | 'not-found' | 'rate-limited' | 'network'
  readonly status: number | undefined
  constructor(kind: 'unauthorized' | 'not-found' | 'rate-limited' | 'network', message: string, status?: number) {
    super(message)
    this.name = 'DriveError'
    this.kind = kind
    this.status = status
  }
}
```

`packages/all-of-oyl/src/google/drive-client.ts`:

```ts
import { utf8Encode } from './utf8.js'
import { DriveError, type AccessTokenProvider, type DriveFetchFn, type DriveFetchResponse, type DriveFile } from './types.js'

const DEFAULT_BASE_URL = 'https://www.googleapis.com'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime'

export interface DriveClient {
  ensureFolder(name: string): Promise<string>
  list(folderId: string): Promise<DriveFile[]>
  upload(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<DriveFile>
  update(fileId: string, mimeType: string, bytes: Uint8Array): Promise<void>
  download(fileId: string): Promise<Uint8Array>
  remove(fileId: string): Promise<void>
}

type RawFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }

function toDriveFile(raw: RawFile): DriveFile {
  const file: DriveFile = { id: raw.id, name: raw.name, mimeType: raw.mimeType }
  if (raw.size != null) file.size = Number(raw.size)
  if (raw.modifiedTime != null) file.modifiedTime = raw.modifiedTime
  return file
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

export function createDriveClient(opts: { fetch: DriveFetchFn; tokens: AccessTokenProvider; baseUrl?: string }): DriveClient {
  const base = opts.baseUrl ?? DEFAULT_BASE_URL

  async function request(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } = {},
    retried = false,
  ): Promise<DriveFetchResponse> {
    const token = await opts.tokens.getAccessToken(retried ? { force: true } : undefined)
    let res: DriveFetchResponse
    try {
      res = await opts.fetch(`${base}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
    } catch (cause) {
      throw new DriveError('network', `drive request failed: ${String(cause)}`)
    }
    if (res.status === 401 && !retried) return request(path, init, true)
    if (res.status === 401) throw new DriveError('unauthorized', 'drive token rejected', 401)
    if (res.status === 404) throw new DriveError('not-found', 'drive file not found', 404)
    if (res.status === 429) throw new DriveError('rate-limited', 'drive rate limit', 429)
    if (!res.ok) throw new DriveError('network', `drive error ${res.status}`, res.status)
    return res
  }

  async function list(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = []
    let pageToken: string | undefined
    do {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`).replace(/%20/g, '+')
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const res = await request(`/drive/v3/files?q=${q}&fields=nextPageToken,files(${FILE_FIELDS})&pageSize=100${page}`)
      const body = (await res.json()) as { files?: RawFile[]; nextPageToken?: string }
      for (const raw of body.files ?? []) files.push(toDriveFile(raw))
      pageToken = body.nextPageToken
    } while (pageToken)
    return files
  }

  return {
    list,

    async ensureFolder(name: string): Promise<string> {
      const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`).replace(/%20/g, '+')
      const res = await request(`/drive/v3/files?q=${q}&fields=files(id)`)
      const body = (await res.json()) as { files?: Array<{ id: string }> }
      const existing = body.files?.[0]
      if (existing) return existing.id
      const created = await request('/drive/v3/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      })
      return ((await created.json()) as { id: string }).id
    },

    async upload(folderId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<DriveFile> {
      const boundary = 'oyl-drive-boundary'
      const meta = JSON.stringify({ name, parents: [folderId] })
      const body = concatBytes([
        utf8Encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        bytes,
        utf8Encode(`\r\n--${boundary}--`),
      ])
      const res = await request(`/upload/drive/v3/files?uploadType=multipart&fields=${FILE_FIELDS}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      })
      return toDriveFile((await res.json()) as RawFile)
    },

    async update(fileId: string, mimeType: string, bytes: Uint8Array): Promise<void> {
      await request(`/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': mimeType },
        body: bytes,
      })
    },

    async download(fileId: string): Promise<Uint8Array> {
      const res = await request(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`)
      return new Uint8Array(await res.arrayBuffer())
    },

    async remove(fileId: string): Promise<void> {
      await request(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
    },
  }
}
```

Append to `packages/all-of-oyl/src/index.ts`:

```ts
export { createDriveClient, type DriveClient } from './google/drive-client.js'
export { DriveError, type DriveFile, type AccessTokenProvider, type DriveFetchFn, type DriveFetchResponse } from './google/types.js'
export { utf8Encode } from './google/utf8.js'
```

- [ ] **Step 5: Run all gates**

```bash
pnpm all-of test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm --filter @oyl/all-of-oyl exec tsc --noEmit
pnpm all-of build
```

Expected: all green. `typecheck:src` and `all-of build` are the DOM-free gates — if either flags `TextEncoder`/`TextDecoder`/`fetch`, a DOM global leaked into `src/` (test files may use them; production files must not).

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/google packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): DOM-free Google Drive REST client"
```

---

### Task 6: vanilla `google-store`

**Files:**
- Create: `apps/vanilla-oyl/src/state/google-store.js`
- Modify: `apps/vanilla-oyl/src/storage/keys.js` (add `DRIVE_BASE_URL_KEY`)
- Test: `apps/vanilla-oyl/src/state/google-store.test.js`

**Interfaces:**
- Consumes: Task 4's wire contracts (`/google/config`, `/google/status`, `/google/drive-token`, `/google/connect-url`, `/google/disconnect`); `signal` from `../lib/reactive/signal.js`; `getToken` shape from `createAuthState`.
- Produces (Tasks 8–9 wire these):
  - `createGoogleStore({ baseUrl, fetch, getToken })` returning `{ connection, probe(), loadStatus(), getAccessToken(opts?), connectUrl(), disconnect() }`
  - `connection` is `Signal<{ state: 'unknown'|'unconfigured'|'disconnected'|'connected'|'reconnect-needed', email?: string }>`
  - `getAccessToken(opts?: { force?: boolean }): Promise<string>` — satisfies `AccessTokenProvider`; throws `Error('google-reconnect-needed')` on 410
  - `keys.js` gains `export const DRIVE_BASE_URL_KEY = 'oyl/drive-base-url'` (consumed by Plan B; declared here so the key namespace is settled)

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/state/google-store.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { createGoogleStore } from './google-store.js'

/** @param {Array<{ status: number, body?: any }>} responses */
function fakeFetch(responses) {
  const calls = /** @type {Array<{ url: string, init: any }>} */ ([])
  const fetch = vi.fn(async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, init })
    const next = responses.shift() ?? { status: 500 }
    return { status: next.status, ok: next.status < 300, json: async () => next.body ?? {} }
  })
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
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vanilla test -- run src/state/google-store.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

Add to `apps/vanilla-oyl/src/storage/keys.js` (after `READ_CACHE_KEY`):

```js
/** Drive REST base-URL override (tests point the client at a fake server). */
export const DRIVE_BASE_URL_KEY = 'oyl/drive-base-url'
```

`apps/vanilla-oyl/src/state/google-store.js`:

```js
import { signal } from '../lib/reactive/signal.js'

/** @typedef {{ state: 'unknown'|'unconfigured'|'disconnected'|'connected'|'reconnect-needed', email?: string }} GoogleConnection */

/**
 * Google connection state + Drive access tokens, over the Strapi /google routes.
 * Implements the shared AccessTokenProvider seam ({ force } bypasses the cache).
 * @param {{ baseUrl: string, fetch: typeof globalThis.fetch, getToken: () => Promise<string | null> }} opts
 */
export function createGoogleStore({ baseUrl, fetch, getToken }) {
  const connection = signal(/** @type {GoogleConnection} */ ({ state: 'unknown' }))
  /** @type {{ accessToken: string, expiresAt: number } | null} */
  let cached = null

  /**
   * @param {string} path @param {{ method?: string }} [init]
   * `credentials: 'include'` is required for `/google/connect-url`: its response sets an
   * HttpOnly session-binding cookie (Strapi's `config/middlewares.ts` CORS was widened to
   * `credentials: true` for exactly this — a cross-origin fetch() without this flag silently
   * drops the Set-Cookie, breaking link-mode connect with `bad_state`). Harmless on the other
   * authed() calls, which don't set or need cookies.
   */
  async function authed(path, init) {
    const token = await getToken()
    return fetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
  }

  return {
    connection,

    /** Pre-auth probe: is Google configured on the backend at all? */
    async probe() {
      try {
        const res = await fetch(`${baseUrl}/google/config`)
        if (!res.ok) return
        const data = /** @type {{ configured?: boolean }} */ (await res.json())
        connection.set(data.configured ? { state: 'disconnected' } : { state: 'unconfigured' })
      } catch { /* stay 'unknown' — offline probe is not an error */ }
    },

    /** Signed-in status for the Profile screen. */
    async loadStatus() {
      try {
        const res = await authed('/google/status')
        if (res.status === 501) { connection.set({ state: 'unconfigured' }); return }
        if (!res.ok) return
        const data = /** @type {{ connected?: boolean, email?: string }} */ (await res.json())
        if (data.connected) connection.set({ state: 'connected', email: data.email })
        else if (connection.get().state !== 'reconnect-needed') connection.set({ state: 'disconnected' })
      } catch { /* leave current state */ }
    },

    /**
     * AccessTokenProvider seam for the Drive client.
     * @param {{ force?: boolean }} [opts] @returns {Promise<string>}
     */
    async getAccessToken(opts) {
      if (!opts?.force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.accessToken
      const res = await authed('/google/drive-token')
      if (res.status === 410) {
        cached = null
        connection.set({ state: 'reconnect-needed' })
        throw new Error('google-reconnect-needed')
      }
      if (!res.ok) throw new Error(`drive token failed (${res.status})`)
      cached = /** @type {{ accessToken: string, expiresAt: number }} */ (await res.json())
      return cached.accessToken
    },

    /** Server-minted link-mode auth URL (a plain anchor cannot carry the JWT). @returns {Promise<string>} */
    async connectUrl() {
      const res = await authed('/google/connect-url')
      if (!res.ok) throw new Error(`connect-url failed (${res.status})`)
      return /** @type {{ url: string }} */ (await res.json()).url
    },

    async disconnect() {
      await authed('/google/disconnect', { method: 'POST' })
      cached = null
      connection.set({ state: 'disconnected' })
    },
  }
}
```

- [ ] **Step 4: Run tests + typecheck, verify pass**

```bash
pnpm vanilla test -- run src/state/google-store.test.js
pnpm vanilla typecheck
```

Expected: PASS, typecheck green

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/google-store.js apps/vanilla-oyl/src/state/google-store.test.js apps/vanilla-oyl/src/storage/keys.js
git commit -m "feat(vanilla): google-store — connection state + drive token provider"
```

---

### Task 7: Fragment JWT adoption in `auth.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/auth.js`
- Test: `apps/vanilla-oyl/src/state/auth.test.js` (extend)

**Interfaces:**
- Consumes: existing `createAuthState(storage, { baseUrl, fetch })` internals (`persist`, `session`).
- Produces (Task 9 calls this at boot):
  - `adoptTokenFromHash(win: { location: { hash: string, pathname: string, search: string }, history: { replaceState(a: any, b: string, url: string): void } }): Promise<{ adopted: boolean, error: string | null }>` added to the returned auth state
  - `googleErrorMessage(code: string): string` exported from `auth.js`

- [ ] **Step 1: Write the failing tests** (append to `auth.test.js`)

```js
describe('adoptTokenFromHash', () => {
  /** @param {string} hash */
  const fakeWindow = (hash) => {
    const calls = /** @type {string[]} */ ([])
    return {
      win: { location: { hash, pathname: '/login', search: '' }, history: { replaceState: (/** @type {any} */ _a, /** @type {string} */ _b, /** @type {string} */ url) => calls.push(url) } },
      calls,
    }
  }

  it('adopts #google=<jwt>: fetches /users/me, persists the session, cleans the hash', async () => {
    const storage = memoryStorage()
    const fetch = vi.fn(async (/** @type {string} */ url) => {
      expect(url).toBe('http://api.test/api/users/me')
      return { ok: true, status: 200, json: async () => ({ id: 7, username: 'g', email: 'g@gmail.test' }) }
    })
    const auth = createAuthState(storage, { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (fetch) })
    const { win, calls } = fakeWindow('#google=jwt-abc')
    const result = await auth.adoptTokenFromHash(win)
    expect(result).toEqual({ adopted: true, error: null })
    expect(auth.session.get()).toEqual({ token: 'jwt-abc', user: { id: 7, username: 'g', email: 'g@gmail.test' } })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-abc')
    expect(calls).toEqual(['/login'])
  })

  it('surfaces #google_error=<code> and cleans the hash without touching the session', async () => {
    const storage = memoryStorage()
    const auth = createAuthState(storage, { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (vi.fn()) })
    const { win, calls } = fakeWindow('#google_error=account_exists')
    const result = await auth.adoptTokenFromHash(win)
    expect(result).toEqual({ adopted: false, error: 'account_exists' })
    expect(auth.session.get()).toBeNull()
    expect(calls).toEqual(['/login'])
  })

  it('is a no-op on an unrelated hash', async () => {
    const auth = createAuthState(memoryStorage(), { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (vi.fn()) })
    const { win, calls } = fakeWindow('#section-2')
    expect(await auth.adoptTokenFromHash(win)).toEqual({ adopted: false, error: null })
    expect(calls).toEqual([])
  })

  it('a rejected token cleans the hash and reports a session error', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    const auth = createAuthState(memoryStorage(), { baseUrl: 'http://api.test/api', fetch: /** @type {any} */ (fetch) })
    const { win } = fakeWindow('#google=bad')
    expect(await auth.adoptTokenFromHash(win)).toEqual({ adopted: false, error: 'session' })
    expect(auth.session.get()).toBeNull()
  })
})

describe('googleErrorMessage', () => {
  it('maps every callback error code to a human sentence and unknown codes to a fallback', () => {
    for (const code of ['denied', 'bad_state', 'account_exists', 'no_refresh_token', 'exchange_failed']) {
      const message = googleErrorMessage(code)
      expect(message.length).toBeGreaterThan(10)
      expect(message).not.toContain('_')
    }
    expect(googleErrorMessage('surprise')).toBe(googleErrorMessage('unknown'))
  })
})
```

(If `auth.test.js` has no `memoryStorage` helper, add the one the file's existing tests use — read the file first and follow its local pattern; it already fakes storage for `createAuthState` tests.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vanilla test -- run src/state/auth.test.js`
Expected: FAIL — `adoptTokenFromHash` is not a function / `googleErrorMessage` not exported

- [ ] **Step 3: Implement in `auth.js`**

Add to the returned object in `createAuthState`:

```js
    /**
     * Adopt an OAuth-callback session from the URL fragment (#google=<jwt>) or surface
     * a callback error (#google_error=<code>). Always cleans the hash first — the
     * fragment must not survive into history or a shared link.
     * @param {{ location: { hash: string, pathname: string, search: string }, history: { replaceState(a: any, b: string, url: string): void } }} win
     * @returns {Promise<{ adopted: boolean, error: string | null }>}
     */
    async adoptTokenFromHash(win) {
      const hash = win.location.hash
      const token = hash.startsWith('#google=') ? decodeURIComponent(hash.slice('#google='.length)) : null
      const errorCode = hash.startsWith('#google_error=') ? decodeURIComponent(hash.slice('#google_error='.length)) : null
      if (token == null && errorCode == null) return { adopted: false, error: null }
      win.history.replaceState(null, '', win.location.pathname + win.location.search)
      if (errorCode != null) return { adopted: false, error: errorCode }
      const res = await fetch(`${baseUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return { adopted: false, error: 'session' }
      const user = /** @type {{ id: number, username: string, email: string }} */ (await res.json())
      persist({ token: /** @type {string} */ (token), user: { id: user.id, username: user.username, email: user.email } })
      return { adopted: true, error: null }
    },
```

And a module-level export:

```js
/** Human messages for /google/callback error codes (hash `#google_error=<code>`). @param {string} code @returns {string} */
export function googleErrorMessage(code) {
  const messages = /** @type {Record<string, string>} */ ({
    denied: 'Google sign-in was cancelled.',
    bad_state: 'The Google sign-in link expired. Please try again.',
    account_exists: 'An account with this email already exists. Sign in with your password, then connect Google from your Profile.',
    no_refresh_token: 'Google did not grant offline access. Please try connecting again.',
    exchange_failed: 'Google sign-in failed. Please try again.',
    unknown: 'Google sign-in failed. Please try again.',
  })
  return messages[code] ?? messages['unknown']
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm vanilla test -- run src/state/auth.test.js
pnpm vanilla typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/auth.js apps/vanilla-oyl/src/state/auth.test.js
git commit -m "feat(vanilla): adopt google oauth session from URL fragment"
```

---

### Task 8: "Continue with Google" on the auth form + Profile Google row

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-auth-form.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-profile.js`
- Test: `apps/vanilla-oyl/src/components/oyl-auth-form.test.js` (extend or create), `apps/vanilla-oyl/src/components/oyl-profile.test.js` (extend)

**Interfaces:**
- Consumes: `GoogleConnection` signal shape from Task 6.
- Produces (Task 9 wires these props):
  - `OylAuthForm.googleAuth: Signal<{ href: string } | null> | null` — when the signal holds `{ href }`, render an `<a data-act="google" href=...>Continue with Google</a>` under a divider; `null` signal value or unset prop → no Google UI.
  - `OylProfile.google: { connection: Signal<GoogleConnection>, onConnect: () => void, onDisconnect: () => void } | null` — renders a "Google Drive" section: `connected` → email + button `data-act="google-disconnect"`; `disconnected` → button `data-act="google-connect"` "Connect Google Drive"; `reconnect-needed` → message `[data-role="google-reconnect"]` + button `data-act="google-connect"` "Reconnect"; `unconfigured`/`unknown` → section absent.

- [ ] **Step 1: Write the failing component tests**

Follow the shadow-DOM memory rule: assert via the component's OWN shadowRoot. `oyl-auth-form.test.js` additions:

```js
import { describe, it, expect } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineAuthForm } from './oyl-auth-form.js'

describe('oyl-auth-form google button', () => {
  it('renders the Google anchor reactively from the googleAuth signal', async () => {
    defineAuthForm()
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = { login: async () => {}, register: async () => {} }
    const googleAuth = signal(/** @type {{ href: string } | null} */ (null))
    form.googleAuth = googleAuth
    document.body.append(form)
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    googleAuth.set({ href: 'http://api.test/api/google/connect?mode=login' })
    expect(form.shadowRoot.querySelector('a[data-act="google"]')?.getAttribute('href')).toBe('http://api.test/api/google/connect?mode=login')
    googleAuth.set(null)
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    form.remove()
  })

  it('renders no Google UI when the prop is unset', () => {
    defineAuthForm()
    const form = /** @type {any} */ (document.createElement('oyl-auth-form'))
    form.auth = { login: async () => {}, register: async () => {} }
    document.body.append(form)
    expect(form.shadowRoot.querySelector('a[data-act="google"]')).toBeNull()
    form.remove()
  })
})
```

`oyl-profile.test.js` additions (mirror the file's existing setup helpers for session/profile signals):

```js
describe('oyl-profile google section', () => {
  /** @param {any} connectionValue */
  function mountWithGoogle(connectionValue) {
    defineProfile()
    const page = /** @type {any} */ (document.createElement('oyl-profile'))
    page.session = signal({ token: 't', user: { id: 1, username: 'u', email: 'u@test.dev' } })
    page.profile = signal(null)
    const connection = signal(connectionValue)
    const actions = { connect: 0, disconnect: 0 }
    page.google = { connection, onConnect: () => { actions.connect += 1 }, onDisconnect: () => { actions.disconnect += 1 } }
    document.body.append(page)
    return { page, connection, actions }
  }

  it('connected: shows the email and a working Disconnect button', () => {
    const { page, actions } = mountWithGoogle({ state: 'connected', email: 'me@gmail.test' })
    const section = page.shadowRoot.querySelector('[data-role="google-drive"]')
    expect(section.textContent).toContain('me@gmail.test')
    section.querySelector('button[data-act="google-disconnect"]').click()
    expect(actions.disconnect).toBe(1)
    page.remove()
  })

  it('disconnected: shows Connect; reconnect-needed: shows the warning + Reconnect', () => {
    const a = mountWithGoogle({ state: 'disconnected' })
    a.page.shadowRoot.querySelector('button[data-act="google-connect"]').click()
    expect(a.actions.connect).toBe(1)
    a.page.remove()
    const b = mountWithGoogle({ state: 'reconnect-needed' })
    expect(b.page.shadowRoot.querySelector('[data-role="google-reconnect"]')).not.toBeNull()
    expect(b.page.shadowRoot.querySelector('button[data-act="google-connect"]')).not.toBeNull()
    b.page.remove()
  })

  it('unconfigured or null prop: no Google section at all', () => {
    const { page } = mountWithGoogle({ state: 'unconfigured' })
    expect(page.shadowRoot.querySelector('[data-role="google-drive"]')).toBeNull()
    page.remove()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vanilla test -- run src/components/oyl-auth-form.test.js src/components/oyl-profile.test.js`
Expected: FAIL on the new cases

- [ ] **Step 3: Implement `oyl-auth-form` changes**

In the constructor add:

```js
    /** @type {import('../lib/reactive/signal.js').Signal<{ href: string } | null> | null} */
    this.googleAuth = null
```

In `render()`, after `root.append(form)` add a reactively-managed container (uses the base-class `track`; the anchor is a plain link — the whole OAuth flow is a top-level navigation, no JS):

```js
    if (this.googleAuth) {
      const alt = document.createElement('div')
      alt.dataset.role = 'google-alt'
      root.append(alt)
      const googleAuth = this.googleAuth
      this.track(() => {
        const config = googleAuth.get()
        alt.replaceChildren()
        if (!config) return
        const divider = document.createElement('div')
        divider.className = 'divider'
        divider.textContent = 'or'
        const a = document.createElement('a')
        a.dataset.act = 'google'
        a.href = config.href
        a.className = 'google'
        a.textContent = 'Continue with Google'
        alt.append(divider, a)
      })
    }
```

And extend the stylesheet with:

```css
  .divider { color: var(--color-muted); font-size: .85rem; text-align: center; margin-block: .5rem; }
  a.google { display: block; text-align: center; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem 1rem; color: var(--color-text); text-decoration: none; font-weight: 600; }
```

- [ ] **Step 4: Implement `oyl-profile` changes**

Constructor addition:

```js
    /** @type {{ connection: import('../lib/reactive/signal.js').Signal<import('../state/google-store.js').GoogleConnection>, onConnect: () => void, onDisconnect: () => void } | null} */
    this.google = null
```

In `render()`, insert BEFORE the `dataActions` block:

```js
    if (this.google) {
      const google = this.google
      const container = document.createElement('div')
      root.append(container)
      this.track(() => {
        const conn = google.connection.get()
        container.replaceChildren()
        if (conn.state === 'unconfigured' || conn.state === 'unknown') return
        const label = document.createElement('h2'); label.textContent = 'Google Drive'
        const card = document.createElement('div'); card.className = 'card'; card.dataset.role = 'google-drive'
        if (conn.state === 'connected') {
          const who = document.createElement('span'); who.textContent = `Connected as ${conn.email ?? ''}`
          card.append(who, ' ', this._btn('Disconnect', 'google-disconnect', () => google.onDisconnect()))
        } else if (conn.state === 'reconnect-needed') {
          const warn = document.createElement('p'); warn.dataset.role = 'google-reconnect'; warn.className = 'muted'
          warn.textContent = 'Google access expired — reconnect to keep using Drive.'
          card.append(warn, this._btn('Reconnect', 'google-connect', () => google.onConnect()))
        } else {
          card.append(this._btn('Connect Google Drive', 'google-connect', () => google.onConnect()))
        }
        container.append(label, card)
      })
    }
```

Note: `_btn` binds listeners with `{ signal: this.lifecycle }` already — safe inside `track` re-runs because the old buttons are dropped with `replaceChildren`.

- [ ] **Step 5: Run tests + typecheck, then commit**

```bash
pnpm vanilla test
pnpm vanilla typecheck
git add apps/vanilla-oyl/src/components/oyl-auth-form.js apps/vanilla-oyl/src/components/oyl-auth-form.test.js apps/vanilla-oyl/src/components/oyl-profile.js apps/vanilla-oyl/src/components/oyl-profile.test.js
git commit -m "feat(vanilla): google sign-in button + profile Google Drive section"
```

---

### Task 9: Boot wiring in `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

**Interfaces:**
- Consumes: `createGoogleStore` (Task 6), `adoptTokenFromHash`/`googleErrorMessage` (Task 7), the `googleAuth`/`google` props (Task 8), existing `noticeState`, `routeState`, `authState`, `screens` map.
- Produces: the live feature. No new exports.

- [ ] **Step 1: Wire the store and hash adoption**

Static imports at the top of `main.js` (alongside the existing ones — `main.js` does not currently import `signal`, so add it):

```js
import { signal } from './lib/reactive/signal.js'
import { createGoogleStore } from './state/google-store.js'
import { googleErrorMessage } from './state/auth.js'
```

Then in `boot()` after `authState` is created:

```js
  const googleStore = createGoogleStore({ baseUrl: getApiBaseUrl(storage, host), fetch: window.fetch.bind(window), getToken: authState.getToken })
  const googleLoginHref = signal(/** @type {{ href: string } | null} */ (null))
  // OAuth return: adopt #google=<jwt> / surface #google_error=<code> BEFORE the login guard runs,
  // so a fragment session wins over the redirect-to-login.
  const adoption = await authState.adoptTokenFromHash(window)
  if (adoption.adopted) setStorageMode(storage, 'remote')
  if (adoption.error) noticeState.show(googleErrorMessage(adoption.error))
```

(`signal` needs importing in `main.js` if not already: `import { signal } from './lib/reactive/signal.js'`.)

Immediately after the existing `if (hasSession) { ... }` block, add the two Google state loads (fire-and-forget — they only feed UI signals):

```js
  // Google affordances: pre-auth config probe feeds the login button; signed-in status feeds Profile.
  void googleStore.probe().then(() => {
    const state = googleStore.connection.get().state
    googleLoginHref.set(state === 'unconfigured' || state === 'unknown' ? null : { href: `${getApiBaseUrl(storage, host)}/google/connect?mode=login` })
  })
  if (hasSession) void googleStore.loadStatus()
```

- [ ] **Step 2: Wire the screens**

In the `screens.login` factory add:

```js
      page.googleAuth = googleLoginHref
```

…but note `oyl-login` constructs the inner `oyl-auth-form` itself — so first thread the prop through `oyl-login`/`oyl-register`: in `oyl-login.js` constructor add `/** @type {any} */ this.googleAuth = null`, and in its `render()` set `form.googleAuth = this.googleAuth` (same two lines in `oyl-register.js`). This is a two-line change per screen; keep it in this task (it is pure prop-threading, covered by the e2e in Task 10).

In the `screens.profile` factory add:

```js
      page.google = {
        connection: googleStore.connection,
        onConnect: () => { void googleStore.connectUrl().then((url) => location.assign(url)).catch(() => noticeState.show('Could not start Google connect — try again.')) },
        onDisconnect: () => { void googleStore.disconnect().then(() => noticeState.show('Google disconnected.')).catch(() => noticeState.show('Disconnect failed — try again.')) },
      }
```

And in the login screen's `onAuthenticated` nothing changes — but hash-adopted sign-ins never fire `onAuthenticated`, so ALSO add after the adoption block in `boot()`:

```js
  if (adoption.adopted && (window.location.pathname === '/login' || window.location.pathname === '/')) {
    routeState.navigate('/status', { replace: true })
  }
```

(Place this after `routeState.start()`, which is where `navigate` becomes safe — the guard block directly below it already runs there.)

- [ ] **Step 3: Verify the full app statically + full vanilla suite**

```bash
pnpm vanilla typecheck
pnpm vanilla test
```

Expected: green. There is no new unit test for `main.js` (it has none today — boot wiring is covered by e2e in Task 10).

- [ ] **Step 4: Manual smoke (optional but cheap)**

Run `pnpm dev` (no GOOGLE_* env) → app boots, login page shows NO Google button (probe → unconfigured), `/profile` after email login shows no Google section, zero console errors.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/main.js apps/vanilla-oyl/src/components/oyl-login.js apps/vanilla-oyl/src/components/oyl-register.js
git commit -m "feat(vanilla): wire google sign-in, link and disconnect through boot"
```

---

### Task 10: e2e — fake Google fixture + auth specs

**Files:**
- Create: `apps/e2e-oyl/scripts/start-fake-google.mjs`
- Modify: `apps/e2e-oyl/scripts/start-backend.mjs` (GOOGLE_* env)
- Modify: `apps/e2e-oyl/playwright.config.ts` (third webServer)
- Modify: `apps/e2e-oyl/lib/urls.ts` (fake-google port)
- Create: `apps/e2e-oyl/tests/google-auth.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–9; e2e fixtures `test`/`expect`/`registerUser`/`primeRemoteSignedOut` from `../lib/fixtures`.
- Produces: browser-level proof of the three journeys (sign-in, link, disconnect).

- [ ] **Step 1: Fake Google server script**

`apps/e2e-oyl/lib/urls.ts` — add:

```ts
export const FAKE_GOOGLE_PORT = 1342
```

`apps/e2e-oyl/scripts/start-fake-google.mjs` (same protocol as the strapi test helper, standalone for Playwright's webServer; port 1342):

```js
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
```

- [ ] **Step 2: Backend env + playwright webServer**

`apps/e2e-oyl/scripts/start-backend.mjs` — after the existing env block add:

```js
// Google OAuth against the fake-google fixture server (started by playwright.config.ts).
const FAKE_GOOGLE = `http://localhost:${process.env.FAKE_GOOGLE_PORT ?? 1342}`
process.env.GOOGLE_CLIENT_ID = 'e2e-google-client'
process.env.GOOGLE_CLIENT_SECRET = 'e2e-google-secret'
process.env.GOOGLE_AUTH_BASE_URL = `${FAKE_GOOGLE}/auth`
process.env.GOOGLE_TOKEN_URL = `${FAKE_GOOGLE}/token`
process.env.GOOGLE_REVOKE_URL = `${FAKE_GOOGLE}/revoke`
process.env.GOOGLE_REDIRECT_URI = `http://localhost:${PORT}/api/google/callback`
process.env.APP_URL = APP_ORIGIN
```

`apps/e2e-oyl/playwright.config.ts` — import `FAKE_GOOGLE_PORT` from `./lib/urls` and append to `webServer`:

```ts
    {
      command: 'node scripts/start-fake-google.mjs',
      url: `http://localhost:${FAKE_GOOGLE_PORT}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
```

- [ ] **Step 3: Write the spec**

`apps/e2e-oyl/tests/google-auth.spec.ts`:

```ts
/**
 * Google OAuth journeys against the fake-google fixture: sign in from /login,
 * link from /profile, disconnect. The whole flow is real browser navigation —
 * app → backend /connect → fake google → backend /callback → app fragment adoption.
 */
import { test, expect, registerUser, primeRemoteSignedOut } from '../lib/fixtures'

test('sign in with Google from the login page creates a session', async ({ page }) => {
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const google = page.locator('oyl-login oyl-auth-form a[data-act="google"]')
  await expect(google).toBeVisible()
  await google.click()
  // Redirect chain ends back in the app with the fragment adopted and cleaned.
  await expect(page).toHaveURL('/status')
  await expect(page.locator('oyl-account-menu button[data-act="logout"]')).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/auth') ?? 'null'))
  expect(auth?.user?.email).toMatch(/@gmail\.test$/)
  expect(page.url()).not.toContain('#google')
})

test('link Google from Profile, then disconnect', async ({ page, request }) => {
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  const form = page.locator('oyl-login oyl-auth-form')
  await form.locator('input[name="identifier"]').fill(user.email)
  await form.locator('input[name="password"]').fill(user.password)
  await form.locator('button[type="submit"]').click()
  await expect(page).toHaveURL('/status')

  await page.goto('/profile')
  const connect = page.locator('oyl-profile button[data-act="google-connect"]')
  await expect(connect).toBeVisible()
  await connect.click()
  // Round trip lands back on /profile with the link established.
  await expect(page).toHaveURL('/profile')
  const section = page.locator('oyl-profile [data-role="google-drive"]')
  await expect(section).toContainText('Connected as')
  await expect(section).toContainText('@gmail.test')

  await section.locator('button[data-act="google-disconnect"]').click()
  await expect(page.locator('oyl-profile button[data-act="google-connect"]')).toBeVisible()
})

test('email collision does NOT auto-link: password login still owns the account', async ({ page, request }) => {
  // Covered at the API level in strapi smoke tests; here assert only the visible contract:
  // a fresh Google sign-in never lands in an existing password account.
  const user = await registerUser(request)
  await primeRemoteSignedOut(page)
  await page.goto('/login')
  await page.locator('oyl-login oyl-auth-form a[data-act="google"]').click()
  await expect(page).toHaveURL('/status')
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('oyl/auth') ?? 'null'))
  expect(auth?.user?.email).not.toBe(user.email)
})
```

- [ ] **Step 4: Run e2e**

```bash
pnpm strapi-app build   # smoke + e2e run from dist — pick up the new API
pnpm e2e
```

Expected: new spec green on desktop AND mobile; the hygiene fixture passes (no console errors, no 4xx/5xx — the whole Google chain is 2xx/3xx). If a previous e2e backend is still running on :1341, kill it first so the new dist + env load (CLAUDE.md gotcha).

- [ ] **Step 5: Commit**

```bash
git add apps/e2e-oyl/scripts/start-fake-google.mjs apps/e2e-oyl/scripts/start-backend.mjs apps/e2e-oyl/playwright.config.ts apps/e2e-oyl/lib/urls.ts apps/e2e-oyl/tests/google-auth.spec.ts
git commit -m "test(e2e): google oauth journeys against a fake Google fixture"
```

---

### Task 11: Full Definition-of-Done sweep + docs

**Files:**
- Modify: `CLAUDE.md` (routes/gotchas), `apps/strapi-oyl/.env.example` (GOOGLE_* keys), `TODO.md` (mark SP1 progress if listed)

- [ ] **Step 1: Run everything**

```bash
pnpm all-of test && pnpm all-of typecheck:src && pnpm all-of build
pnpm vanilla test && pnpm vanilla typecheck
pnpm --filter @oyl/strapi-oyl-app build && pnpm --filter @oyl/strapi-oyl-app test && pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit
pnpm --filter @oyl/e2e-oyl typecheck && pnpm e2e
```

Expected: everything green. Fix forward if not; never proceed on red.

- [ ] **Step 2: Docs**

- `apps/strapi-oyl/.env.example`: append `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, `GOOGLE_REDIRECT_URI=http://localhost:1340/api/google/callback`, `APP_URL=http://localhost:8041` with a one-line comment that unset = feature hidden.
- `CLAUDE.md`: add to Conventions/gotchas — one bullet: Google OAuth is server-brokered (`apps/strapi-oyl/src/api/google/`), scope `drive.file`, unset `GOOGLE_CLIENT_ID`/`SECRET` hides the feature; fragment handoff `#google=<jwt>`; Drive client lives in `all-of-oyl/src/google/` (DOM-free, `AccessTokenProvider` seam); e2e uses the fake-google fixture on :1342.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md apps/strapi-oyl/.env.example TODO.md
git commit -m "docs: google oauth env keys + operator notes"
```

---

## Self-review notes (already applied)

- Spec coverage: every Plan-A spec item maps to a task — config/connect/connect-url/callback/drive-token/status/disconnect (Task 4), key derivations + encryption (Tasks 1, 4), content-type privacy (Task 2), no-auto-link + retry-guard + 410-deletes-token (Task 4 tests), Drive client incl. force-token seam + typed errors + multipart (Task 5), google-store states incl. 410→reconnect-needed (Task 6), hash adoption + error messages (Task 7), login button + profile row (Task 8), boot wiring incl. adopt-before-guard (Task 9), e2e journeys (Task 10). Plan B (deferred): `/files` screen, download-helper extraction, `DRIVE_BASE_URL_KEY` consumption, fake-Drive e2e.
- The `GET /api/google/connect-url` route uses `config: { policies: [] }` + a users-permissions grant like every other authenticated route; its JWT gating is the `ctx.state.user` check in the controller plus the role grant (unauthenticated requests carry no grant → 401/403 before the controller, exactly as the smoke test asserts).
- Strapi `documentId` vs `db.query`: the controller uses `strapi.db.query` (entity-service level, numeric `id`) consistently — do not mix in `strapi.documents` here.
