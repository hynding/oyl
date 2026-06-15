# Backend SP4b — Connection settings UI + action gating — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Connection settings section to vanilla-oyl's Status screen (Local/Remote mode + backend-URL, applied via "Apply & reload") and disable the four local-only Status actions in remote mode.

**Architecture:** A new `oyl-connection` web component (mirroring `oyl-auth`) hosted by `oyl-status-panel`; symmetric config setters in `storage/config.js`; `main.js` wires an `onApply` that persists the keys and reloads (the one impure line). The component is fully unit-testable (no `location.reload()` inside it).

**Tech Stack:** Vanilla JS + JSDoc, Web Components (shadow DOM + design tokens), Vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-connection-settings-design.md`

**Conventions (verified against the codebase):**
- Components: `class X extends OylElement { static styles = [sheet(`…`)] }`, `defineX()` idempotent, listeners use `{ signal: this.lifecycle }`, createElement-only (no innerHTML).
- Props are plain fields set **before** `document.body.append(el)`; `render()` runs on connect.
- Tests assert via the component's **own** shadow root; for nested components assert the child element exists + its prop is wired (do not pierce nested shadow).
- `.seg` a11y pattern (from `oyl-auth.js`): `role="group"` + `aria-label`, `type="button"` buttons toggled via `aria-pressed`.

---

### Task 1: Config setters + normalize (`storage/config.js`)

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/config.js`
- Test: `apps/vanilla-oyl/src/storage/config.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/storage/config.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode,
  normalizeBaseUrl, DEFAULT_API_BASE_URL,
} from './config.js'
import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

/** @returns {Storage} */
function fakeStorage() {
  /** @type {Map<string, string>} */
  const m = new Map()
  return /** @type {any} */ ({
    getItem: (k) => (m.has(k) ? /** @type {string} */ (m.get(k)) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  })
}

describe('config setters', () => {
  /** @type {Storage} */
  let storage
  beforeEach(() => { storage = fakeStorage() })

  it('round-trips storage mode and clears on local', () => {
    setStorageMode(storage, 'remote')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe('remote')
    expect(getStorageMode(storage)).toBe('remote')
    setStorageMode(storage, 'local')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe(null)
    expect(getStorageMode(storage)).toBe('local')
  })

  it('stores a normalized url and clears on empty', () => {
    setApiBaseUrl(storage, 'http://x/api/')
    expect(storage.getItem(API_BASE_URL_KEY)).toBe('http://x/api')
    expect(getApiBaseUrl(storage)).toBe('http://x/api')
    setApiBaseUrl(storage, '   ')
    expect(storage.getItem(API_BASE_URL_KEY)).toBe(null)
    expect(getApiBaseUrl(storage)).toBe(DEFAULT_API_BASE_URL)
  })

  it('normalizeBaseUrl trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://x/api//  ')).toBe('http://x/api')
    expect(normalizeBaseUrl('')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/config.test.js`
Expected: FAIL — `setStorageMode`/`setApiBaseUrl`/`normalizeBaseUrl`/`DEFAULT_API_BASE_URL` not exported.

- [ ] **Step 3: Implement**

Replace the whole body of `apps/vanilla-oyl/src/storage/config.js` with:

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

/** Trim whitespace + strip trailing slashes; '' stays ''. @param {string} url @returns {string} */
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/config.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/config.js apps/vanilla-oyl/src/storage/config.test.js
git commit -m "feat(vanilla-oyl): config setters (setStorageMode/setApiBaseUrl) + normalizeBaseUrl"
```

---

### Task 2: `oyl-connection` component

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-connection.js`
- Test: `apps/vanilla-oyl/src/components/oyl-connection.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-connection.test.js`:

```js
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { defineConnection } from './oyl-connection.js'

beforeAll(() => defineConnection())

/** @param {Partial<import('./oyl-connection.js').ConnectionConfig>} [over] */
function mount(over = {}) {
  const el = /** @type {any} */ (document.createElement('oyl-connection'))
  el.connection = {
    mode: 'local',
    apiBaseUrl: 'http://localhost:1340/api',
    defaultApiBaseUrl: 'http://localhost:1340/api',
    onApply: vi.fn(),
    ...over,
  }
  document.body.append(el)
  return el
}

/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {any} el */
const seg = (el) => root(el).querySelector('.seg[role="group"]')
/** @param {any} el @param {string} v */
const segBtn = (el, v) => /** @type {HTMLButtonElement} */ (root(el).querySelector(`.seg button[data-value="${v}"]`))
/** @param {any} el */
const urlInput = (el) => /** @type {HTMLInputElement} */ (root(el).querySelector('input[type="url"]'))
/** @param {any} el */
const applyBtn = (el) => /** @type {HTMLButtonElement} */ (root(el).querySelector('button.primary'))
/** @param {any} el */
const errorText = (el) => (root(el).querySelector('[data-role="error"]')?.textContent ?? '')

describe('<oyl-connection>', () => {
  it('renders the seg with saved mode pressed and the url reflected', () => {
    const el = mount({ mode: 'remote', apiBaseUrl: 'http://x/api' })
    expect(seg(el)).toBeTruthy()
    expect(segBtn(el, 'remote').getAttribute('aria-pressed')).toBe('true')
    expect(segBtn(el, 'local').getAttribute('aria-pressed')).toBe('false')
    expect(urlInput(el).value).toBe('http://x/api')
    expect(urlInput(el).placeholder).toBe('http://localhost:1340/api')
    el.remove()
  })

  it('disables Apply until something changes, and re-disables on revert', () => {
    const el = mount()
    expect(applyBtn(el).disabled).toBe(true)
    segBtn(el, 'remote').click()
    expect(applyBtn(el).disabled).toBe(false)
    expect(segBtn(el, 'remote').getAttribute('aria-pressed')).toBe('true')
    segBtn(el, 'local').click()
    expect(applyBtn(el).disabled).toBe(true) // back to saved mode
    const input = urlInput(el)
    input.value = 'http://changed/api'
    input.dispatchEvent(new Event('input'))
    expect(applyBtn(el).disabled).toBe(false)
    input.value = 'http://localhost:1340/api' // back to saved
    input.dispatchEvent(new Event('input'))
    expect(applyBtn(el).disabled).toBe(true)
    el.remove()
  })

  it('applies a valid changed config via onApply', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    segBtn(el, 'remote').click()
    const input = urlInput(el)
    input.value = 'https://api.example.com/api'
    input.dispatchEvent(new Event('input'))
    applyBtn(el).click()
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith('remote', 'https://api.example.com/api')
    el.remove()
  })

  it('rejects an invalid url inline and does not apply', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    const input = urlInput(el)
    for (const bad of ['not a url', 'localhost:1340/api']) {
      input.value = bad
      input.dispatchEvent(new Event('input'))
      applyBtn(el).click()
      expect(onApply).not.toHaveBeenCalled()
      expect(errorText(el)).toMatch(/valid/i)
    }
    el.remove()
  })

  it('treats an empty url as apply-default', () => {
    const onApply = vi.fn()
    const el = mount({ onApply })
    segBtn(el, 'remote').click()
    const input = urlInput(el)
    input.value = ''
    input.dispatchEvent(new Event('input'))
    applyBtn(el).click()
    expect(onApply).toHaveBeenCalledWith('remote', '')
    el.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-connection.test.js`
Expected: FAIL — `./oyl-connection.js` does not exist.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-connection.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { normalizeBaseUrl } from '../storage/config.js'

/** @typedef {{ mode: 'local'|'remote', apiBaseUrl: string, defaultApiBaseUrl: string, onApply: (mode: 'local'|'remote', url: string) => void }} ConnectionConfig */

const styles = sheet(`
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .4rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  .hint { color: var(--color-muted); font-size: .8rem; margin-block: .1rem .6rem; }
  form { display: grid; gap: .5rem; max-inline-size: 28rem; }
  label { display: grid; gap: .25rem; font-size: .85rem; color: var(--color-muted); }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  button.primary:disabled { opacity: .6; cursor: default; }
  .was { color: var(--color-muted); font-size: .8rem; margin-block-start: .1rem; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylConnection extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {ConnectionConfig | null} */
    this.connection = null
  }

  render() {
    if (!this.connection) return
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const conn = this.connection
    const savedMode = conn.mode
    const savedUrl = normalizeBaseUrl(conn.apiBaseUrl)
    let stagedMode = savedMode

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Storage mode')
    const localBtn = segButton('local', 'Local')
    const remoteBtn = segButton('remote', 'Remote')
    seg.append(localBtn, remoteBtn)

    const modeHint = document.createElement('p')
    modeHint.className = 'hint'
    modeHint.textContent = 'Remote mode requires sign-in (Account, below).'

    const form = document.createElement('form')
    const label = document.createElement('label')
    label.textContent = 'Backend URL'
    const urlInput = document.createElement('input')
    urlInput.type = 'url'
    urlInput.autocomplete = 'off'
    urlInput.placeholder = conn.defaultApiBaseUrl
    urlInput.value = conn.apiBaseUrl
    label.append(urlInput)

    const urlHint = document.createElement('span')
    urlHint.className = 'hint'
    urlHint.id = 'conn-url-hint'
    urlHint.textContent = 'Used in Remote mode.'

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.id = 'conn-error'
    error.setAttribute('aria-live', 'polite')
    urlInput.setAttribute('aria-describedby', 'conn-url-hint conn-error')

    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Apply & reload'

    const was = document.createElement('p')
    was.className = 'was'
    was.textContent = `was: ${savedMode === 'remote' ? 'Remote' : 'Local'} · ${savedUrl || conn.defaultApiBaseUrl}`

    form.append(label, urlHint, error, submit, was)
    root.append(seg, modeHint, form)

    const changed = () => stagedMode !== savedMode || normalizeBaseUrl(urlInput.value) !== savedUrl
    const recompute = () => {
      localBtn.setAttribute('aria-pressed', String(stagedMode === 'local'))
      remoteBtn.setAttribute('aria-pressed', String(stagedMode === 'remote'))
      submit.disabled = !changed()
    }

    localBtn.addEventListener('click', () => { stagedMode = 'local'; recompute() }, { signal: this.lifecycle })
    remoteBtn.addEventListener('click', () => { stagedMode = 'remote'; recompute() }, { signal: this.lifecycle })
    urlInput.addEventListener('input', () => { error.textContent = ''; recompute() }, { signal: this.lifecycle })

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const url = urlInput.value.trim()
      if (url) {
        let ok = false
        try { const u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:' } catch { ok = false }
        if (!ok) { error.textContent = 'Enter a valid http(s) URL.'; return }
      }
      conn.onApply(stagedMode, url)
    }, { signal: this.lifecycle })

    recompute()
  }
}

/** @param {'local'|'remote'} value @param {string} label @returns {HTMLButtonElement} */
function segButton(value, label) {
  const b = document.createElement('button')
  b.type = 'button'
  b.dataset.value = value
  b.textContent = label
  return b
}

/** Register the element (idempotent). */
export function defineConnection() {
  if (!customElements.get('oyl-connection')) customElements.define('oyl-connection', OylConnection)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-connection.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-connection.js apps/vanilla-oyl/src/components/oyl-connection.test.js
git commit -m "feat(vanilla-oyl): oyl-connection settings component (mode seg + backend url + apply&reload)"
```

---

### Task 3: Host Connection + gate actions in `oyl-status-panel`

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-status-panel.js`
- Test: `apps/vanilla-oyl/src/components/oyl-status-panel.test.js` (extend)

- [ ] **Step 1: Write the failing test**

Append to `apps/vanilla-oyl/src/components/oyl-status-panel.test.js` (after the existing `account section` describe block):

```js
describe('<oyl-status-panel> connection section', () => {
  /** @param {'local'|'remote'} mode */
  function connConfig(mode) {
    return { mode, apiBaseUrl: 'http://localhost:1340/api', defaultApiBaseUrl: 'http://localhost:1340/api', onApply: () => {} }
  }

  it('renders an oyl-connection wired to the connection config', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    const connection = connConfig('local')
    el.connection = connection
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const connEl = /** @type {any} */ (el.shadowRoot.querySelector('oyl-connection'))
    expect(connEl).toBeTruthy()
    expect(connEl.connection).toBe(connection)
    el.remove()
  })

  it('enables the local-data actions in local mode', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.connection = connConfig('local')
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    expect(/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="seed"]')).disabled).toBe(false)
    expect(root.querySelector('#local-tools-note')).toBeNull()
    el.remove()
  })

  it('disables and explains the local-data actions in remote mode', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.connection = connConfig('remote')
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    for (const act of ['seed', 'export', 'import', 'reset']) {
      expect(/** @type {HTMLButtonElement} */ (root.querySelector(`button[data-act="${act}"]`)).disabled).toBe(true)
    }
    const note = root.querySelector('#local-tools-note')
    expect(note).toBeTruthy()
    expect(note?.textContent).toMatch(/remote mode/i)
    el.remove()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-status-panel.test.js`
Expected: FAIL — no `oyl-connection` rendered; actions not disabled in remote mode.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-status-panel.js`:

3a. Add the import near the top (next to `import { defineAuth } from './oyl-auth.js'`):

```js
import { defineConnection } from './oyl-connection.js'
```

3b. Add a `:disabled` rule to the `styles` sheet (R-I) — inside the template string, after the existing `button:hover { … }` line add:

```css
  button:disabled { opacity: .5; cursor: not-allowed; }
```

3c. In the constructor, after `this.auth = null`, add:

```js
    /** @type {import('./oyl-connection.js').ConnectionConfig | null} */
    this.connection = null
```

3d. In `render()`, after `defineAuth()` add `defineConnection()`. Then change the section construction + append. Replace this block:

```js
    const accountLabel = document.createElement('h2')
    accountLabel.textContent = 'Account'
    const authEl = /** @type {import('./oyl-auth.js').OylAuth} */ (document.createElement('oyl-auth'))
    authEl.auth = this.auth
    root.append(h2, grid, actions, accountLabel, authEl)
```

with:

```js
    if (this.connection?.mode === 'remote') {
      for (const b of actions.querySelectorAll('button')) /** @type {HTMLButtonElement} */ (b).disabled = true
      const note = document.createElement('p')
      note.id = 'local-tools-note'
      note.textContent = 'Local-data tools — unavailable in Remote mode.'
      actions.append(note)
      actions.setAttribute('aria-describedby', 'local-tools-note')
    }

    const connLabel = document.createElement('h2')
    connLabel.textContent = 'Connection'
    const connEl = /** @type {import('./oyl-connection.js').OylConnection} */ (document.createElement('oyl-connection'))
    connEl.connection = this.connection

    const accountLabel = document.createElement('h2')
    accountLabel.textContent = 'Account'
    const authEl = /** @type {import('./oyl-auth.js').OylAuth} */ (document.createElement('oyl-auth'))
    authEl.auth = this.auth
    root.append(h2, grid, actions, connLabel, connEl, accountLabel, authEl)
```

(The `#local-tools-note` caption sits inside `actions`, styled as a normal `<p>` — no CSS needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-status-panel.test.js`
Expected: PASS (existing 4 + new 3).

- [ ] **Step 5: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "feat(vanilla-oyl): status panel hosts Connection section + gates local-data actions in remote mode"
```

---

### Task 4: Wire it in `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

There is no unit test for `main.js` (it owns `location.reload()` and DOM bootstrap). Verification is the full suite + typecheck + a manual pass.

- [ ] **Step 1: Extend the config import**

Change the existing line:

```js
import { getApiBaseUrl, getStorageMode } from './storage/config.js'
```

to:

```js
import { getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode, DEFAULT_API_BASE_URL } from './storage/config.js'
```

- [ ] **Step 2: Set `panel.connection` in the status route**

In `router.routes.status`, immediately after `panel.auth = authState`, add:

```js
      panel.connection = {
        mode,
        apiBaseUrl: getApiBaseUrl(storage),
        defaultApiBaseUrl: DEFAULT_API_BASE_URL,
        onApply: (m, url) => { setStorageMode(storage, m); setApiBaseUrl(storage, url); location.reload() },
      }
```

(`mode` is the boot-time `const mode = getStorageMode(storage)` already in scope; the callback param is `m` to avoid shadowing.)

- [ ] **Step 3: Typecheck + full test suite**

Run:
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
pnpm vanilla typecheck
pnpm vanilla test
```
Expected: typecheck clean; all tests pass (264 prior + 3 config + 5 connection + 3 status-panel = 275).

- [ ] **Step 4: Commit**

```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire Connection settings (persist mode/url + reload) into the status route"
```

- [ ] **Step 5: Manual acceptance (real Chrome, optional but recommended)**

With `pnpm strapi-app develop` (port 1340) and `pnpm vanilla dev` (port 8041): on `#/status`, the Connection section shows `Local | Remote` (Local pressed) + the backend-URL field + a disabled "Apply & reload". Flip to Remote → Apply enables → click → page reloads in remote mode; the four local-data buttons are now disabled with the caption. Flip back to Local → Apply → reload → buttons re-enabled. Enter `http://localhost:1340/api/` (trailing slash) → it normalizes; enter `nonsense` → inline "valid http(s) URL" error, no reload.

---

## Notes for the implementer

- **Do not** put `location.reload()` anywhere except `main.js`'s `onApply` — it keeps `oyl-connection` unit-testable.
- The `.seg` CSS is intentionally copied into `oyl-connection` (matching the per-component style convention); do not refactor the shared style in this slice.
- Keep all event listeners bound with `{ signal: this.lifecycle }`.
- Assert via each component's own shadow root; for the status-panel↔connection wiring, assert the `<oyl-connection>` element exists and its `.connection` prop is the passed object (don't pierce its shadow).
