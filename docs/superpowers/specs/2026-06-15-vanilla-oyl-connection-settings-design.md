# Backend SP4b — Connection settings UI + local-only action gating for vanilla-oyl — Design

**Status:** approved (Connection section on Status; Apply&reload; disable+explain gating; R-A–R-H)
**Date:** 2026-06-15
**Package:** `apps/vanilla-oyl` (+ symmetric setters in its own `storage/config.js`)
**Context:** SP4a wired the HTTP adapter: `main.js` reads `getStorageMode`/`getApiBaseUrl` at boot and builds an `HttpClient` in `remote` mode, falling back to `LocalStorageRepository` in `local`. But there is **no UI to change mode or backend URL** (SP4a set them via `localStorage` by hand), and the four local-only Status actions (seed/export/import/reset) remain enabled-but-misleading in remote mode. **SP4b adds the Connection settings UI and gates those actions (R-D).** SP4c = docker-compose + composed-origin CORS + Postgres; SP5 = offline-first sync.

---

## What this is

A small **Connection** section on the Status screen (mirroring how the Account/`oyl-auth` section already lives there) that lets the user choose `Local | Remote` and edit the backend URL, applied via an explicit **Apply & reload** button. Plus: in remote mode the four localStorage-only action buttons are **disabled with an explanation** (R-D). The adapter is wired once at boot, so changes are **reload-to-apply** (decided in SP4a, fork C); local and remote are separate datasets (fork D) — switching modes never destroys data.

### Decisions (settled)

1. **Placement (fork A):** a new `Connection` `<h2>` section + `<oyl-connection>` on `#/status`, inserted **between the actions row and the Account section**. No new nav route.
2. **Apply UX:** editing stages locally; a primary **Apply & reload** button — **enabled only when the staged form differs from the saved baseline** — persists both keys then reloads. No live writes, no surprise reloads, lets the user stage mode+URL together.
3. **R-D gating:** in remote mode the four actions (`seed`/`export`/`import`/`reset`) are **disabled + captioned** ("Local-data tools — unavailable in Remote mode."), not hidden — the UI stays stable across modes and the tools reappear in local mode.
4. **Config setters (symmetry):** `storage/config.js` gains `setStorageMode`/`setApiBaseUrl` to pair the SP4a getters, and exports `DEFAULT_API_BASE_URL`. Empty-string / non-`remote` → `removeItem` so the getters fall back to defaults (no separate "reset" operation).
5. **Component delegates the reload:** `oyl-connection` never calls `location.reload()`; it calls an injected `onApply(mode, url)`. `main.js` owns the one impure line. Mirrors `oyl-auth` delegating to its auth state → the whole component is unit-testable.
6. **R-A URL normalization:** `setApiBaseUrl` trims whitespace + strips trailing slash(es) before storing — the adapter's `${baseUrl}/v1/...` and auth's `${baseUrl}/auth/local` concatenation stays clean for every caller.
7. **R-B protocol validation:** the component validates with `new URL()` **and** an explicit `http:`/`https:` protocol check (because `new URL('localhost:1340/api')` parses `localhost:` as a scheme). Empty URL is valid (→ default).
8. **R-C "changed" vs the saved baseline:** Apply's enable predicate compares the staged values to the *saved* values, so type-then-revert leaves Apply disabled.

### Out of scope (→ SP4c / SP5)

- docker-compose service for `apps/strapi-oyl` + composed-origin CORS + Postgres → **SP4c**. Offline cache, write queue, retry, local↔remote sync/migration → **SP5**. No auth coupling in Connection — the Account section sits directly below and SP4a's boot notice already guides an unauthenticated remote boot. The `?seed` dev query-param is left untouched (R-H).

---

## Architecture — `apps/vanilla-oyl/src/`

### 1. `storage/config.js` — setters + exported default

Current (SP4a) has the getters and a private `DEFAULT_API_BASE_URL`. Change to:

```js
import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

export const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'

/** Backend base URL (overridable via localStorage). @param {{ getItem(k: string): string | null }} storage @returns {string} */
export function getApiBaseUrl(storage) {
  return storage.getItem(API_BASE_URL_KEY) || DEFAULT_API_BASE_URL
}

/** 'local' | 'remote' (default local). @param {{ getItem(k: string): string | null }} storage @returns {'local'|'remote'} */
export function getStorageMode(storage) {
  return storage.getItem(STORAGE_MODE_KEY) === 'remote' ? 'remote' : 'local'
}

/** Trim + strip trailing slashes; '' stays ''. @param {string} url @returns {string} */
export function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '')
}

/** @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {'local'|'remote'} mode */
export function setStorageMode(storage, mode) {
  if (mode === 'remote') storage.setItem(STORAGE_MODE_KEY, 'remote')
  else storage.removeItem(STORAGE_MODE_KEY)
}

/** Empty (after normalize) clears the key → getApiBaseUrl returns the default. @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {string} url */
export function setApiBaseUrl(storage, url) {
  const v = normalizeBaseUrl(url)
  if (v) storage.setItem(API_BASE_URL_KEY, v)
  else storage.removeItem(API_BASE_URL_KEY)
}
```

(`STORAGE_MODE_KEY`/`API_BASE_URL_KEY` already exist in `keys.js`; no change there.)

### 2. `components/oyl-connection.js` (new) — the settings form

An `OylElement` with a single `connection` prop:

```js
/** @typedef {{ mode: 'local'|'remote', apiBaseUrl: string, defaultApiBaseUrl: string, onApply: (mode: 'local'|'remote', url: string) => void }} ConnectionConfig */
```

`render()` (guard `if (!this.connection) return` — the `oyl-auth` pattern):

- **Mode control** — the `.seg` segmented control as a **radiogroup**: a `[role="radiogroup"]` `aria-label="Storage mode"` with two buttons `Local` / `Remote` (the selected one `aria-checked="true"`), matching `oyl-auth`'s seg. Clicking sets the **staged** mode (does not persist).
- **Backend URL** — a labelled `type="url"` input (`<label>` "Backend URL" + `autocomplete="off"`); `placeholder = connection.defaultApiBaseUrl`; value initialised from `connection.apiBaseUrl`; a hint "Used in Remote mode." Always editable. `input` updates the staged url.
- **Error region** — `[data-role="error"]` with `role="alert"`, empty unless validation fails.
- **Apply & reload** — a `button.primary`; `(was: <SavedMode> · <savedUrl>)` caption below it. **Enabled iff** `stagedMode !== savedMode || normalizeBaseUrl(stagedUrl) !== savedUrl`, where `savedUrl = normalizeBaseUrl(connection.apiBaseUrl)` and `savedMode = connection.mode`. Re-evaluate enablement on every mode-click / url-input.
  - **On click:** validate the staged url — if non-empty, `new URL(url)` in try/catch **and** require `protocol === 'http:' || protocol === 'https:'`; on failure set the error text ("Enter a valid http(s) URL.") and **do not** call `onApply`. On success (or empty url), call `this.connection.onApply(stagedMode, stagedUrl)`. (The component itself does not reload.)

`defineConnection()` idempotent.

### 3. `components/oyl-status-panel.js` — host Connection + gate actions (R-D)

- Add a `connection` prop (`@type {import('./oyl-connection.js').ConnectionConfig | null}`, default `null`).
- In `render()`: `defineConnection()`; build a `Connection` `<h2>` + `<oyl-connection>` (`connEl.connection = this.connection`) and append it **between `actions` and the `accountLabel`** (i.e. `root.append(h2, grid, actions, connLabel, connEl, accountLabel, authEl)`).
- **R-D gating:** if `this.connection?.mode === 'remote'`, set `disabled = true` on the four action buttons and append a captioned `<p id="local-tools-note">Local-data tools — unavailable in Remote mode.</p>` to the actions container, and set `actions.setAttribute('aria-describedby', 'local-tools-note')`. In local mode (or null connection) the buttons are enabled as today and no caption/aria is added. `_button` gains nothing — gating is applied after construction in `render()`.

### 4. `main.js` — wire it

In the `status` route handler, alongside `panel.auth` / `panel.actions`:

```js
import { getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, DEFAULT_API_BASE_URL } from './storage/config.js'
// ...
panel.connection = {
  mode,                                   // the running mode, already computed at boot
  apiBaseUrl: getApiBaseUrl(storage),
  defaultApiBaseUrl: DEFAULT_API_BASE_URL,
  onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
}
```

`location.reload()` is the single untestable line and lives here, not in the component.

---

## Testing (Vitest + happy-dom)

- **`storage/config.test.js`** (new):
  - `setStorageMode(storage, 'remote')` then `getStorageMode` → `'remote'`; `setStorageMode(storage, 'local')` → key removed, getter → `'local'`.
  - `setApiBaseUrl(storage, 'http://x/api/')` → stored `'http://x/api'` (trailing slash stripped); `getApiBaseUrl` → `'http://x/api'`.
  - `setApiBaseUrl(storage, '  ')` → key removed, `getApiBaseUrl` → `DEFAULT_API_BASE_URL`.
  - `normalizeBaseUrl('  http://x/api//  ')` → `'http://x/api'`; `normalizeBaseUrl('')` → `''`.
- **`components/oyl-connection.test.js`** (new — assert via the component's own shadow root):
  - renders the mode radiogroup with the saved mode checked + url input reflecting `connection.apiBaseUrl` + default as placeholder.
  - Apply **disabled** when nothing changed; **enabled** after clicking the other mode; **enabled** after editing the url; **disabled again** after editing the url back to the saved value (R-C type-then-revert).
  - clicking Apply with a valid changed url → `onApply` called once with `(stagedMode, stagedUrl)`.
  - invalid url (`'not a url'` and `'localhost:1340/api'`) → `[data-role=error]` shows a message and `onApply` is **not** called.
  - empty url → Apply calls `onApply(mode, '')` (config will treat as default).
- **`components/oyl-status-panel.test.js`** (extend): Connection section renders an `<oyl-connection>` wired to `connection`; with `connection.mode === 'remote'` the four action buttons are `disabled` and the `#local-tools-note` caption + `aria-describedby` are present; with `mode === 'local'` they are enabled and no caption.

(Real-Chrome is optional here — the only browser-only behaviour is `location.reload()`, already exercised manually in SP4a's acceptance. A quick manual pass: flip to Remote, Apply, confirm the reload boots remote and the local tools are disabled; flip back, confirm they re-enable.)

## File structure

```
apps/vanilla-oyl/src/
  storage/config.js              (modify: setStorageMode/setApiBaseUrl/normalizeBaseUrl + export DEFAULT_API_BASE_URL) + config.test.js
  components/oyl-connection.js     (new: the settings form) + oyl-connection.test.js
  components/oyl-status-panel.js   (modify: connection prop, host Connection section, R-D gate actions) + status-panel test
  main.js                         (modify: panel.connection = { …, onApply: persist+reload })
```

No changes to the stores, adapters, auth, or `apps/strapi-oyl`. Local mode behaviour is unchanged except the (new) Connection section.

## Acceptance

`pnpm vanilla test` + `pnpm vanilla typecheck` green. On `#/status`: a **Connection** section shows a `Local | Remote` radiogroup (saved mode checked) + a backend-URL field (default as placeholder) + an **Apply & reload** button that is disabled until the form differs from the saved values; applying persists the keys and reloads, after which the app boots in the chosen mode. In **remote** mode the four local-data action buttons are disabled with the "unavailable in Remote mode" caption; in **local** mode they work as before. URLs are normalized (no trailing-slash double-slash) and invalid URLs are rejected inline. Ready for SP4c (compose) + SP5 (sync).
