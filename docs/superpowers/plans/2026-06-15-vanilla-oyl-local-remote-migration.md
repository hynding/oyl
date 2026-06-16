# Backend SP5c — Local→remote migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** On first remote sign-in, offer (a confirm prompt) to upload a local-mode user's local-only data to the backend — replaying each local record through the remote facade (cache + outbox) so it reappears instantly and uploads in the background.

**Architecture:** A `storage/migrate.js` module (count / `hasUnmigratedLocal` / `shouldOfferMigration` / idempotent validate-first `migrateLocalToRemote`) + thin `data.js` orchestration + a Status manual button + `main.js` prompt wiring. No `@oyl/all-of-oyl` change — the engine/facades are the upload path.

**Tech Stack:** Vanilla JS + JSDoc, Vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-local-remote-migration-design.md`

**Gates:** `pnpm vanilla test` / `pnpm vanilla typecheck`.

---

### Task 1: keys + `storage/migrate.js`

**Files:** Modify `apps/vanilla-oyl/src/storage/keys.js`; Create `apps/vanilla-oyl/src/storage/migrate.js` + `migrate.test.js`.

- [ ] **Step 1: keys** — add to `apps/vanilla-oyl/src/storage/keys.js` (near `CURSORS_KEY`):
```js
export const MIGRATED_KEY = 'oyl/migrated'
export const MIGRATE_DECLINED_KEY = 'oyl/migrate-declined'
```

- [ ] **Step 2: Failing test** `apps/vanilla-oyl/src/storage/migrate.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LifeArea, COLLECTIONS } from '@oyl/all-of-oyl'
import { countLocalRecords, hasUnmigratedLocal, shouldOfferMigration, migrateLocalToRemote } from './migrate.js'
import { dataKey, MIGRATED_KEY, MIGRATE_DECLINED_KEY } from './keys.js'

/** @returns {any} */
function mem() {
  /** @type {Map<string,string>} */
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: (k) => { m.delete(k) } }
}
/** Seed n LifeAreas into local storage (real toJSON shapes). */
function seedLifeAreas(storage, n) {
  const codec = /** @type {any} */ (COLLECTIONS.lifeAreas)
  const shapes = Array.from({ length: n }, (_, i) => codec.toJSON(new LifeArea({ name: `A${i}`, slug: `a${i}` })))
  storage.setItem(dataKey('lifeAreas'), JSON.stringify(shapes))
}
/** Stub repos: a save spy per collection. */
function stubRepos() {
  /** @type {any} */
  const r = {}
  for (const name of Object.keys(COLLECTIONS)) r[name] = { save: vi.fn(async (x) => x) }
  return r
}

describe('migrate', () => {
  /** @type {any} */
  let storage
  beforeEach(() => { storage = mem() })

  it('countLocalRecords sums local collections', () => {
    seedLifeAreas(storage, 3)
    expect(countLocalRecords(storage)).toBe(3)
  })

  it('hasUnmigratedLocal vs shouldOfferMigration (decline keeps the button — R-8)', () => {
    seedLifeAreas(storage, 1)
    expect(hasUnmigratedLocal(storage)).toBe(true)
    expect(shouldOfferMigration(storage)).toBe(true)
    storage.setItem(MIGRATE_DECLINED_KEY, '1')
    expect(shouldOfferMigration(storage)).toBe(false)   // no auto-prompt
    expect(hasUnmigratedLocal(storage)).toBe(true)        // manual button still available
    storage.setItem(MIGRATED_KEY, '1')
    expect(hasUnmigratedLocal(storage)).toBe(false)
    expect(shouldOfferMigration(storage)).toBe(false)
  })

  it('migrateLocalToRemote saves each record, sets MIGRATED_KEY, keeps local intact', async () => {
    seedLifeAreas(storage, 2)
    const repos = stubRepos()
    const n = await migrateLocalToRemote(storage, repos)
    expect(n).toBe(2)
    expect(repos.lifeAreas.save).toHaveBeenCalledTimes(2)
    expect(storage.getItem(MIGRATED_KEY)).toBe('1')
    expect(storage.getItem(dataKey('lifeAreas'))).toBeTruthy() // local kept
  })

  it('is idempotent — a second call returns 0 and saves nothing (R-7)', async () => {
    seedLifeAreas(storage, 2)
    const repos = stubRepos()
    await migrateLocalToRemote(storage, repos)
    repos.lifeAreas.save.mockClear()
    const n = await migrateLocalToRemote(storage, repos)
    expect(n).toBe(0)
    expect(repos.lifeAreas.save).not.toHaveBeenCalled()
  })

  it('aborts on a malformed shape without setting MIGRATED_KEY (R-3)', async () => {
    storage.setItem(dataKey('lifeAreas'), JSON.stringify([{ garbage: 1 }]))
    const repos = stubRepos()
    await expect(migrateLocalToRemote(storage, repos)).rejects.toThrow()
    expect(storage.getItem(MIGRATED_KEY)).toBeNull()
    expect(repos.lifeAreas.save).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run — FAIL** (`./migrate.js` missing):
`pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/migrate.test.js`

- [ ] **Step 4: Implement** `apps/vanilla-oyl/src/storage/migrate.js`:
```js
import { COLLECTIONS } from '@oyl/all-of-oyl'
import { dataKey, MIGRATED_KEY, MIGRATE_DECLINED_KEY } from './keys.js'

/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/** Σ local (oyl/data/*) record counts across all collections. @param {AppStorage} storage @returns {number} */
export function countLocalRecords(storage) {
  let n = 0
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) n += arr.length
    }
  }
  return n
}

/** Un-migrated local data exists (the standing capability — the manual button). @param {AppStorage} storage */
export function hasUnmigratedLocal(storage) {
  return countLocalRecords(storage) > 0 && !storage.getItem(MIGRATED_KEY)
}

/** Offer the auto-prompt iff there's un-migrated local data AND it hasn't been declined. @param {AppStorage} storage */
export function shouldOfferMigration(storage) {
  return hasUnmigratedLocal(storage) && !storage.getItem(MIGRATE_DECLINED_KEY)
}

/**
 * Upload local-only data to remote via the engine facades. Idempotent (a no-op once
 * MIGRATED_KEY is set). Validate-first: revive every record before saving any. Sets
 * MIGRATED_KEY on success.
 * @param {AppStorage} storage
 * @param {Record<string, import('@oyl/all-of-oyl').Repository<any>>} repos
 * @returns {Promise<number>}
 */
export async function migrateLocalToRemote(storage, repos) {
  if (storage.getItem(MIGRATED_KEY)) return 0
  /** @type {Array<{ name: string, item: any }>} */
  const revived = []
  for (const name of Object.keys(COLLECTIONS)) {
    const raw = storage.getItem(dataKey(name))
    if (!raw) continue
    const shapes = JSON.parse(raw)
    if (!Array.isArray(shapes)) continue
    const codec = /** @type {any} */ (COLLECTIONS[name])
    for (const shape of shapes) revived.push({ name, item: codec.fromJSON(shape) }) // throws → abort (R-3)
  }
  for (const { name, item } of revived) await repos[name].save(item) // cache + outbox + flush trigger
  storage.setItem(MIGRATED_KEY, '1')
  return revived.length
}
```

- [ ] **Step 5: Run — PASS** (5 tests) + `pnpm vanilla typecheck`.

- [ ] **Step 6: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/migrate.js apps/vanilla-oyl/src/storage/migrate.test.js
git commit -m "feat(vanilla-oyl): migrate.js — local→remote upload (idempotent, validate-first) + offer/has predicates"
```

---

### Task 2: `data.js` — migrationOffer + migrateLocal

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`; Test `data.test.js` (extend).

- [ ] **Step 1: Failing test** — add to `data.test.js` (reuse the file's remote stub-client/storage/themeState helpers; import nothing new beyond what's there + `dataKey` from `../storage/keys.js` if needed to seed):
```js
describe('createDataState migration surface', () => {
  it('migrationOffer reflects local data; migrateLocal uploads + returns count', async () => {
    // seed local data BEFORE creating the data state
    const { LifeArea, COLLECTIONS } = await import('@oyl/all-of-oyl')
    const codec = COLLECTIONS.lifeAreas
    storage.setItem('oyl/data/lifeAreas', JSON.stringify([codec.toJSON(new LifeArea({ name: 'H', slug: 'h' }))]))
    const ds = createDataState(storage, themeState, { client: <STUB-CLIENT>, connectivity: manualConnectivity(true) })
    expect(ds.migrationOffer()).toEqual({ count: 1 })
    const n = await ds.migrateLocal()
    expect(n).toBe(1)
    expect(ds.migrationOffer()).toBeNull() // migrated → no longer offered
  })
})
```
(Adapt `<STUB-CLIENT>`/`storage`/`themeState` to the file's existing helpers. The stub client must let `repos.lifeAreas.save` succeed — the engine facade writes the cache; the network flush is fire-and-forget so it needn't actually succeed.)

- [ ] **Step 2: Run — FAIL** (`migrationOffer`/`migrateLocal` missing).

- [ ] **Step 3: Implement** — in `apps/vanilla-oyl/src/state/data.js`:
  - Add the import:
    ```js
    import { shouldOfferMigration, countLocalRecords, migrateLocalToRemote } from '../storage/migrate.js'
    ```
  - Near the sync surface (after `resync`), add:
    ```js
    /** @returns {{ count: number } | null} */
    function migrationOffer() { return shouldOfferMigration(storage) ? { count: countLocalRecords(storage) } : null }
    /** Upload local data to remote + re-hydrate. @returns {Promise<number>} */
    async function migrateLocal() { const n = await migrateLocalToRemote(storage, repos); await refresh(); return n }
    ```
  - Add to the returned object (currently ends `…, syncState, startSync, syncFlush, resync }`):
    ```js
    return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription, accounts, syncState, startSync, syncFlush, resync, migrationOffer, migrateLocal }
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): data.js migrationOffer + migrateLocal (upload local data + refresh)"
```

---

### Task 3: Status manual "Upload local data" button

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-status-panel.js`; Test `oyl-status-panel.test.js` (extend).

- [ ] **Step 1: Failing test** — append to `oyl-status-panel.test.js`:
```js
describe('<oyl-status-panel> migration button', () => {
  const diag = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
  it('shows Upload local data (N) when migration set; click calls onUpload + hides', () => {
    let uploaded = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.migration = { count: 5, onUpload: () => { uploaded = true } }
    el.diagnostics = diag
    document.body.append(el)
    const btn = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="upload-local"]'))
    expect(btn).toBeTruthy()
    expect(btn.textContent).toContain('5')
    btn.click()
    expect(uploaded).toBe(true)
    expect(btn.hidden).toBe(true)
    el.remove()
  })
  it('no button when migration is null or count 0', () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.diagnostics = diag
    document.body.append(el)
    expect(el.shadowRoot.querySelector('button[data-act="upload-local"]')).toBeNull()
    el.remove()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — in `oyl-status-panel.js`:
  - Constructor: after `this.sync = null`, add:
    ```js
    /** @type {{ count: number, onUpload: () => void } | null} */
    this.migration = null
    ```
  - In `render()`, after the `syncNodes` block and before the final `root.append(...)`, add the migration button nodes:
    ```js
    /** @type {Node[]} */
    let migrateNodes = []
    if (this.migration && this.migration.count > 0) {
      const upBtn = document.createElement('button')
      upBtn.textContent = `Upload local data (${this.migration.count})`
      upBtn.dataset.act = 'upload-local'
      upBtn.addEventListener('click', () => { this.migration?.onUpload(); upBtn.hidden = true }, { signal: this.lifecycle })
      migrateNodes = [upBtn]
    }
    ```
  - Change the final append to include `...migrateNodes` (after `...syncNodes`, before `accountLabel`):
    ```js
    root.append(h2, grid, actions, connLabel, connEl, ...syncNodes, ...migrateNodes, accountLabel, authEl)
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-status-panel.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js
git commit -m "feat(vanilla-oyl): status panel Upload-local-data button (self-hides on click)"
```

---

### Task 4: `main.js` — prompt + wiring

**Files:** Modify `apps/vanilla-oyl/src/main.js`. No unit test (confirm + boot) — full suite + real-Chrome.

- [ ] **Step 1: Imports** — extend the `./storage/keys.js` import to add `MIGRATE_DECLINED_KEY`, and add a `./storage/migrate.js` import:
```js
import { isOylKey, SETTINGS_KEY, AUTH_KEY, MIGRATE_DECLINED_KEY } from './storage/keys.js'
import { hasUnmigratedLocal, countLocalRecords } from './storage/migrate.js'
```

- [ ] **Step 2: `maybeOfferMigration`** — define it in the boot scope (after `dataState` + `noticeState` + `authState` exist; before the remote `startSync` block):
```js
  function maybeOfferMigration() {
    if (mode !== 'remote' || !authState.session.get()) return
    const offer = dataState.migrationOffer()
    if (!offer) return
    if (confirm(`You have ${offer.count} local item(s). Upload them to your account?`)) {
      void dataState.migrateLocal().then((n) => noticeState.show(`Uploaded ${n} local item(s) to your account.`)).catch(() => {})
    } else {
      storage.setItem(MIGRATE_DECLINED_KEY, '1')
    }
  }
```

- [ ] **Step 3: Call it at boot + on sign-in.**
  (a) In the remote boot block, after `void dataState.startSync().catch(() => {})`, add `maybeOfferMigration()`:
  ```js
  if (mode === 'remote') {
    void dataState.startSync().catch(() => {})
    maybeOfferMigration()
  }
  ```
  (b) In the sign-in effect (currently `if (signedIn && !wasSignedIn) dataState.syncFlush()`), add the call:
  ```js
    if (signedIn && !wasSignedIn) { dataState.syncFlush(); maybeOfferMigration() }
  ```

- [ ] **Step 4: `panel.migration` in the status route** — after `panel.sync = …`, add:
```js
      panel.migration = mode === 'remote' && hasUnmigratedLocal(storage)
        ? { count: countLocalRecords(storage), onUpload: () => void dataState.migrateLocal() }
        : null
```

- [ ] **Step 5: Full gates**
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Green (292 + the new migrate/data/panel tests).

- [ ] **Step 6: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): offer local→remote migration on first remote sign-in + Status upload button"
```

---

### Task 5: Real-Chrome acceptance

**Files:** none. Needs native `pnpm strapi-app develop` :1340 + `pnpm vanilla dev` :8041. If unavailable, STOP and report — Tasks 1–4 are the deliverable.

- [ ] **Step 1:** Start servers. In a FRESH browser profile (or clear `oyl/*`), stay in **local** mode (default) and create several records (journal entries, a goal).
- [ ] **Step 2:** Status → Connection → switch to **Remote** + `http://localhost:1340/api` → Apply (reload). The app shows empty + the "sign in" notice (local data is stranded).
- [ ] **Step 3:** Account → register. A **confirm** appears: "You have N local item(s). Upload…". Click **Upload** → the records reappear (from cache); the SP5d chip shows them draining ("N pending" → synced). Verify on the backend via `curl` (with the JWT).
- [ ] **Step 4:** Reload → records still present; **no** re-prompt (`oyl/migrated`).
- [ ] **Step 5 (decline path):** fresh profile, repeat to the confirm, click **Not now** → no upload, but Status → Connection shows an **"Upload local data (N)"** button; clicking it performs the same migration. Report outcomes; stop servers.

---

## Notes for the implementer

- No `@oyl/all-of-oyl` change — migration reuses `repos[name].save` (the remote facade).
- `migrateLocalToRemote` is idempotent (early-return when `MIGRATED_KEY` set) and validate-first (revive all before saving any).
- The manual button uses `hasUnmigratedLocal` (not `shouldOfferMigration`) so "Not now" keeps it (R-8).
- Keep the local dataset intact (non-destructive); the `MIGRATED_KEY` flag prevents re-upload.
- `confirm` is consistent with the existing Reset confirm in `main.js`.
