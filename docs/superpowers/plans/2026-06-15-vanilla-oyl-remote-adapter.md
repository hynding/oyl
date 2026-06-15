# Backend SP4a — wire the HTTP adapter into vanilla-oyl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`). Tasks 1–3 are unit-testable; Task 4 is app wiring whose full verification is a manual real-Chrome pass against a running Strapi.

**Goal:** vanilla-oyl persists to the backend in `remote` mode — `makeRepositories` builds `HttpRepository`s (vs LocalStorage) by config, with auth `getToken` + a 401→logout edge, boot resilience, and a global sync-error notice.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-remote-adapter-design.md`

**Branch:** `feat/vanilla-oyl-remote-adapter` (off `master`). Baseline: `pnpm vanilla test` + `pnpm all-of test` green.

---

### Task 1: `createHttpClient` `onAuthError` (@oyl/all-of-oyl)

**Files:** `packages/all-of-oyl/src/core/http-repository.ts` + `http-repository.test.ts`.

- [ ] **Step 1: Failing test** — add to `http-repository.test.ts`:
```ts
it('calls onAuthError before throwing on a 401', async () => {
  const onAuthError = vi.fn()
  const fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })) as any
  const repo = createHttpRepository(createHttpClient({ baseUrl: 'http://x', fetch, getToken: async () => 't', onAuthError }), 'lifeAreas', COLLECTIONS.lifeAreas)
  await expect(repo.list()).rejects.toMatchObject({ kind: 'auth' })
  expect(onAuthError).toHaveBeenCalledTimes(1)
})
```
- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.test.ts` (onAuthError not yet an option → not called).
- [ ] **Step 3: Implement** — in `createHttpClient`'s opts type add `onAuthError?: () => void`; in `request`, change the 401/403 branch to call it first:
```ts
      if (res.status === 401 || res.status === 403) {
        opts.onAuthError?.()
        throw new HttpRepositoryError('auth', `unauthorized (${res.status})`, res.status)
      }
```
- [ ] **Step 4: Run; verify PASS** — same command → green.
- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` clean.
- [ ] **Step 6: Commit**
```bash
git add packages/all-of-oyl/src/core/http-repository.ts packages/all-of-oyl/src/core/http-repository.test.ts
git commit -m "feat(all-of-oyl): createHttpClient onAuthError hook (fires on 401/403)"
```

---

### Task 2: Adapter switch + mode config + parallel refresh

**Files:** `apps/vanilla-oyl/src/storage/keys.js`, `storage/config.js`, `storage/bootstrap.js` (+ `bootstrap.test.js`), `state/data.js` (+ `data.test.js`).

- [ ] **Step 1: Failing tests**

`apps/vanilla-oyl/src/storage/bootstrap.test.js` (new):
```js
import { describe, expect, it, vi } from 'vitest'
import { makeRepositories } from './bootstrap.js'

function fakeStorage() { const m = new Map(); return { /** @param {string} k */ getItem: (k) => m.get(k) ?? null, /** @param {string} k @param {string} v */ setItem: (k, v) => void m.set(k, v), /** @param {number} i */ key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } } }

describe('makeRepositories', () => {
  it('builds local repos by default', () => {
    const repos = makeRepositories(/** @type {any} */ (fakeStorage()))
    expect(repos.entries).toBeTruthy()
    expect(repos.entries.constructor.name).toBe('LocalStorageRepository')
  })
  it('builds http repos when a client is given (repo.list calls the client)', async () => {
    const client = { request: vi.fn(async () => ({ records: [] })) }
    const repos = makeRepositories(/** @type {any} */ (fakeStorage()), { client: /** @type {any} */ (client) })
    await repos.entries.list()
    expect(client.request).toHaveBeenCalledWith('GET', '/entries')
  })
})
```
Add to `apps/vanilla-oyl/src/state/data.test.js`:
```js
  it('uses an http client when one is provided', async () => {
    const client = { request: vi.fn(async () => ({ records: [] })) }
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage), { client: /** @type {any} */ (client) })
    await ds.journal.transactionsIn(periodWindowOf('month', DayKey.from(new Date(), defaultTimezone()))) // touches the journal store
    await ds.refresh() // hydrate via the client (GET per collection)
    expect(client.request).toHaveBeenCalled()
  })
```
(Adjust to whatever minimal call proves the client is wired; the point is `createDataState(…, { client })` routes through it.)

- [ ] **Step 2: Run; verify FAIL** — `pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/bootstrap.test.js src/state/data.test.js`.

- [ ] **Step 3: Implement**

`storage/keys.js`: add `export const STORAGE_MODE_KEY = 'oyl/storage-mode'`.
`storage/config.js`: add
```js
import { STORAGE_MODE_KEY } from './keys.js' // (extend the existing import line)
/** 'local' | 'remote' (default local). @param {{ getItem(k: string): string | null }} storage @returns {'local'|'remote'} */
export function getStorageMode(storage) {
  return storage.getItem(STORAGE_MODE_KEY) === 'remote' ? 'remote' : 'local'
}
```
`storage/bootstrap.js`:
```js
import { COLLECTIONS, LocalStorageRepository, createHttpRepository } from '@oyl/all-of-oyl'
// ...
/** @param {import('@oyl/all-of-oyl').StorageLike} storage @param {{ client?: import('@oyl/all-of-oyl').HttpClient }} [opts] @returns {Repositories} */
export function makeRepositories(storage, opts = {}) {
  const repos = /** @type {Repositories} */ ({})
  for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
    const codec = /** @type {any} */ (COLLECTIONS[name])
    repos[name] = opts.client
      ? /** @type {any} */ (createHttpRepository(opts.client, name, codec))
      : new LocalStorageRepository(storage, dataKey(name), codec, now)
  }
  return repos
}
```
(Update the `Repositories` typedef to `Repository<any>` rather than `LocalStorageRepository<any>` so both adapters fit.)
`state/data.js`: signature `createDataState(storage, themeState, opts = {})`; `const repos = makeRepositories(storage, { client: opts.client })`. Replace `refresh()` with the `Promise.allSettled` version (R-B/R-E) from the spec — parallel, one aggregated throw on any rejection, no leaked rejections.

- [ ] **Step 4: Run; verify PASS** — the new tests + existing data/bootstrap tests green.
- [ ] **Step 5: Typecheck** — `pnpm --filter @oyl/vanilla-oyl typecheck` clean.
- [ ] **Step 6: Commit**
```bash
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/config.js apps/vanilla-oyl/src/storage/bootstrap.js apps/vanilla-oyl/src/storage/bootstrap.test.js apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): makeRepositories http/local adapter switch + storage-mode config + parallel allSettled refresh"
```

---

### Task 3: Notice state + `oyl-notice` banner

**Files:** `state/notice.js` (+ test), `components/oyl-notice.js` (+ test).

- [ ] **Step 1: Failing tests**

`apps/vanilla-oyl/src/state/notice.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { createNoticeState } from './notice.js'
describe('createNoticeState', () => {
  it('show sets and clear resets the notice signal', () => {
    const n = createNoticeState()
    expect(n.notice.get()).toBeNull()
    n.show('boom'); expect(n.notice.get()).toBe('boom')
    n.clear(); expect(n.notice.get()).toBeNull()
  })
})
```
`apps/vanilla-oyl/src/components/oyl-notice.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { createNoticeState } from '../state/notice.js'
import { defineNotice } from './oyl-notice.js'
beforeAll(() => defineNotice())
describe('<oyl-notice>', () => {
  it('shows the message and dismiss clears it', async () => {
    const n = createNoticeState(); n.show('Sync failed')
    const el = /** @type {any} */ (document.createElement('oyl-notice'))
    el.notice = n.notice
    document.body.append(el)
    await Promise.resolve()
    expect(el.shadowRoot.textContent).toContain('Sync failed')
    /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="dismiss"]')).click()
    n.clear() // dismiss wires to clear via the notice prop owner; here assert the banner hides on null
    await Promise.resolve()
    expect(el.shadowRoot.querySelector('[role="alert"]')?.hidden).not.toBe(false)
    el.remove()
  })
})
```
(The dismiss button calls a clear callback; the simplest wiring: `oyl-notice` takes `notice` (signal) + `onDismiss`; the test sets both. Adjust the test to whatever clean API you implement — the contract: renders the message when non-null, dismiss hides it.)

- [ ] **Step 2: Run; verify FAIL.**

- [ ] **Step 3: Implement**

`state/notice.js`:
```js
import { signal } from '../lib/reactive/signal.js'
/** A single transient app notice (boot/sync errors). */
export function createNoticeState() {
  const notice = signal(/** @type {string | null} */ (null))
  return { notice, /** @param {string} m */ show: (m) => notice.set(m), clear: () => notice.set(null) }
}
```
`components/oyl-notice.js` — an `OylElement` with `notice` (signal) + `onDismiss` (() => void) props; a `track()` shows a `role="alert"` banner (message + a `data-act="dismiss"` button → `this.onDismiss?.()`) when `notice.get()` is non-null, hidden otherwise. Self-positioned (`:host { position: fixed; inset-block-start: 0; inset-inline: 0; z-index: 50; }`), `--color-warn` background. `defineNotice()` idempotent.

- [ ] **Step 4: Run; verify PASS.**
- [ ] **Step 5: Typecheck clean.**
- [ ] **Step 6: Commit**
```bash
git add apps/vanilla-oyl/src/state/notice.js apps/vanilla-oyl/src/state/notice.test.js apps/vanilla-oyl/src/components/oyl-notice.js apps/vanilla-oyl/src/components/oyl-notice.test.js
git commit -m "feat(vanilla-oyl): notice state + oyl-notice banner (boot/sync error surface)"
```

---

### Task 4: Wire into `main.js` (mode → client, boot resilience, unhandledrejection, mount notice)

**Files:** `apps/vanilla-oyl/src/main.js`.

- [ ] **Step 1: Implement** (no new unit test — verified by the existing suite staying green + the real-Chrome acceptance)

In `apps/vanilla-oyl/src/main.js`:
- Imports: `createHttpClient` from `@oyl/all-of-oyl`; `getStorageMode` (extend `./storage/config.js` import); `createNoticeState` from `./state/notice.js`; `defineNotice` from `./components/oyl-notice.js`; add `STORAGE_MODE_KEY` is not needed in main (mode read via getStorageMode).
- In `boot()`, replace the `const dataState = …` / `const authState = …` region with:
```js
  const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window) })
  const noticeState = createNoticeState()
  const mode = getStorageMode(storage)
  const client = mode === 'remote'
    ? createHttpClient({ baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window), getToken: authState.getToken, onAuthError: () => authState.logout() })
    : undefined
  const dataState = createDataState(storage, themeState, { client })
```
- Replace `await dataState.refresh()` with:
```js
  try {
    await dataState.refresh()
  } catch (err) {
    if (mode === 'remote') noticeState.show("Couldn't reach the backend — sign in (Status → Account) or reload to retry.")
    else throw err
  }
```
- After the `storage` event listener, add a global sync-error surface:
```js
  window.addEventListener('unhandledrejection', (e) => {
    const r = /** @type {any} */ (e).reason
    if (r && (r.name === 'HttpRepositoryError' || r.code === 'REVISION_CONFLICT')) {
      noticeState.show('Sync failed — your last change may not be saved.')
      e.preventDefault()
    }
  })
```
- Mount the banner: `defineNotice()` near the other `defineX()` calls; after `const shell = document.createElement('oyl-shell')`, add:
```js
  const notice = /** @type {import('./components/oyl-notice.js').OylNotice} */ (document.createElement('oyl-notice'))
  notice.notice = noticeState.notice
  notice.onDismiss = () => noticeState.clear()
  document.body.append(notice)
```
(Append to `document.body` — it's a fixed-position overlay, outside the shell layout.)

- [ ] **Step 2: Gate** — `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck` → green (local mode behavior unchanged). `pnpm vanilla build:lib` → builds.
- [ ] **Step 3: Commit**
```bash
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire storage-mode→http client, boot resilience, sync-error notice"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` + `typecheck` green; `pnpm --filter @oyl/all-of-oyl exec vitest run` green (onAuthError).
- [ ] Real-Chrome acceptance (controller): `pnpm strapi-app develop` (1340) + serve vanilla (8041). Sign in (Status → Account). In devtools: `localStorage['oyl/storage-mode']='remote'`; reload. Add a journal entry → reload again → it survives (loaded from Strapi, not localStorage). Sign out + act → 401 logs out + the notice shows. Stop the backend + reload → the app renders with the "couldn't reach backend" notice (no blank crash), no console rejection spam. Set mode back to `local` → original local data returns. → ready for SP4b (settings UI) + SP4c (compose).
