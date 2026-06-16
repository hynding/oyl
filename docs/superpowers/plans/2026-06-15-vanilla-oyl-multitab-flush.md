# Backend SP5d2 — Multi-tab flush coordination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Serialize `flush()` across tabs with a Web Locks mutex (so two tabs don't double-flush the shared outbox → no spurious conflicts), make the HTTP client time-bounded (so a hung request can't wedge the cross-tab lock), and debounce the cross-tab refresh.

**Architecture:** A `lock` seam on `createSyncEngine` (queuing mutex; backward-compatible) + a `navigator.locks` browser impl + a fetch timeout on `createHttpClient` + a `debounce` util on the storage→refresh. Cross-tab *view* sync already works (SP5a cache + the SP4a storage listener).

**Tech Stack:** TS (strict, NodeNext, no DOM lib) + Vitest for `src/`; vanilla JS + Vitest for the app.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-multitab-flush-design.md`

**Gates:** `pnpm --filter @oyl/all-of-oyl test` / `typecheck:src` / `pnpm all-of build`; `pnpm vanilla test` / `pnpm vanilla typecheck`.

---

### Task 1: Engine `lock` seam

**Files:** Modify `packages/all-of-oyl/src/core/sync-engine.ts` + `index.ts`; Test `sync-engine.test.ts`.

- [ ] **Step 1: Failing test** — append to `sync-engine.test.ts` (reuses `mem`/`codec`/`now`/`area`/`createCacheStore`/`createOutbox`/`manualConnectivity`/`InMemoryRepository`):
```ts
/** A serializing in-process mutex — mirrors navigator.locks per-origin across "tabs". */
function memLock() {
  /** @type {Promise<any>} */
  let chain = Promise.resolve()
  const calls = []
  return { calls, runExclusive: (name, fn) => { calls.push(name); const p = chain.then(() => fn()); chain = p.catch(() => {}); return p } }
}
/** Wrap a remote to count save() calls. */
function counting(inner) {
  let saves = 0
  return { get: (id) => inner.get(id), list: (o) => inner.list(o), save: (x) => { saves++; return inner.save(x) }, delete: (id) => inner.delete(id), purge: (id) => inner.purge(id), saveMany: (i) => inner.saveMany(i), get saves() { return saves } }
}

describe('createSyncEngine — flush lock', () => {
  it('runs flush through lock.runExclusive(oyl-flush) when a lock is given', async () => {
    const storage = mem()
    const lock = memLock()
    const remote = new InMemoryRepository(now)
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now, lock })
    const a = area()
    await engine.repositories.lifeAreas.save(a)
    await engine.flush()
    expect(lock.calls).toContain('oyl-flush')
    expect(await remote.get(a.id)).toBeTruthy() // flush still proceeded
  })

  it('serializes two engines on a shared outbox — each record pushed once (no double-flush)', async () => {
    const storage = mem()
    const lock = memLock()
    const remote = counting(new InMemoryRepository(now))
    const mk = () => createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now, lock })
    const A = mk(); const B = mk()
    await A.repositories.lifeAreas.save(area()) // enqueues to the SHARED outbox (+ auto-triggers A.flush)
    await Promise.all([A.flush(), B.flush()])
    expect(remote.saves).toBe(1) // lock serialized; the second flush found the outbox drained
  })
})
```

- [ ] **Step 2: Run — FAIL** (`lock` not a dep):
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts`

- [ ] **Step 3: Implement** in `sync-engine.ts`:
  - Add the `Lock` interface (near the other exported interfaces, e.g. after `Observable`):
    ```ts
    export interface Lock {
      /** Run fn while holding the named lock; serialize (queue) across concurrent holders. */
      runExclusive(name: string, fn: () => Promise<void>): Promise<void>
    }
    ```
  - In the `createSyncEngine` deps type, add (after `conflictPolicy?`):
    ```ts
      lock?: Lock
    ```
  - Add `lock` to the destructure: `const { collections, outbox, connectivity, now, timers, cursors, lock } = deps`.
  - Replace `flush()` with:
    ```ts
    function flush(): Promise<void> {
      if (currentFlush) return currentFlush
      if (!connectivity.isOnline()) { emit({ status: 'offline' }); return Promise.resolve() }
      currentFlush = (lock ? lock.runExclusive('oyl-flush', doFlush) : doFlush()).finally(() => { currentFlush = undefined })
      return currentFlush
    }
    ```
  - At the top of `doFlush()` (before `emit({ status: 'syncing' })`), add the online re-check (R-2):
    ```ts
    async function doFlush(): Promise<void> {
      if (!connectivity.isOnline()) { emit({ status: 'offline' }); return }
      emit({ status: 'syncing' })
      // … unchanged …
    ```

- [ ] **Step 4: Barrel** — in `packages/all-of-oyl/src/index.ts`, add `type Lock` to the sync-engine export:
```ts
export { createSyncEngine, type SyncEngine, type SyncState, type Observable, type Lock } from './core/sync-engine.js'
```

- [ ] **Step 5: Verify** + commit:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): cross-tab flush lock seam (serializes flush; doFlush re-checks online)"
```

---

### Task 2: `createBrowserLock` (Web Locks)

**Files:** Create `apps/vanilla-oyl/src/storage/lock.js` + `lock.test.js`.

- [ ] **Step 1: Failing test** `apps/vanilla-oyl/src/storage/lock.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
import { createBrowserLock } from './lock.js'

describe('createBrowserLock', () => {
  it('uses navigator.locks.request when available (holds during fn)', async () => {
    const requested = []
    const win = { navigator: { locks: { request: (name, fn) => { requested.push(name); return Promise.resolve(fn()) } } } }
    const lock = createBrowserLock(/** @type {any} */ (win))
    const ran = vi.fn(async () => {})
    await lock.runExclusive('oyl-flush', ran)
    expect(requested).toEqual(['oyl-flush'])
    expect(ran).toHaveBeenCalledOnce()
  })

  it('falls back to running fn directly when navigator.locks is absent', async () => {
    const win = { navigator: {} }
    const lock = createBrowserLock(/** @type {any} */ (win))
    const ran = vi.fn(async () => {})
    await lock.runExclusive('oyl-flush', ran)
    expect(ran).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `apps/vanilla-oyl/src/storage/lock.js`:
```js
/**
 * Cross-tab serializing lock via the Web Locks API; degrades to a no-coordination
 * passthrough where unavailable. @param {Window} win
 * @returns {import('@oyl/all-of-oyl').Lock}
 */
export function createBrowserLock(win) {
  const locks = win.navigator.locks
  if (!locks) return { runExclusive: (_name, fn) => fn() }
  return { runExclusive: (name, fn) => locks.request(name, fn) }
}
```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/lock.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/lock.js apps/vanilla-oyl/src/storage/lock.test.js
git commit -m "feat(vanilla-oyl): createBrowserLock — Web Locks cross-tab mutex (with fallback)"
```

---

### Task 3: `debounce` util

**Files:** Create `apps/vanilla-oyl/src/lib/debounce.js` + `debounce.test.js`.

- [ ] **Step 1: Failing test** `apps/vanilla-oyl/src/lib/debounce.test.js`:
```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce.js'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces rapid calls into one trailing invocation', () => {
    const fn = vi.fn()
    const d = debounce(fn, 150)
    d(); d(); d()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs again after the window resets', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d(); vi.advanceTimersByTime(100)
    d(); vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `apps/vanilla-oyl/src/lib/debounce.js`:
```js
/**
 * Coalesce rapid calls into one trailing invocation after `ms`.
 * @template {any[]} A
 * @param {(...a: A) => void} fn
 * @param {number} ms
 * @returns {(...a: A) => void}
 */
export function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}
```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/lib/debounce.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/lib/debounce.js apps/vanilla-oyl/src/lib/debounce.test.js
git commit -m "feat(vanilla-oyl): debounce util"
```

---

### Task 4: Wire the lock + fetch timeout + debounced refresh

**Files:** Modify `apps/vanilla-oyl/src/storage/bootstrap.js` + `apps/vanilla-oyl/src/main.js`. (No new unit test — `bootstrap.test` already covers the remote engine building; main.js is real-Chrome.)

- [ ] **Step 1: bootstrap — build + pass the lock.** In `apps/vanilla-oyl/src/storage/bootstrap.js`:
  - Add the import:
    ```js
    import { createBrowserLock } from './lock.js'
    ```
  - In the remote branch, build the lock and pass it to `createSyncEngine`:
    ```js
    const cursors = createCursorStore(storage, CURSORS_KEY)
    const lock = createBrowserLock(window)
    const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
    const engine = createSyncEngine({ collections, outbox, connectivity: opts.connectivity ?? alwaysOnline(), now, timers, cursors, lock })
    ```

- [ ] **Step 2: main.js — fetch timeout (R-1).** Change the `createHttpClient({…})` call (the `mode === 'remote' ? createHttpClient({...}) : undefined`) to add the timeout opts:
    ```js
    ? createHttpClient({
        baseUrl: getApiBaseUrl(storage), fetch: window.fetch.bind(window), getToken: authState.getToken,
        onAuthError: () => authState.logout(),
        timeoutMs: 15000,
        newAbortController: () => new AbortController(),
        timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
      })
    ```

- [ ] **Step 3: main.js — debounce the storage→refresh.** Add the import:
    ```js
    import { debounce } from './lib/debounce.js'
    ```
  Then change the storage handler (currently `… else void dataState.refresh()`) to use a debounced refresh:
    ```js
    const debouncedRefresh = debounce(() => void dataState.refresh(), 150)
    window.addEventListener('storage', (e) => {
      if (!e.key || !isOylKey(e.key)) return
      if (e.key === SETTINGS_KEY) themeState.refresh()
      else if (e.key === AUTH_KEY) authState.refresh()
      else debouncedRefresh()
    })
    ```

- [ ] **Step 4: Full gates**
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Green (300 + the lock/debounce tests).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/bootstrap.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire cross-tab flush lock + fetch timeout + debounced cross-tab refresh"
```

---

### Task 5: Real-Chrome acceptance (two tabs)

**Files:** none. Needs native `pnpm strapi-app develop` :1340 + `pnpm vanilla dev` :8041. If unavailable, STOP and report — Tasks 1–4 are the deliverable.

- [ ] **Step 1:** Start servers. Open **two** browser tabs at `:8041`, both remote (`http://localhost:1340/api`), signed in (shared cache + auth).
- [ ] **Step 2 (view sync):** in tab A add a journal entry → it appears in tab B (the storage→refresh; debounced) within ~150 ms.
- [ ] **Step 3 (no double-flush):** after the entry syncs, check **both** tabs' Status → Connection: `conflicts` (reconciled this session) is **0** in both — no spurious conflict from a double-flush. (Without the lock, a concurrent flush would 409→client-wins and bump the counter.)
- [ ] **Step 4 (timeout frees the lock):** DevTools → Network → add a slow/offline condition; trigger a save; confirm a stuck request aborts after ~15 s (transport error) rather than leaving the other tab's flush hung.
- [ ] **Step 5 (tab-close releases):** close the tab mid-flush; the other tab's next flush proceeds (Web Lock auto-released). Report outcomes; stop servers.

---

## Notes for the implementer
- `src/` (Task 1): explicit `.js` imports; no DOM globals (the `Lock` is an injected interface — no `navigator` reference in `sync-engine.ts`). `pnpm all-of build` is the gate.
- Backward-compatible: no `lock` → `flush` runs `doFlush` directly (existing engine tests stay green).
- `bootstrap.js`/`main.js` already use browser globals (`setTimeout`, `window`); `createBrowserLock(window)` + `new AbortController()` are consistent.
- The lock wraps **flush only** (not pull — concurrent pulls are idempotent).
- 15 s timeout is client-wide (bounds get/list/save/delete/batch) — intended.
