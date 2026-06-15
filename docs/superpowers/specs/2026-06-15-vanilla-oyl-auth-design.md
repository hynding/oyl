# Backend SP3 — client auth (JWT acquisition + state) for vanilla-oyl — Design

**Status:** approved (local-first, Status placement; R-A–R-E)
**Date:** 2026-06-15
**Package:** `apps/vanilla-oyl`
**Context:** SP1 (client `HttpRepository` + protocol) and SP2 (conformant Strapi backend) are done. **SP3 gives vanilla-oyl the ability to obtain and hold a JWT** — the `getToken` function SP4 will hand to `createHttpClient`. SP3 adds the auth *capability*; it does **not** wire the HTTP adapter or switch storage (SP4). The app stays local-first — sign-in is optional and changes nothing locally yet.

---

## What this is

An auth state module (mirroring `theme.js`) + a reusable `oyl-auth` component (sign in / register / signed-in status), mounted on the Status screen. Plus a small `getApiBaseUrl` config seam. Token in localStorage; reactive signal drives the UI; `getToken` is the SP4 seam.

### Decisions (settled)

1. **`state/auth.js` — `createAuthState(storage, { baseUrl, fetch })`** (the `createThemeState` shape): a reactive `auth` signal `{ token, user } | null` hydrated from localStorage; `login`/`register`/`logout`/`getToken`/`refresh`.
2. **Local-first, sign-in optional (fork B).** The app works fully without login; SP4 decides when the remote (auth-requiring) adapter is active.
3. **Auth UI on the Status screen (fork A).** `oyl-status-panel` gains an `auth` prop and renders an **Account** section hosting `<oyl-auth>` — no new nav item. (SP4 may promote placement if remote becomes the default.)
4. **Token lifecycle (R-A).** `logout()`/`clear` is the invalidation mechanism; **SP4 wires the adapter's `HttpRepositoryError('auth')` (401) → `authState.logout()`** to re-prompt login. On boot, **hydrate the token optimistically** and rely on the server's 401 to invalidate — **no client-side JWT decode/verify** (server's job; avoids a dep).
5. **localStorage token (R-C, deliberate).** Acceptable here: the app is createElement-only with a no-`innerHTML` security hook (low XSS surface) and Strapi returns a **bearer** token by design. httpOnly-cookie is rejected (needs server CSRF cooperation the generic backend lacks). Reactive signal mirrors theme state (R-E).
6. **Multi-tab sync (R-D).** `authState.refresh()` re-reads the token; `main.js` wires it to the `storage` event (like theme/data) so logout/login propagates across tabs.
7. **Config seam (R-E).** `getApiBaseUrl(storage)` — a localStorage-overridable default (dev: `http://localhost:1340/api`, the SP2 app's dev port). The **settings UI** to change it is SP4.
8. **Login + register (fork C).** `oyl-auth` toggles modes (the `.seg` pattern); both supported.

### Out of scope (→ SP4 / SP5)

- Wiring `HttpRepository`/`createHttpClient` with `getToken`; the local-vs-remote `makeRepositories` switch; the backend-URL settings editor; connecting the 401→logout trigger. All SP4. Offline sync = SP5.

---

## Domain / endpoints (Strapi users-permissions, standard)
- **login:** `POST {baseUrl}/auth/local` `{ identifier, password }` → `{ jwt, user }` (`identifier` = username or email).
- **register:** `POST {baseUrl}/auth/local/register` `{ username, email, password }` → `{ jwt, user }`.
- Errors: 400/401 with `{ error: { message } }`.

---

## Architecture — `apps/vanilla-oyl/src/`

### `storage/keys.js` — add keys
```js
export const AUTH_KEY = 'oyl/auth'
export const API_BASE_URL_KEY = 'oyl/api-base-url'
```

### `storage/config.js` (new) — `getApiBaseUrl`
```js
import { API_BASE_URL_KEY } from './keys.js'
const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'
/** Backend base URL (overridable via localStorage). @param {{ getItem(k: string): string | null }} storage */
export function getApiBaseUrl(storage) {
  return storage.getItem(API_BASE_URL_KEY) || DEFAULT_API_BASE_URL
}
```

### `state/auth.js` (new) — `createAuthState`
```js
import { signal } from '../lib/reactive/signal.js'
import { AUTH_KEY } from '../storage/keys.js'
// @typedef AuthUser = { id: number, username: string, email: string }
// @typedef AuthSession = { token: string, user: AuthUser } | null

function readSession(storage) {
  try { const raw = storage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/** @param {AppStorage} storage @param {{ baseUrl: string, fetch: typeof globalThis.fetch }} opts */
export function createAuthState(storage, { baseUrl, fetch }) {
  const session = signal(/** @type {AuthSession} */ (readSession(storage)))
  const persist = (s) => { if (s) storage.setItem(AUTH_KEY, JSON.stringify(s)); else storage.removeItem(AUTH_KEY); session.set(s) }

  async function authRequest(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error?.message || `auth failed (${res.status})`)
    persist({ token: data.jwt, user: data.user })
    return data.user
  }

  return {
    session,
    /** @param {string} identifier @param {string} password */
    login: (identifier, password) => authRequest('/auth/local', { identifier, password }),
    /** @param {string} username @param {string} email @param {string} password */
    register: (username, email, password) => authRequest('/auth/local/register', { username, email, password }),
    logout: () => persist(null),
    /** SP4 hands this to createHttpClient. @returns {Promise<string | null>} */
    getToken: async () => session.get()?.token ?? null,
    /** Multi-tab: re-read from storage. */
    refresh: () => session.set(readSession(storage)),
  }
}
```

### `components/oyl-auth.js` (new) — sign in / register / status
A web component (OylElement) with an `auth` prop (the auth state). Reactive on `auth.session`:
- **Signed out:** a `.seg` Login|Register toggle; a `form` with an `identifier`/`username`+`email` field set (per mode) and a `password` input — **R-B: `type="password"`, `autocomplete` (`username`/`email`/`current-password`/`new-password`), `aria-label`s**; a submit button; an inline `[data-role="error"]` live region. Submit (async, with a **pending** disabled state) → `auth.login(...)` / `auth.register(...)`; on rejection, show the error message; on success, the signal flips → signed-in view.
- **Signed in:** shows `user.username`/`email` + a **Sign out** button → `auth.logout()`.
`defineAuth()` idempotent.

### `components/oyl-status-panel.js` — host the Account section
Add an `auth` prop; in `render()`, define + append an **Account** `section-label` + `<oyl-auth>` (`authEl.auth = this.auth`) after the existing cards.

### `main.js` — wire it
```js
import { createAuthState } from './state/auth.js'
import { getApiBaseUrl } from './storage/config.js'
// in boot():
const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window) })
// status route: panel.auth = authState
// storage event: if (e.key === AUTH_KEY) authState.refresh()
```

---

## Testing (Vitest + happy-dom)

- **`state/auth.test.js`** (injected fake `fetch`): `login` success → session signal set, persisted to `AUTH_KEY`, `getToken` returns the jwt; `login` failure (non-ok) → throws with the server message, session stays null/unchanged; `register` parallels login; `logout` → signal null + `AUTH_KEY` removed; construct with a stored session → hydrated; `refresh` re-reads storage; the fake asserts the right path (`/auth/local` vs `/auth/local/register`) + body shape.
- **`components/oyl-auth.test.js`** (happy-dom, a fake/real auth state over a fake fetch or a stub): signed-out renders the form; submit → calls `login` with the entered identifier/password; a rejected login shows the error text; toggling to Register shows username+email and submit → `register`; signed-in state shows the user + Sign out → `logout`. (Assert via `oyl-auth`'s own shadow root per the shadow-DOM testing rule.)
- **`oyl-status-panel`**: smoke that the Account section renders an `<oyl-auth>` wired to `auth`.

## File structure
```
apps/vanilla-oyl/src/
  storage/keys.js                 (modify: AUTH_KEY, API_BASE_URL_KEY)
  storage/config.js               (new: getApiBaseUrl)
  state/auth.js                   (new: createAuthState) + auth.test.js
  components/oyl-auth.js          (new) + oyl-auth.test.js
  components/oyl-status-panel.js   (modify: auth prop + Account section)
  main.js                         (modify: createAuthState + status wiring + storage-event refresh)
```
No HttpRepository wiring, no storage switch (SP4). Pure-helper/domain code untouched.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass against a **running SP2 backend** (`pnpm strapi-app develop`, port 1340): on `#/status`, the Account section shows a Login/Register form; registering a new user (or logging in) flips it to a signed-in view with the username + Sign out; reloading the page keeps you signed in (token persisted); Sign out clears it. `authState.getToken()` returns the JWT when signed in, `null` when out — ready for SP4 to feed it to the HTTP adapter and wire 401→logout.
