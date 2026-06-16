# Backend SP5d2 — Multi-tab flush coordination — Design

**Status:** approved (Web Locks, queuing; flush-only; + fetch timeout; R-1–R-5)
**Date:** 2026-06-15
**Packages:** `@oyl/all-of-oyl` (a `lock` seam on the engine) + `apps/vanilla-oyl` (browser lock, fetch timeout, debounce).
**Context:** Cross-tab *view* sync already works — since SP5a, remote writes hit the shared localStorage cache (`oyl/cache/*`), and `main.js`'s `storage` listener already calls `dataState.refresh()` on any `oyl/*` change, so tab B sees tab A's writes. What's left is that **both tabs' engines flush the shared outbox independently** → double-PUTs and *spurious* conflict-counter increments (the loser hits 409 → client-wins). SP5d2 serializes flushing across tabs with a **Web Locks** mutex, makes the HTTP client time-bounded (so a hung request can't wedge the cross-tab lock), and de-spams the cross-tab refresh. Cross-tab `syncState` propagation is cosmetic → deferred; SP5d3 (per-action retry) is separate.

---

## What this is

A `lock` seam on `createSyncEngine` that serializes `flush()` across tabs (a **queuing** mutex, so a waiting tab's enqueued op is never stranded); a `navigator.locks`-backed browser impl (auto-releases on tab close); a **fetch timeout** on the HTTP client (so a hung request releases the lock); and a debounced storage→refresh.

### Decisions (settled)

1. **Queuing lock, not skip-if-held.** `lock.runExclusive(name, fn)` serializes; a tab whose flush waits then runs and drains (skip-if-held would strand the waiter's op until its next trigger).
2. **`flush` only** (R-3) — the double-flush is the real bug (conflict-counter pollution); concurrent **pulls** are idempotent (`putRaw` + `>=` cursor self-heal), left uncoordinated.
3. **R-1 · fetch timeout** on `createHttpClient` — required, because the lock turns a hung request into a *cross-tab* stall.
4. **R-2 · `doFlush` re-checks `isOnline()`** after acquiring the lock (connectivity may change during the wait).
5. **Web Locks** (`navigator.locks`) — the browser handles election + release-on-tab-close; a fallback runs `fn` directly where unavailable (R-5).
6. Backward-compatible: no `lock` → `flush` runs directly (existing engine tests + single-tab unchanged).

### Out of scope

Cross-tab `syncState` propagation (a background tab's chip lags — cosmetic; BroadcastChannel later). SP5d3 per-action retry. R-18 limits. (R-4: during a lock-wait the chip stays `idle` then flips to `syncing` — no "waiting" state; acceptable.)

---

## Architecture

### 1. `@oyl/all-of-oyl/src/core/sync-engine.ts` — the `lock` seam
```ts
export interface Lock {
  /** Run fn while holding the named lock; serialize (queue) across concurrent holders. */
  runExclusive(name: string, fn: () => Promise<void>): Promise<void>
}
```
Add `lock?: Lock` to the `createSyncEngine` deps (destructure it). `flush()` wraps the body:
```ts
function flush(): Promise<void> {
  if (currentFlush) return currentFlush
  if (!connectivity.isOnline()) { emit({ status: 'offline' }); return Promise.resolve() }
  currentFlush = (lock ? lock.runExclusive('oyl-flush', doFlush) : doFlush()).finally(() => { currentFlush = undefined })
  return currentFlush
}
```
`doFlush` gains a re-check at its top (R-2): `if (!connectivity.isOnline()) { emit({ status: 'offline' }); return }`. (The per-tab `currentFlush` still dedupes intra-tab; the `lock` serializes inter-tab. Export the `Lock` type from the barrel.)

### 2. `apps/vanilla-oyl/src/storage/lock.js` (new) — browser impl
```js
/** Cross-tab serializing lock via the Web Locks API; degrades to a no-coordination passthrough. @param {Window} win */
export function createBrowserLock(win) {
  const locks = win.navigator.locks
  if (!locks) return { runExclusive: (_name, fn) => fn() }       // old browsers: no cross-tab coordination
  return { runExclusive: (name, fn) => locks.request(name, fn) } // default = queue/wait; auto-releases on resolve + tab close
}
```

### 3. `apps/vanilla-oyl/src/storage/bootstrap.js` — wire the lock
Remote branch: `const lock = createBrowserLock(window)` → `createSyncEngine({ collections, outbox, connectivity, now, timers, cursors, lock })`.

### 4. `apps/vanilla-oyl/src/main.js` — fetch timeout (R-1) + debounce
- **Timeout** — change the `createHttpClient({…})` call to add:
  ```js
  timeoutMs: 15000,
  newAbortController: () => new AbortController(),
  timer: { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  ```
- **Debounce the storage→refresh** — import a new `debounce` util; wrap the handler's `dataState.refresh()`:
  ```js
  const debouncedRefresh = debounce(() => void dataState.refresh(), 150)
  window.addEventListener('storage', (e) => {
    if (!e.key || !isOylKey(e.key)) return
    if (e.key === SETTINGS_KEY) themeState.refresh()
    else if (e.key === AUTH_KEY) authState.refresh()
    else debouncedRefresh()
  })
  ```
  (One peer save fires several `oyl/*` writes → several `storage` events → one coalesced refresh.)

### 5. `apps/vanilla-oyl/src/lib/debounce.js` (new)
```js
/** Coalesce rapid calls into one trailing invocation after `ms`. @template {any[]} A
 * @param {(...a: A) => void} fn @param {number} ms @returns {(...a: A) => void} */
export function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let t
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
```

---

## Testing (Vitest)

- **`sync-engine.test.ts`**:
  - `flush()` runs `doFlush` **through** `lock.runExclusive('oyl-flush', …)` when a `lock` is given (a fake lock records the name + that it wrapped the call).
  - **Coordination proof:** two engines sharing **one outbox** (same storage) + **one in-memory serializing mutex** + a **save-counting remote**; both `flush()` concurrently → each record is pushed **once** (no double-PUT). (The in-memory mutex mirrors `navigator.locks` per-origin: a `chain = chain.then(fn)` serializer.)
  - No `lock` → `flush` runs directly (existing behavior intact).
- **`storage/lock.test.js`** (new): `createBrowserLock` with a fake `win` whose `navigator.locks.request(name, cb)` runs `cb` → `runExclusive` invokes `fn` + returns its completion; a `win` **without** `navigator.locks` → the fallback runs `fn` directly (R-5).
- **`lib/debounce.test.js`** (new): three rapid calls → `fn` runs **once** after the window (use vitest fake timers or a real short delay).

## File structure
```
packages/all-of-oyl/src/core/sync-engine.ts   (lock seam: Lock type, lock? dep, flush wraps doFlush, doFlush re-checks online) + test
packages/all-of-oyl/src/index.ts               (export type Lock)
apps/vanilla-oyl/src/storage/lock.js            (new: createBrowserLock) + lock.test.js
apps/vanilla-oyl/src/lib/debounce.js            (new) + debounce.test.js
apps/vanilla-oyl/src/storage/bootstrap.js       (build + pass lock)
apps/vanilla-oyl/src/main.js                    (createHttpClient timeout + debounced storage refresh)
```
No change to cache/outbox/cursor/conflict logic. Cross-tab view sync (the storage listener + shared cache) is unchanged — just de-spammed.

## Acceptance

`pnpm all-of test` + `typecheck:src` + `pnpm all-of build` green; `pnpm vanilla test` + typecheck green. Then real-Chrome (native `:1340`/`:8041`, remote): open **two tabs**, sign in (shared cache); in tab A add a journal entry → it appears in tab B (view sync) and **`syncState.conflicts` stays 0 in both** (no spurious conflict from a double-flush); under DevTools network throttling, a save's PUT that exceeds 15 s aborts (transport error) and **does not** leave the other tab's flush hung (the lock releases). Closing the tab that holds the flush lock mid-flush frees it for the other tab. Ready for SP5d3 (per-action retry).
