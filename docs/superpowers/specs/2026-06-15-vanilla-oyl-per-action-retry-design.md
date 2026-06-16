# Backend SP5d3 — Per-action retry / poison-op handling — Design

**Status:** approved (defensive poison-handling; R-1–R-5)
**Date:** 2026-06-15
**Packages:** `@oyl/all-of-oyl` (`sync-engine.ts` classify + `outbox.ts` failed-tracking) + `apps/vanilla-oyl` (chip + Status UI + data.js passthrough).
**Context:** The offline-first stack already auto-retries transients (outbox + backoff) and auto-flushes on reconnect/re-login, so realistic failures are handled. SP5d3 is **insurance** against a latent fail-unsafe: `errKind` lumps every non-auth `HttpRepositoryError` into `transport`, so a *permanent* per-op error (a 4xx — future 413/422, or an unexpected bug error) would be retried forever and, since any flush error `return`s, **silently halt the whole outbox**. SP5d3 quarantines such poison ops (skip + surface + Retry/Discard) instead. The opaque backend produces no per-op 4xx today; this fixes the misclassification + gives a user escape if one ever occurs.

---

## What this is

A 3-way error `classify` (`auth | transport | poison`), an outbox that can **mark/clear/discard** failed entries, a flush loop that **filters out** quarantined ops (so one poison op never blocks or spins the queue), `syncState.failed`, and a Status "N writes couldn't sync — Retry / Discard" control.

### Decisions (settled)

1. **`poison` = a `HttpRepositoryError` with a 4xx status (≠401/403/409/404) OR any non-`HttpRepositoryError` (unexpected/bug error).** `transport` = network or status ≥ 500. `auth` = 401/403. (409/404 never reach the catch.)
2. **Poison → `outbox.markFailed` + CONTINUE** (quarantine the op, flush the rest). `transport` → `scheduleRetry` + halt (unchanged). `auth` → `emit error` + halt (unchanged).
3. **R-2 (critical): flush iterates `list().filter(e => !e.failedAt)`** (both the initial read and the `while` re-read) — a `continue` would infinite-loop the length-guarded drain.
4. **Discard drops the op only** (R-1): an existing-record edit yields to the server on the next pull; a discarded *new* record lingers as a local orphan (rare; documented).
5. **R-3 (intended): re-editing a failed record auto-retries it** — a fresh coalesced enqueue (no `failedAt`) re-enters the flush.
6. **`syncState.failed`** (+ `lastFailedError?`); `pending` excludes failed (both derived from `outbox.list()`).

### Out of scope

Per-row failure list (aggregate "N failed + Retry/Discard all" suffices — the queue flushes together). Reverting the cache on Discard (pull reconciles existing edits server-wins). Cross-tab `failed` propagation (cosmetic). R-4: pull is a read — it doesn't quarantine; a (rare) 4xx on `list` propagates/throws.

---

## Architecture

### 1. `@oyl/all-of-oyl/src/core/sync-engine.ts` — `classify` + flush
Replace `errKind` with:
```ts
function classify(e: unknown): 'auth' | 'transport' | 'poison' {
  const x = e as { name?: string; kind?: string; status?: number }
  if (x?.name === 'HttpRepositoryError') {
    if (x.kind === 'auth') return 'auth'
    if (typeof x.status === 'number' && x.status >= 400 && x.status < 500) return 'poison' // non-retryable per-op
    return 'transport' // network or 5xx
  }
  return 'poison' // unexpected/bug error — surface, don't block/loop
}
```
**`doFlush`** — iterate the filtered worklist (R-2):
```ts
let entries = outbox.list().filter((e) => !e.failedAt)
while (entries.length > 0) {
  for (const entry of entries) {
    // … save/delete/purge as today …
    // catch (e):
    const kind = classify(e)
    if (kind === 'auth') { emit({ status: 'error', lastError: message(e) }); return }
    if (kind === 'transport') { scheduleRetry(); emit({ status: 'offline' }); return }
    outbox.markFailed(entry.collection, entry.id as unknown as Id, message(e)); emit({ lastFailedError: message(e) }); // poison → quarantine + CONTINUE (R-8)
  }
  entries = outbox.list().filter((e) => !e.failedAt)
}
```
**R-6:** `classify` runs in the **outer** per-entry catch only. The save branch's *inner* try/catch (conflict → `resolveConflict`, kept with its own `scheduleRetry`+`return`) and `delete`/`purge`'s 404-idempotent inner catch are unchanged — a poison `remote.save` is re-thrown by the inner `if (!isConflict(e)) throw e` and surfaces in the outer catch where `classify` decides. **`pull`** swaps its `errKind(e) === 'transport'` check to `classify(e) === 'transport'`.

`emit` derives counts from the outbox:
```ts
const entries = outbox.list()
state = { ...state, ...patch, pending: entries.filter((e) => !e.failedAt).length, failed: entries.filter((e) => e.failedAt).length, online: connectivity.isOnline() }
```
`SyncState` gains `failed: number` (+ `lastFailedError?: string`); **R-7: the initial `state` literal must seed `failed: 0`** (required field, like `conflicts: 0`). `SyncEngine` gains `retryFailed(): Promise<void>` (`outbox.clearFailed()` → `flush()`) and `discardFailed(): void` (`outbox.discardFailed()` → `emit({})`).

### 2. `@oyl/all-of-oyl/src/core/outbox.ts` — failed-tracking
`OutboxEntry` gains `failedAt?: string; error?: string`. New methods:
```ts
markFailed(collection: string, id: Id, error: string): void   // stamp failedAt + error
clearFailed(): void                                           // unmark all (Retry)
discardFailed(): void                                         // remove all entries with failedAt (Discard)
```
`enqueue`'s coalesce still replaces any prior entry for `(collection,id)` with a fresh one (no `failedAt`) — so re-editing a failed record un-quarantines it (R-3). `list()`/`has()`/`size()` unchanged (return all incl. failed; the engine filters for flush + derives counts).

### 3. `apps/vanilla-oyl/src/state/data.js`
Expose `retryFailed` (= `engine.retryFailed`) and `discardFailed` (= `engine.discardFailed`); the bridged `syncState` signal now carries `failed`/`lastFailedError`.

### 4. `apps/vanilla-oyl/src/components/oyl-sync-status.js` — chip
Add a `failed` branch with **precedence** (R-5 — action-needed, sticky): when `s.failed > 0` → `{ tone: 'danger', text: \`${s.failed} failed\` }`, shown even when idle/syncing.

### 5. `apps/vanilla-oyl/src/components/oyl-status-panel.js` — Retry/Discard
The Sync block's `sync` prop gains `onRetryFailed`/`onDiscardFailed`. When `state.get().failed > 0`, render "N write(s) couldn't sync" + a **Retry** button (`data-act="retry-failed"` → `onRetryFailed`) + a **Discard** button (`data-act="discard-failed"` → `onDiscardFailed`), via the existing `track()`.

### 6. `apps/vanilla-oyl/src/main.js`
Extend `panel.sync` (remote) to include `onRetryFailed: () => void dataState.retryFailed()` and `onDiscardFailed: () => dataState.discardFailed()`.

---

## Testing (Vitest)

- **`outbox.test.ts`**: `markFailed` stamps; `list()` still returns failed entries; `clearFailed` unmarks all; `discardFailed` removes only failed; persists across reload.
- **`sync-engine.test.ts`**:
  - `classify` — 422/413/400 → `poison`; 500/network → `transport`; 401/403 → `auth`; a plain `Error` → `poison`.
  - **poison quarantine:** a remote stub that throws `new HttpRepositoryError('server', 'too large', 413)` for record P and succeeds for record G; enqueue both → flush → **G lands on the remote, P is marked failed**, `syncState.failed === 1`, `pending` excludes P, and the loop **terminates** (no hang).
  - `retryFailed()` with the stub now succeeding → `failed === 0`, P on the remote.
  - `discardFailed()` → P's op removed (`failed === 0`, not pushed).
  - a plain `Error` from a stub → marked failed (not infinite-retried, not halting the others).
- **`oyl-sync-status.test.js`**: `failed > 0` → chip "N failed" (danger), shown even when `status: 'idle'`.
- **`oyl-status-panel.test.js`**: `state.failed > 0` → Retry + Discard buttons; clicks call `onRetryFailed`/`onDiscardFailed`.

## File structure
```
packages/all-of-oyl/src/core/sync-engine.ts   (classify, flush filter + poison-mark, syncState.failed, retryFailed/discardFailed) + test
packages/all-of-oyl/src/core/outbox.ts          (failedAt/error + markFailed/clearFailed/discardFailed) + test
apps/vanilla-oyl/src/state/data.js              (retryFailed/discardFailed passthrough)
apps/vanilla-oyl/src/components/oyl-sync-status.js (failed branch) + test
apps/vanilla-oyl/src/components/oyl-status-panel.js (Retry/Discard) + test
apps/vanilla-oyl/src/main.js                    (panel.sync onRetryFailed/onDiscardFailed)
```
Cache/cursor/conflict/lock logic unchanged. Backward-compatible: with no poison op, `failed` stays 0 and nothing changes.

## Acceptance

`pnpm all-of test` + `typecheck:src` + `pnpm all-of build` green; `pnpm vanilla test` + typecheck green. The poison path is unit-proven (no per-op 4xx exists in the live backend to stage in Chrome); a light real-Chrome confirm: in remote mode everything still syncs normally and `syncState.failed` is 0 (no regression); the chip's `failed` branch + the Status Retry/Discard render given a forced `failed` state (e.g. injecting a failed outbox entry). This is the final SP5 sync-engine piece.
