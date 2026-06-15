# Backend SP4a — wire the HTTP adapter into vanilla-oyl — Design

**Status:** approved (split SP4a; forks A–D + R-A/R-B/R-C; R-D→SP4b)
**Date:** 2026-06-15
**Packages:** `apps/vanilla-oyl` + a one-field addition to `@oyl/all-of-oyl`'s `createHttpClient`
**Context:** SP1–SP3 built the client adapter, a conformant Strapi backend, and client auth. **SP4a connects them:** `makeRepositories` can build `HttpRepository`s (vs LocalStorage) by config, with auth's `getToken` + a 401→logout edge — so vanilla-oyl actually persists to the backend in `remote` mode. SP4b = the settings UI; SP4c = docker-compose.

---

## What this is

The integration is small *because the stores already consume the `Repository` port* — only `makeRepositories` chooses the adapter. The real work is honoring the new **failure/latency contract** an HTTP repo brings (vs localStorage's instant, never-fails one): boot must survive an unreachable backend (R-A), writes that fail must be visible (R-C), and boot hydrate must parallelize (R-B).

### Decisions (settled)

1. **`makeRepositories(storage, { client? })` (fork A).** A truthy `client` (an `HttpClient`) → `createHttpRepository(client, name, codec)` per collection; else `LocalStorageRepository` (unchanged default). The stores are adapter-blind.
2. **`createDataState(storage, themeState, { client? })`** threads `client` through.
3. **`createHttpClient` gains `onAuthError?` (fork B).** Called when it maps a 401/403, before throwing `HttpRepositoryError('auth')`. `main.js` wires it to `authState.logout()`; because `getToken` reads the live session, re-login restores access without reload.
4. **Mode config:** `getStorageMode(storage)` + `STORAGE_MODE_KEY` (default `'local'`).
5. **`main.js`:** if `remote`, build `client = createHttpClient({ baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window), getToken: authState.getToken, onAuthError: () => authState.logout() })` and pass `{ client }` to `createDataState`.
6. **R-A boot resilience:** wrap `await dataState.refresh()` in try/catch; in `remote` mode a transport/auth failure shows a recoverable **notice** ("Couldn't reach the backend — sign in or retry") and the app still renders. (Local-mode failures rethrow — unexpected.)
7. **R-C global error surface:** a minimal `noticeState` (a `notice` signal + `show`/`clear`) rendered by an `oyl-notice` banner; an `unhandledrejection` handler turns swallowed remote write failures (the screens' `void store.X()`) into a non-fatal "Sync failed — your change may not be saved." (Per-action retry = SP5.)
8. **R-B parallel hydrate:** `refresh()` runs its independent hydrates/lists via `Promise.all` (remote boot is otherwise ~18 serial round-trips).
9. **Mode switch = reload-to-apply (fork C); local & remote are separate datasets, no SP4 sync (fork D).**

### Out of scope (→ SP4b / SP4c / SP5)

- The settings UI (local/remote toggle + backend-URL field) and **gating the local-only Status actions** (seed/reset/export/import) in remote mode (R-D) → **SP4b**. docker-compose service + composed-origin CORS + Postgres → **SP4c**. Offline cache, write queue, retry, local↔remote sync/migration → **SP5**. SP4a sets `remote` mode via localStorage manually for its acceptance.

---

## Architecture

### 1. `@oyl/all-of-oyl` — `createHttpClient` `onAuthError`
In `src/core/http-repository.ts`, add `onAuthError?: () => void` to the opts; in `request`, when mapping `401/403`, call `opts.onAuthError?.()` before `throw new HttpRepositoryError('auth', …)`. (Additive; a unit test asserts the callback fires on 401.)

### 2. `apps/vanilla-oyl/src/storage/bootstrap.js` — adapter switch
```js
import { COLLECTIONS, LocalStorageRepository, createHttpRepository } from '@oyl/all-of-oyl'
// makeRepositories(storage, { client } = {}):
//   for each COLLECTIONS name: repos[name] = client ? createHttpRepository(client, name, codec) : new LocalStorageRepository(storage, dataKey(name), codec, now)
```
`collectionCounts` is unchanged (works over either adapter via `list()`).

### 3. `apps/vanilla-oyl/src/storage/config.js` — mode
```js
import { STORAGE_MODE_KEY } from './keys.js'
/** 'local' | 'remote' (default local). */
export function getStorageMode(storage) {
  return storage.getItem(STORAGE_MODE_KEY) === 'remote' ? 'remote' : 'local'
}
```
(`STORAGE_MODE_KEY = 'oyl/storage-mode'` in `keys.js`.)

### 4. `state/data.js` — accept `{ client }`, parallelize refresh
`createDataState(storage, themeState, opts = {})` → `makeRepositories(storage, { client: opts.client })`. `refresh()` parallelizes independents:
```js
async function refresh() {
  schema.set(readSchemaState(storage))
  const [, , , , , , la, act, proj, est, cnt] = await Promise.all([
    journal.hydrate(), planner.hydrate(), vault.hydrate(), goals.hydrate(), budgets.hydrate(), accounts.hydrate(),
    repos.lifeAreas.list(), repos.activities.list(), repos.projects.list(), readStorageEstimate(), collectionCounts(repos),
  ])
  lifeAreas = la; activities = act; projects = proj; storageEstimate.set(est); counts.set(cnt)
}
```

### 5. `state/notice.js` (new) — minimal error surface (R-A/R-C)
```js
import { signal } from '../lib/reactive/signal.js'
export function createNoticeState() {
  const notice = signal(/** @type {string | null} */ (null))
  return { notice, show: (/** @type {string} */ m) => notice.set(m), clear: () => notice.set(null) }
}
```

### 6. `components/oyl-notice.js` (new) — dismissible banner
An `OylElement` with a `notice` prop (the signal); `track()` shows a `role="alert"` banner with the message + a dismiss button (→ `clear()`) when non-null, hidden otherwise.

### 7. `main.js` — wire it (R-A/R-B/R-C)
```js
const mode = getStorageMode(storage)
const authState = createAuthState(storage, { baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window) })
const noticeState = createNoticeState()
const client = mode === 'remote'
  ? createHttpClient({ baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window), getToken: authState.getToken, onAuthError: () => authState.logout() })
  : undefined
const dataState = createDataState(storage, themeState, { client })
// … mount oyl-notice (noticeState.notice) in the shell …
try { await dataState.refresh() }
catch (err) { if (mode === 'remote') noticeState.show("Couldn't reach the backend — sign in (Status → Account) or retry."); else throw err }
window.addEventListener('unhandledrejection', (e) => {
  const r = /** @type {any} */ (e).reason
  if (r && (r.name === 'HttpRepositoryError' || r.code === 'REVISION_CONFLICT')) { noticeState.show('Sync failed — your last change may not be saved.'); e.preventDefault() }
})
```

---

## Testing (Vitest + happy-dom)

- **`@oyl/all-of-oyl` `http-repository.test.ts`** (extend): a 401 response → `onAuthError` invoked once **and** `HttpRepositoryError('auth')` thrown.
- **`bootstrap.test.js`** (new/extend): `makeRepositories(storage)` → `LocalStorageRepository` instances; `makeRepositories(storage, { client })` (a stub HttpClient) → repos whose `list()`/`save()` call the client (assert one collection round-trips through the stub).
- **`data.test.js`** (extend): `createDataState(storage, theme, { client })` builds http-backed stores (a journal `add` calls the stub client); `refresh()` still hydrates correctly (parallel) for the local default.
- **`notice.test.js`** (new): `show`/`clear` drive the signal. **`oyl-notice.test.js`**: shows the message + dismiss clears.
- **R-A/R-C** are exercised in the real-Chrome acceptance (a unit test can simulate a rejecting client → notice shown).

## File structure
```
packages/all-of-oyl/src/core/http-repository.ts   (modify: onAuthError opt) + test
apps/vanilla-oyl/src/
  storage/keys.js          (modify: STORAGE_MODE_KEY)
  storage/config.js        (modify: getStorageMode)
  storage/bootstrap.js     (modify: client-or-local adapter switch) + bootstrap.test.js
  state/data.js            (modify: { client } opt + parallel refresh)
  state/notice.js          (new) + notice.test.js
  components/oyl-notice.js  (new) + oyl-notice.test.js
  main.js                  (modify: mode → client, boot try/catch, unhandledrejection, mount notice)
```
The stores, the HttpRepository, and the auth state are unchanged (only consumed). Local mode is byte-for-byte the prior behavior.

## Acceptance

`pnpm vanilla test` + `typecheck` green; `pnpm all-of test` green (onAuthError). Then real-Chrome against a running backend (`pnpm strapi-app develop` 1340): sign in (Status → Account); set `localStorage['oyl/storage-mode']='remote'` + reload → the app boots in remote mode; **add a journal entry → it persists to Strapi** (verify via a second reload — the entry survives, loaded from the backend, not localStorage); sign out then act → a 401 logs out + the notice shows; stop the backend + reload → the app still renders with the "couldn't reach backend" notice (no blank crash). Switch mode back to `local` → the original local data returns (separate datasets). Ready for SP4b (settings UI) + SP4c (compose).
