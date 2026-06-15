# Backend SP3 — client auth (JWT) for vanilla-oyl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). Tasks 1–2 are pure Vitest/happy-dom (fake `fetch`). Task 3 wires it + adds CORS to the backend; its full verification is a manual real-Chrome pass against a running Strapi.

**Goal:** vanilla-oyl can acquire/hold a JWT — `createAuthState` (login/register/logout/`getToken`) + an `oyl-auth` UI on the Status screen + a backend-URL config seam. Local-first; the `HttpRepository` wiring is SP4.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-auth-design.md`

**Branch:** `feat/vanilla-oyl-auth` (off `master` HEAD). Baseline: `pnpm vanilla test` green.

---

### Task 1: Config seam + auth state

**Files:** `storage/keys.js` (modify), `storage/config.js` (new), `state/auth.js` (new) + `state/auth.test.js`.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/state/auth.test.js`:
```js
import { describe, expect, it, vi } from 'vitest'
import { createAuthState } from './auth.js'
import { AUTH_KEY } from '../storage/keys.js'

/** @param {Record<string,string>} [seed] */
function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed))
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), _map: m }
}
const okFetch = (jwt = 'jwt-1', user = { id: 1, username: 'a', email: 'a@x.dev' }) =>
  vi.fn(async () => new Response(JSON.stringify({ jwt, user }), { status: 200 }))
const errFetch = (status = 400, message = 'Invalid identifier or password') =>
  vi.fn(async () => new Response(JSON.stringify({ error: { message } }), { status }))

describe('createAuthState', () => {
  it('login posts to /auth/local, sets session, persists, and getToken returns the jwt', async () => {
    const storage = fakeStorage(); const fetch = okFetch()
    const auth = createAuthState(storage, { baseUrl: 'http://x/api', fetch })
    const user = await auth.login('a', 'pw')
    expect(user.username).toBe('a')
    expect(String(fetch.mock.calls[0][0])).toBe('http://x/api/auth/local')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ identifier: 'a', password: 'pw' })
    expect(auth.session.get().token).toBe('jwt-1')
    expect(await auth.getToken()).toBe('jwt-1')
    expect(JSON.parse(storage._map.get(AUTH_KEY)).token).toBe('jwt-1')
  })

  it('register posts to /auth/local/register', async () => {
    const fetch = okFetch()
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    await auth.register('a', 'a@x.dev', 'pw')
    expect(String(fetch.mock.calls[0][0])).toBe('http://x/api/auth/local/register')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ username: 'a', email: 'a@x.dev', password: 'pw' })
  })

  it('rejects with the server message on failure; session stays null', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: errFetch(400, 'nope') })
    await expect(auth.login('a', 'bad')).rejects.toThrow('nope')
    expect(auth.session.get()).toBeNull()
  })

  it('hydrates a stored session; getToken returns it; logout clears storage + signal', async () => {
    const storage = fakeStorage({ [AUTH_KEY]: JSON.stringify({ token: 't', user: { id: 1, username: 'a', email: 'a@x.dev' } }) })
    const auth = createAuthState(storage, { baseUrl: 'http://x/api', fetch: okFetch() })
    expect(await auth.getToken()).toBe('t')
    auth.logout()
    expect(auth.session.get()).toBeNull()
    expect(storage._map.get(AUTH_KEY)).toBeUndefined()
  })

  it('getToken returns null when signed out', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: okFetch() })
    expect(await auth.getToken()).toBeNull()
  })
})
```

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/auth.test.js` → cannot resolve `./auth.js` / `AUTH_KEY`.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/storage/keys.js`, add:
```js
export const AUTH_KEY = 'oyl/auth'
export const API_BASE_URL_KEY = 'oyl/api-base-url'
```
Create `apps/vanilla-oyl/src/storage/config.js`:
```js
import { API_BASE_URL_KEY } from './keys.js'
const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'
/** Backend base URL (overridable via localStorage). @param {{ getItem(k: string): string | null }} storage @returns {string} */
export function getApiBaseUrl(storage) {
  return storage.getItem(API_BASE_URL_KEY) || DEFAULT_API_BASE_URL
}
```
Create `apps/vanilla-oyl/src/state/auth.js`:
```js
import { signal } from '../lib/reactive/signal.js'
import { AUTH_KEY } from '../storage/keys.js'

/** @typedef {{ id: number, username: string, email: string }} AuthUser */
/** @typedef {{ token: string, user: AuthUser } | null} AuthSession */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }} AppStorage */

/** @param {AppStorage} storage @returns {AuthSession} */
function readSession(storage) {
  try { const raw = storage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/** Auth state: a session signal + login/register/logout/getToken/refresh. @param {AppStorage} storage @param {{ baseUrl: string, fetch: typeof globalThis.fetch }} opts */
export function createAuthState(storage, { baseUrl, fetch }) {
  const session = signal(/** @type {AuthSession} */ (readSession(storage)))
  /** @param {AuthSession} s */
  const persist = (s) => {
    if (s) storage.setItem(AUTH_KEY, JSON.stringify(s))
    else storage.removeItem(AUTH_KEY)
    session.set(s)
  }
  /** @param {string} path @param {Record<string, string>} body @returns {Promise<AuthUser>} */
  async function authRequest(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = /** @type {any} */ (await res.json().catch(() => ({})))
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
    /** Multi-tab: re-read the session from storage. */
    refresh: () => session.set(readSession(storage)),
  }
}
```

- [ ] **Step 4: Run; verify PASS** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/auth.test.js` → 5 pass.
- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/vanilla-oyl typecheck` → clean.
- [ ] **Step 6: Commit**
```bash
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/config.js apps/vanilla-oyl/src/state/auth.js apps/vanilla-oyl/src/state/auth.test.js
git commit -m "feat(vanilla-oyl): auth state (login/register/logout/getToken) + api base-url config"
```

---

### Task 2: `oyl-auth` component

**Files:** `components/oyl-auth.js` (new) + `oyl-auth.test.js`.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/components/oyl-auth.test.js`:
```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { createAuthState } from '../state/auth.js'
import { defineAuth } from './oyl-auth.js'

beforeAll(() => defineAuth())
const settle = () => new Promise((r) => setTimeout(r, 0))
function fakeStorage() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) } }
const okFetch = () => vi.fn(async () => new Response(JSON.stringify({ jwt: 't', user: { id: 1, username: 'ada', email: 'ada@x.dev' } }), { status: 200 }))

/** @param {any} auth */
function mount(auth) {
  const el = /** @type {any} */ (document.createElement('oyl-auth'))
  el.auth = auth
  document.body.append(el)
  return el
}
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-auth>', () => {
  it('logs in and shows the signed-in user', async () => {
    const fetch = okFetch()
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, 'input[name="identifier"]').value = 'ada'
    q(el, 'input[name="password"]').value = 'pw'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(String(fetch.mock.calls[0][0])).toContain('/auth/local')
    expect(el.shadowRoot.textContent).toContain('ada')
    el.remove()
  })

  it('switches to register and posts to /auth/local/register', async () => {
    const fetch = okFetch()
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, '.seg button[data-value="register"]').click()
    await Promise.resolve()
    q(el, 'input[name="username"]').value = 'ada'
    q(el, 'input[name="email"]').value = 'ada@x.dev'
    q(el, 'input[name="password"]').value = 'pw'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(String(fetch.mock.calls[0][0])).toContain('/auth/local/register')
    el.remove()
  })

  it('shows the server error on failed login', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad creds' } }), { status: 400 }))
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch })
    const el = mount(auth)
    await Promise.resolve()
    q(el, 'input[name="identifier"]').value = 'a'
    q(el, 'input[name="password"]').value = 'x'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(q(el, '[data-role="error"]').textContent).toContain('bad creds')
    el.remove()
  })

  it('signed-in state shows sign out, which logs out', async () => {
    const auth = createAuthState(fakeStorage(), { baseUrl: 'http://x/api', fetch: okFetch() })
    await auth.login('ada', 'pw')
    const el = mount(auth)
    await Promise.resolve()
    const out = q(el, 'button[data-act="signout"]')
    expect(out).toBeTruthy()
    out.click()
    await Promise.resolve()
    expect(auth.session.get()).toBeNull()
    el.remove()
  })
})
```

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-auth.test.js` → cannot resolve `./oyl-auth.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-auth.js`:
```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/auth.js').createAuthState>} AuthState */

const styles = sheet(`
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  form { display: grid; gap: .5rem; max-inline-size: 22rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  input[hidden] { display: none; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  button.primary:disabled { opacity: .6; cursor: default; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
  .who { display: flex; align-items: center; gap: .75rem; }
  .who button { font: inherit; background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .4rem .8rem; cursor: pointer; color: var(--color-text); }
`)

export class OylAuth extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {AuthState} */
    this.auth = /** @type {AuthState} */ (/** @type {unknown} */ (undefined))
    this._mode = /** @type {import('../lib/reactive/signal.js').Signal<'login'|'register'>} */ (signal('login'))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    // signed-out view
    const out = document.createElement('div')
    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Auth mode')
    const loginBtn = this._segButton('login', 'Sign in')
    const registerBtn = this._segButton('register', 'Register')
    seg.append(loginBtn, registerBtn)

    const form = document.createElement('form')
    const identifier = this._input('identifier', 'text', 'Username or email', 'username')
    const username = this._input('username', 'text', 'Username', 'username')
    const email = this._input('email', 'email', 'Email', 'email')
    const password = this._input('password', 'password', 'Password', 'current-password')
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')
    form.append(identifier, username, email, password, submit, error)
    out.append(seg, form)

    // signed-in view
    const inn = document.createElement('div')
    inn.className = 'who'
    const who = document.createElement('span')
    const signout = document.createElement('button')
    signout.dataset.act = 'signout'
    signout.textContent = 'Sign out'
    signout.addEventListener('click', () => this.auth.logout(), { signal: this.lifecycle })
    inn.append(who, signout)

    root.append(out, inn)

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      submit.disabled = true
      try {
        if (this._mode.get() === 'login') await this.auth.login(identifier.value, password.value)
        else await this.auth.register(username.value, email.value, password.value)
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      } finally {
        submit.disabled = false
      }
    }, { signal: this.lifecycle })

    this.track(() => {
      const s = this.auth.session.get()
      out.hidden = !!s
      inn.hidden = !s
      if (s) who.textContent = `Signed in as ${s.user.username}`

      const mode = this._mode.get()
      const isLogin = mode === 'login'
      identifier.hidden = !isLogin
      username.hidden = isLogin
      email.hidden = isLogin
      password.autocomplete = isLogin ? 'current-password' : 'new-password'
      submit.textContent = isLogin ? 'Sign in' : 'Create account'
      loginBtn.setAttribute('aria-pressed', String(isLogin))
      registerBtn.setAttribute('aria-pressed', String(!isLogin))
    })
  }

  /** @param {string} name @param {string} type @param {string} label @param {string} autocomplete */
  _input(name, type, label, autocomplete) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    i.placeholder = label
    i.setAttribute('aria-label', label)
    i.autocomplete = autocomplete
    return i
  }

  /** @param {'login'|'register'} value @param {string} label @returns {HTMLButtonElement} */
  _segButton(value, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.value = value
    b.textContent = label
    b.addEventListener('click', () => this._mode.set(value), { signal: this.lifecycle })
    return b
  }
}

/** Register the element (idempotent). */
export function defineAuth() {
  if (!customElements.get('oyl-auth')) customElements.define('oyl-auth', OylAuth)
}
```

- [ ] **Step 4: Run; verify PASS** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-auth.test.js` → 4 pass.
- [ ] **Step 5: Typecheck** — clean.
- [ ] **Step 6: Commit**
```bash
git add apps/vanilla-oyl/src/components/oyl-auth.js apps/vanilla-oyl/src/components/oyl-auth.test.js
git commit -m "feat(vanilla-oyl): oyl-auth component (sign in / register / signed-in status)"
```

---

### Task 3: Wire into the app + backend CORS

**Files:** `components/oyl-status-panel.js` (modify), `main.js` (modify), `apps/strapi-oyl/config/middlewares.ts` (modify).

- [ ] **Step 1: Write the failing test**

Add to `apps/vanilla-oyl/src/components/oyl-status-panel.test.js` (create if absent; it has a `defineStatusPanel` registrar):
```js
  it('renders an Account section with oyl-auth wired to the auth state', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    const auth = { session: { get: () => null, set: () => {} }, logout: () => {} } // minimal stub
    el.auth = auth
    document.body.append(el)
    await Promise.resolve()
    const authEl = /** @type {any} */ (el.shadowRoot.querySelector('oyl-auth'))
    expect(authEl).toBeTruthy()
    expect(authEl.auth).toBe(auth)
    el.remove()
  })
```
(If a full `createAuthState` stub is easier, use a real one over a fake storage+fetch.)

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-status-panel.test.js` → no `oyl-auth` in the panel.

- [ ] **Step 3: Implement — status panel Account section**

In `apps/vanilla-oyl/src/components/oyl-status-panel.js`:
- import `defineAuth` from `./oyl-auth.js`.
- add an `auth` field to the constructor: `this.auth = /** @type {any} */ (null)`.
- in `render()`, call `defineAuth()`, build an Account section after `actions`, and append it:
```js
    defineAuth()
    const accountLabel = document.createElement('h2')
    accountLabel.textContent = 'Account'
    accountLabel.style.fontSize = 'var(--step-1)'
    const authEl = /** @type {import('./oyl-auth.js').OylAuth} */ (document.createElement('oyl-auth'))
    authEl.auth = this.auth
    root.append(h2, grid, actions, accountLabel, authEl)
```
(replace the existing `root.append(h2, grid, actions)` with the line above).

- [ ] **Step 4: Implement — main.js wiring**

In `apps/vanilla-oyl/src/main.js`:
- imports: `import { createAuthState } from './state/auth.js'`, `import { getApiBaseUrl } from './storage/config.js'`, and add `AUTH_KEY` to the `./storage/keys.js` import.
- in `boot()`, after `dataState`: `const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window) })`.
- in the `storage` event handler, add a branch: `else if (e.key === AUTH_KEY) authState.refresh()`.
- in the `status:` route, set `panel.auth = authState` (alongside `panel.actions = …`).

- [ ] **Step 5: Implement — backend CORS (R-A2)**

In `apps/strapi-oyl/config/middlewares.ts`, replace the `'strapi::cors'` string entry with:
```ts
  { name: 'strapi::cors', config: { origin: ['http://localhost:8041', 'http://localhost:5173'], credentials: false } },
```

- [ ] **Step 6: Run the gate** — `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck` → green. Also `pnpm --filter @oyl/strapi-oyl-app exec strapi build` → still builds (CORS config valid).

- [ ] **Step 7: Commit**
```bash
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/main.js apps/strapi-oyl/config/middlewares.ts apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "feat(vanilla-oyl): mount oyl-auth on Status + wire authState; allow vanilla origin in strapi CORS"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` + `typecheck` green; `pnpm --filter @oyl/strapi-oyl-app exec strapi build` clean.
- [ ] Real-Chrome acceptance (controller, after all tasks): start the backend (`pnpm strapi-app develop`, port 1340) and `pnpm vanilla dev` (8041). On `#/status` → Account section: register a new user → flips to "Signed in as …"; reload → still signed in; Sign out → back to the form; a wrong-password login shows the server error. (CORS from :8041 → :1340 succeeds.) `authState.getToken()` returns the JWT — ready for SP4.
