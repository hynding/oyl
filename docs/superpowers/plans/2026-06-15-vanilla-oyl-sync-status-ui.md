# Backend SP5d — Sync-status UI (visible + live) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make sync visible (an ambient header chip) and live (auto-refresh the stores on pull/conflict), plus a Resync control on Status → Connection.

**Architecture:** `pulledAt` on `SyncState` (the pull-only auto-refresh trigger) → `data.js` bridges `syncState` to a `Signal`, exposes `resync`, and owns a `syncTriggersRefresh`-gated effect → an ambient `oyl-sync-status` chip in the toolbar + a Sync block on the Status panel → `main.js` mounts them.

**Tech Stack:** TS (strict, NodeNext, no DOM lib) + Vitest for `src/`; vanilla JS + JSDoc + Vitest (happy-dom) for the app.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-sync-status-ui-design.md`

**Gates:** `pnpm --filter @oyl/all-of-oyl test` / `typecheck:src` / `pnpm all-of build`; `pnpm vanilla test` / `pnpm vanilla typecheck`.

---

### Task 1: `pulledAt` on the engine

**Files:** Modify `packages/all-of-oyl/src/core/sync-engine.ts`; Test `sync-engine.test.ts` (extend).

- [ ] **Step 1: Failing test** — append to `sync-engine.test.ts` (reuses the file's `mem`/`codec`/`now`/`area`/`setup` + the delta-pull `recordingRemote` is not needed here):
```ts
describe('createSyncEngine — pulledAt', () => {
  it('pull() sets pulledAt; flush() does not', async () => {
    const { repo, engine } = setup(true)
    await repo.save(area())
    await engine.flush()
    expect(engine.syncState.get().pulledAt).toBeUndefined() // flush-only: no pulledAt
    await engine.pull()
    expect(engine.syncState.get().pulledAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run — FAIL** (`pulledAt` missing):
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts`

- [ ] **Step 3: Implement** — in `sync-engine.ts`:
  - Add to the `SyncState` interface (after `lastSyncedAt?: Date`):
    ```ts
    pulledAt?: Date
    ```
  - In `pull()`, change the final emit (currently `emit({ lastSyncedAt: now() })`) to:
    ```ts
    emit({ lastSyncedAt: now(), pulledAt: now() })
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts
git commit -m "feat(all-of-oyl): SyncState.pulledAt — pull-only timestamp for UI auto-refresh"
```

---

### Task 2: `data.js` — bridge to a signal, resync, auto-refresh effect

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`; Test `data.test.js` (extend).

- [ ] **Step 1: Failing test** — add to `data.test.js` (it tests `syncTriggersRefresh` purely + the signal/resync surface; reuse the file's existing stub-client/storage/themeState helpers + `manualConnectivity` from `@oyl/all-of-oyl`):
```ts
import { syncTriggersRefresh } from './data.js'   // add to imports

describe('syncTriggersRefresh', () => {
  const base = { online: true, pending: 0, status: 'idle', conflicts: 0 }
  it('true when pulledAt changed', () => {
    expect(syncTriggersRefresh(base, { ...base, pulledAt: new Date() })).toBe(true)
  })
  it('true when conflicts changed', () => {
    expect(syncTriggersRefresh(base, { ...base, conflicts: 1 })).toBe(true)
  })
  it('false for a status-only change', () => {
    expect(syncTriggersRefresh(base, { ...base, status: 'syncing' })).toBe(false)
  })
  it('false when next is null', () => {
    expect(syncTriggersRefresh(base, null)).toBe(false)
  })
})

describe('createDataState sync surface', () => {
  it('exposes syncState as a Signal and resync() calls the engine (remote)', async () => {
    const ds = createDataState(storage, themeState, { client: <existing-stub-client>, connectivity: manualConnectivity(true) })
    expect(typeof ds.syncState.get).toBe('function')  // a Signal, not the raw observable
    await ds.resync()  // resolves without throwing
  })
  it('local syncState signal holds null', () => {
    const ds = createDataState(storage, themeState, {})
    expect(ds.syncState.get()).toBeNull()
  })
})
```
(Adapt `<existing-stub-client>`/`storage`/`themeState` to the file's helpers.)

- [ ] **Step 2: Run — FAIL** (`syncTriggersRefresh` not exported; `syncState` is the observable/null, not a Signal).

- [ ] **Step 3: Implement** — in `apps/vanilla-oyl/src/state/data.js`:
  - Add `effect` to the imports:
    ```js
    import { effect } from '../lib/reactive/effect.js'
    ```
  - Add the pure predicate near the top (after imports, before `createDataState`):
    ```js
    /**
     * Re-hydrate when a pull or conflict changed the cache — NOT on every flush.
     * @param {import('@oyl/all-of-oyl').SyncState | null} prev
     * @param {import('@oyl/all-of-oyl').SyncState | null} next
     * @returns {boolean}
     */
    export function syncTriggersRefresh(prev, next) {
      return !!next && (next.pulledAt !== prev?.pulledAt || next.conflicts !== prev?.conflicts)
    }
    ```
  - Replace the current sync block (the three lines `const syncState = engine ? engine.syncState : null` … `function syncFlush()`) with:
    ```js
    /** @type {import('../lib/reactive/signal.js').Signal<import('@oyl/all-of-oyl').SyncState | null>} */
    const syncState = signal(engine ? engine.syncState.get() : null)
    engine?.syncState.subscribe((v) => syncState.set(v))   // app-lifetime bridge
    /** Run the initial flush→pull (no-op in local mode). @returns {Promise<void>} */
    async function startSync() { if (engine) await engine.start() }
    /** Push the outbox now (e.g. after re-login). */
    function syncFlush() { if (engine) void engine.flush() }
    /** Clear cursors + full pull. @returns {Promise<void>} */
    function resync() { return engine ? engine.resync() : Promise.resolve() }
    // Re-hydrate the stores when a pull/conflict changed the cache (remote only).
    if (engine) {
      let prevSync = syncState.get()
      effect(() => {
        const s = syncState.get()
        if (syncTriggersRefresh(prevSync, s)) { prevSync = s; void refresh() }
        else prevSync = s
      })
    }
    ```
    (`refresh` is the existing hoisted `async function refresh()` declared later in the file — referencing it here is fine.)
  - Add `resync` to the returned object:
    ```js
    return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription, accounts, syncState, startSync, syncFlush, resync }
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): bridge syncState→signal, resync, syncTriggersRefresh-gated auto-refresh effect"
```

---

### Task 3: `oyl-sync-status` ambient chip

**Files:** Create `apps/vanilla-oyl/src/components/oyl-sync-status.js` + `oyl-sync-status.test.js`.

- [ ] **Step 1: Failing test** `oyl-sync-status.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest'
import { defineSyncStatus } from './oyl-sync-status.js'
import { signal } from '../lib/reactive/signal.js'

beforeAll(() => defineSyncStatus())
const synced = { online: true, pending: 0, status: 'idle', conflicts: 0 }
function mount(initial) {
  const sig = signal(/** @type {any} */ (initial))
  const el = /** @type {any} */ (document.createElement('oyl-sync-status'))
  el.syncState = sig
  document.body.append(el)
  return { el, sig }
}

describe('<oyl-sync-status>', () => {
  it('is hidden when idle+synced', () => {
    const { el } = mount(synced)
    expect(el.hasAttribute('hidden')).toBe(true)
    el.remove()
  })
  it('shows Offline · N when offline with pending', () => {
    const { el } = mount({ ...synced, online: false, status: 'offline', pending: 2 })
    expect(el.hasAttribute('hidden')).toBe(false)
    expect(el.shadowRoot.textContent).toContain('Offline · 2')
    el.remove()
  })
  it('shows Syncing… / Sync error', () => {
    const a = mount({ ...synced, status: 'syncing' })
    expect(a.el.shadowRoot.textContent).toContain('Syncing')
    a.el.remove()
    const b = mount({ ...synced, status: 'error', lastError: 'boom' })
    expect(b.el.shadowRoot.textContent).toContain('Sync error')
    b.el.remove()
  })
  it('reacts to signal changes (synced→syncing un-hides)', () => {
    const { el, sig } = mount(synced)
    expect(el.hasAttribute('hidden')).toBe(true)
    sig.set({ ...synced, status: 'syncing' })
    expect(el.hasAttribute('hidden')).toBe(false)
    el.remove()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `apps/vanilla-oyl/src/components/oyl-sync-status.js`:
```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

const styles = sheet(`
  :host { display: inline-flex; align-items: center; }
  :host([hidden]) { display: none; }
  .chip { display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; color: var(--color-muted);
    padding: .15rem .55rem; border-radius: 999px; background: color-mix(in oklch, var(--color-text) 7%, transparent); }
  .dot { inline-size: .5rem; block-size: .5rem; border-radius: 50%; background: var(--color-muted); }
  .dot.accent { background: var(--color-accent); }
  .dot.warn { background: color-mix(in oklch, #f59e0b 85%, var(--color-text)); }
  .dot.danger { background: var(--color-danger); }
`)

export class OylSyncStatus extends OylElement {
  static styles = [styles]
  constructor() {
    super()
    /** @type {import('../lib/reactive/signal.js').Signal<import('@oyl/all-of-oyl').SyncState | null> | null} */
    this.syncState = null
  }
  render() {
    if (!this.syncState) return
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const chip = document.createElement('span')
    chip.className = 'chip'
    const dot = document.createElement('span')
    dot.className = 'dot'
    const label = document.createElement('span')
    chip.append(dot, label)
    root.append(chip)
    this.track(() => {
      const v = describe(this.syncState ? this.syncState.get() : null)
      if (!v) { this.toggleAttribute('hidden', true); return }
      this.toggleAttribute('hidden', false)
      dot.className = `dot ${v.tone}`
      label.textContent = v.text
      this.setAttribute('aria-label', `Sync: ${v.text}`)
      chip.title = v.title ?? ''
    })
  }
}

/** @param {import('@oyl/all-of-oyl').SyncState | null} s @returns {{ tone: string, text: string, title?: string } | null} */
function describe(s) {
  if (!s) return null
  if (s.status === 'syncing') return { tone: 'accent', text: 'Syncing…' }
  if (s.status === 'error') return { tone: 'danger', text: 'Sync error', ...(s.lastError ? { title: s.lastError } : {}) }
  if (s.status === 'offline' || !s.online) return { tone: 'warn', text: s.pending > 0 ? `Offline · ${s.pending}` : 'Offline' }
  if (s.pending > 0) return { tone: 'warn', text: `${s.pending} pending` }
  return null
}

/** Register the element (idempotent). */
export function defineSyncStatus() {
  if (!customElements.get('oyl-sync-status')) customElements.define('oyl-sync-status', OylSyncStatus)
}
```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-sync-status.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-sync-status.js apps/vanilla-oyl/src/components/oyl-sync-status.test.js
git commit -m "feat(vanilla-oyl): oyl-sync-status — ambient header chip (hidden when synced)"
```

---

### Task 4: Status → Sync block + Resync (`oyl-status-panel`)

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-status-panel.js`; Test `oyl-status-panel.test.js` (extend).

- [ ] **Step 1: Failing test** — append to `oyl-status-panel.test.js` (import `signal` from `../lib/reactive/signal.js`):
```js
describe('<oyl-status-panel> sync section', () => {
  const synced = { online: true, pending: 0, status: 'idle', conflicts: 0, lastSyncedAt: new Date() }
  it('renders a Sync section + Resync button (remote); click calls onResync', () => {
    let resynced = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal(synced), onResync: () => { resynced = true } }
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="resync"]'))
    expect(btn).toBeTruthy()
    btn.click()
    expect(resynced).toBe(true)
    el.remove()
  })
  it('disables Resync when offline', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal({ ...synced, online: false, status: 'offline' }), onResync: () => {} }
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    expect(/** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="resync"]')).disabled).toBe(true)
    el.remove()
  })
  it('renders no Sync section in local mode (sync null)', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
    document.body.append(el)
    expect(el.shadowRoot.querySelector('button[data-act="resync"]')).toBeNull()
    el.remove()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — in `oyl-status-panel.js`:
  - Constructor: after `this.connection = null`, add:
    ```js
    /** @type {{ state: import('../lib/reactive/signal.js').Signal<import('@oyl/all-of-oyl').SyncState | null>, onResync: () => void } | null} */
    this.sync = null
    ```
  - In `render()`, after the `connLabel`/`connEl` are created and before `accountLabel`, build the Sync section when `this.sync` is set:
    ```js
    /** @type {Node[]} */
    let syncNodes = []
    if (this.sync) {
      const syncLabel = document.createElement('h2')
      syncLabel.textContent = 'Sync'
      const syncInfo = document.createElement('p')
      const resyncBtn = document.createElement('button')
      resyncBtn.textContent = 'Resync now'
      resyncBtn.dataset.act = 'resync'
      resyncBtn.addEventListener('click', () => this.sync?.onResync(), { signal: this.lifecycle })
      this.track(() => {
        const s = this.sync ? this.sync.state.get() : null
        if (!s) { syncInfo.textContent = ''; return }
        const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
        const parts = [`Last synced ${when}`]
        if (s.pending > 0) parts.push(`${s.pending} pending`)
        if (s.conflicts > 0) parts.push(`${s.conflicts} reconciled this session`)
        syncInfo.textContent = parts.join(' · ')
        resyncBtn.disabled = !s.online || s.status === 'offline'
      })
      syncNodes = [syncLabel, syncInfo, resyncBtn]
    }
    ```
  - Update the final append to include `syncNodes` between `connEl` and `accountLabel`:
    ```js
    root.append(h2, grid, actions, connLabel, connEl, ...syncNodes, accountLabel, authEl)
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-status-panel.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "feat(vanilla-oyl): status panel Sync block (last-synced + counts + Resync, disabled offline)"
```

---

### Task 5: Wire `main.js`

**Files:** Modify `apps/vanilla-oyl/src/main.js`. No unit test (DOM bootstrap) — verified by the full suite + manual pass.

- [ ] **Step 1:** Add the import:
```js
import { defineSyncStatus } from './components/oyl-sync-status.js'
```

- [ ] **Step 2: Drop the now-redundant explicit refresh** — the data.js effect re-hydrates on the boot pull's `pulledAt`. Change:
```js
  if (mode === 'remote') {
    void dataState.startSync().then(() => dataState.refresh()).catch(() => {})
  }
```
to:
```js
  if (mode === 'remote') {
    void dataState.startSync().catch(() => {})
  }
```

- [ ] **Step 3: Mount the chip (remote only) + wire the Status sync prop.**
  (a) Near where `toggle` is created, add (remote only):
  ```js
  let syncChip = null
  if (mode === 'remote') {
    defineSyncStatus()
    syncChip = /** @type {import('./components/oyl-sync-status.js').OylSyncStatus} */ (document.createElement('oyl-sync-status'))
    syncChip.slot = 'toolbar'
    syncChip.syncState = dataState.syncState
  }
  ```
  (b) Change the single append `shell.append(navEl, toggle, router)` to include the chip before `toggle` when present:
  ```js
  shell.append(navEl, ...(syncChip ? [syncChip] : []), toggle, router)
  ```
  (c) In the `status` route handler, after `panel.connection = { … }`, add:
  ```js
      panel.sync = mode === 'remote' ? { state: dataState.syncState, onResync: dataState.resync } : null
  ```

- [ ] **Step 4: Full gates**
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Green (279 + the new sync-status/panel/data tests).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): mount sync-status chip + Status sync prop; drop redundant boot refresh"
```

---

### Task 6: Real-Chrome acceptance

**Files:** none. Needs the backend + app running (native `pnpm strapi-app develop` :1340 + `pnpm vanilla dev` :8041). If unavailable, STOP and report — Tasks 1–5 are the deliverable.

- [ ] **Step 1:** Start servers; Chrome at `:8041` → Status → Connection → remote → `http://localhost:1340/api` → Apply; register/sign in.
- [ ] **Step 2 (hidden when synced):** with everything synced, the header chip is absent (`:host([hidden])`).
- [ ] **Step 3 (syncing/offline/pending):** DevTools → Offline → add an entry → the chip shows `Offline · 1` (and `Syncing…` briefly when back online); back Online → chip disappears once drained.
- [ ] **Step 4 (live auto-refresh):** PUT a record directly to the backend (JWT from `oyl/auth`), then trigger a pull (reload, or rely on a reconnect) → the new record appears **without a manual reload** (the `pulledAt` effect re-hydrated).
- [ ] **Step 5 (Status + Resync):** Status → Connection shows "Last synced HH:MM" + a "Resync now" button; it's **disabled while offline**; clicking it (online) forces a full pull (network shows `?includeDeleted=1` with no `since`).
- [ ] **Step 6:** Stop servers. Report outcomes.

---

## Notes for the implementer

- `src/` (Task 1): explicit `.js` imports, no DOM globals; `pulledAt?` is additive/optional.
- `refresh` in `data.js` is a hoisted `async function` — the effect may reference it before its textual declaration.
- The chip must `toggleAttribute('hidden', …)` on the **host** (not just empty shadow content) so it takes no flex space when synced.
- Don't touch the engine's flush/pull logic beyond the `pulledAt` emit; don't touch cache/outbox/cursor/auth/stores.
- Keep `oyl-status-panel`'s existing `_paint` diagnostics path; the Sync block uses a separate `track()`.
