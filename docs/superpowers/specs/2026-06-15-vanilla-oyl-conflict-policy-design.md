# Backend SP5b — Explicit conflict policy (sync engine) — Design

**Status:** approved (conflict-policy-first; client-wins default + record; configurable; R-1–R-8)
**Date:** 2026-06-15
**Package:** `@oyl/all-of-oyl` (`src/core/sync-engine.ts` + the `SyncState` type). No app behavior change by default.
**Context:** SP5a's flush resolves a `409` implicitly client-wins (`remote.get` the server revision → re-push). SP5b makes resolution an **explicit, configurable policy** (`'client-wins'` default | `'server-wins'`), **records conflicts in `syncState`** (count + last) for SP5d to surface, and fixes a latent SP5a bug: `remote.get` can't see tombstones, so a conflict where the *other* device **deleted** the record errored out. Engine-only — no UI. Delta/cursor pull is **SP5b2**; the conflict-resolution UI + multi-tab is **SP5d**.

---

## What this is

A `conflictPolicy` option on `createSyncEngine`, a `resolveConflict` helper that drives both policies against the **deleted-inclusive** current server state, conflict accounting in `syncState`, and a bounded retry so a hammering concurrent writer never costs a queued write. Conflicts are **`save`-only** — the protocol's `DELETE` asserts no revision (`decideUpsert` is PUT-only), so `delete`/`purge` can't `409`.

### Decisions (settled)

1. **`conflictPolicy?: 'client-wins' | 'server-wins'`** on the engine deps; default `'client-wins'` (preserves current behavior). Governs **flush only** (R-5).
2. **Client-wins:** stamp the local record with the current server revision and re-push (your edit wins; resurrects a server-deleted record — see R-4). **Server-wins:** adopt the server's record into the cache and drop the op (your offline edit is discarded, only recorded).
3. **Record every *resolved* conflict** in `syncState`: `conflicts` (session counter) + `lastConflict { collection, id, at }`. Counted **once per successful resolution**, not per `409` (R-2). No durable conflict log (the rejected "preserve both" option).
4. **R-4 (deleted-inclusive resolution):** resolve against the real current server state — `remote.get(id)`; if `undefined`, fall back to `remote.list({ includeDeleted: true })` (affected collection) to find the tombstone. Handles **live / tombstone / purged** uniformly for both policies.
5. **R-1 (bounded retry, no loss):** if a client-wins re-push itself `409`s, re-resolve up to `MAX_CONFLICT_RETRIES` (3); on exhaustion, **leave the op queued** + `scheduleRetry()` (never drop it or hard-error).
6. **R-8:** extract `resolveConflict(...)` + an `advanceBaseRevision(...)` helper (the latter is the SP5a R-15 reconcile, reused by the normal-save and client-wins paths).

### Out of scope (→ SP5b2 / SP5d)

Delta/cursor pull (**SP5b2**). The conflict-resolution UI + re-hydrating affected stores on conflict + multi-tab + a localStorage policy setting (**SP5d**). A durable conflict log / manual merge; timestamp-LWW (both rejected).

---

## Architecture — `src/core/sync-engine.ts`

### 1. `SyncState` + engine option
```ts
export interface SyncState {
  online: boolean
  pending: number
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastError?: string
  lastSyncedAt?: Date
  conflicts: number                                              // NEW — session count of resolved conflicts
  lastConflict?: { collection: string; id: string; at: Date }    // NEW
}
```
Initial state gains `conflicts: 0`. `createSyncEngine` deps gain `conflictPolicy?: 'client-wins' | 'server-wins'`; `const policy = deps.conflictPolicy ?? 'client-wins'`. `const MAX_CONFLICT_RETRIES = 3`.

`recordConflict(collection, id)` → `emit({ conflicts: state.conflicts + 1, lastConflict: { collection, id, at: now() } })`. (`emit` already spreads the patch over `state`, so `conflicts` persists across other emits.)

### 2. Helpers
```ts
// SP5a R-15 reconcile, extracted — advance the cache record's base revision only (never overwrite data).
async function advanceBaseRevision(cache, id, saved): Promise<void> {
  const current = await cache.getRaw(id)
  if (current?.meta && saved?.meta) { current.meta = { ...current.meta, revision: saved.meta.revision }; await cache.putRaw(current) }
}

// Deleted-inclusive read (R-4): get hides tombstones, so fall back to list.
async function currentServerRecord(remote, id): Promise<Rec | undefined> {
  const got = await remote.get(id)
  if (got) return got
  const all = (await remote.list({ includeDeleted: true })) as Rec[]
  return all.find((r) => r.id === id)   // tombstone, or undefined if hard-purged
}

/** Apply the policy to a flush save conflict. Returns true if resolved (op may be removed), false to retry later. */
async function resolveConflict(coll, collection, id, localRec): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    const cur = await currentServerRecord(coll.remote, id)   // live | tombstone | undefined(purged)
    if (policy === 'server-wins') {
      if (cur) await coll.cache.putRaw(cur)                   // adopt server (live or tombstone)
      else await coll.cache.removeRaw(id)                     // purged on the server
      recordConflict(collection, id)
      return true
    }
    // client-wins: re-push local data over the current revision (purged → cur undefined → server re-creates)
    if (cur?.meta) localRec.meta = { ...localRec.meta, revision: cur.meta.revision }
    try {
      const saved = await coll.remote.save(localRec)
      await advanceBaseRevision(coll.cache, id, saved)
      recordConflict(collection, id)
      return true
    } catch (e) {
      if (!isConflict(e)) throw e                             // non-conflict → bubble to flush's error handling
      // a second concurrent write raced us; loop to re-fetch + retry
    }
  }
  return false                                               // exhausted — leave the op queued
}
```
(For client-wins over a **tombstone**, the re-push hits the controller's PUT-update path which sets `deletedAt: null` → the record is **resurrected** with the client's data — the correct meaning of "client wins". The `cur === undefined` (**hard-purged**) branch is only a rare 409-then-purged race: a plain edit-after-purge isn't a conflict at all, since the PUT hits an unknown id → *create*, no 409.)

### 3. Flush `save` branch (replace the SP5a conflict block, lines ~104–120)
```ts
if (entry.op === 'save') {
  const rec = (await cache.getRaw(id)) as Rec | undefined
  if (!rec) { outbox.removeIfSeq(entry.collection, id, entry.seq); continue }
  try {
    const saved = await remote.save(rec)
    await advanceBaseRevision(cache, id, saved)              // normal path (R-15)
  } catch (e) {
    if (!isConflict(e)) throw e
    const resolved = await resolveConflict(coll, entry.collection, id, rec)
    if (!resolved) { scheduleRetry(); emit({ status: 'syncing' }); return }   // R-1: keep the op, try later
  }
  outbox.removeIfSeq(entry.collection, id, entry.seq)
}
```
`delete`/`purge` branches are unchanged (idempotent, no conflict). The outer `catch` (auth/transport/other) is unchanged.

### 4. App wiring — none required
`bootstrap.js` keeps building the engine with the default policy, so behavior is unchanged; the enriched `syncState` (`conflicts`/`lastConflict`) already flows through `dataState.syncState` to SP5d. Optionally pass an explicit `conflictPolicy: 'client-wins'` for clarity. The policy's config seam (a localStorage setting + Connection UI) is **SP5d**.

### Notes / known limitations
- **R-3:** `server-wins` updates the **cache** but not the live in-memory aggregate, so a discarded local edit lingers on screen until a `refresh()`. SP5d should re-hydrate affected stores when `conflicts` changes. `client-wins` has no divergence (the cache keeps the client's data).
- **R-5:** the policy governs **flush** only; **pull** is unaffected (it skips pending-op ids; non-pending records have no local divergence — the R-18c "pull overwrites non-pending with server" behavior stands).
- **R-6:** `conflicts` is **session-scoped** (resets on load) — sufficient for SP5d's "N remote changes were overwritten."

---

## Testing (`sync-engine.test.ts`, extend) — R-7

The existing `InMemoryRepository` won't `409` on a matching revision, so use a **conflicting-remote stub** that wraps it and forces a one-time mismatch (or delete/purge) behind the engine's back. Cases:

- **client-wins (default):** seed + flush; the stub bumps the server revision behind us; local edit + flush → server ends with **client data**, `syncState.conflicts === 1`, `lastConflict` set, outbox drained.
- **client-wins over a server *tombstone* (R-4):** the other side deleted the record (so `remote.get` → undefined); local edit + flush → the record is **resurrected** with client data; `conflicts === 1`. (This is the SP5a bug that previously errored.)
- **server-wins:** same conflict with `conflictPolicy: 'server-wins'` → cache ends with **server data** (or removed if the server tombstoned/purged), the op is dropped, `conflicts === 1`.
- **bounded retry (R-1):** a stub that `409`s on every re-push → after the bound the op **remains queued** and `status` is not a hard `error` (a retry is scheduled).
- **no conflict:** a normal flush leaves `conflicts === 0`.
- **counting (R-2):** a conflict resolved across a retry increments `conflicts` exactly once.

## File structure
```
packages/all-of-oyl/src/core/sync-engine.ts   (modify: conflictPolicy, SyncState fields, resolveConflict + helpers, flush save branch)
packages/all-of-oyl/src/core/sync-engine.test.ts (extend: conflicting-remote stub + the cases above)
```
No `CacheStore`/`Outbox`/`Connectivity`/app changes. `pnpm all-of build` (DOM-free) + `typecheck:src` must stay green.

## Acceptance

`pnpm all-of test` (the new conflict cases) + `typecheck:src` + `pnpm all-of build` green; `pnpm vanilla test` + typecheck unaffected (default policy unchanged). Conflicts are hard to stage by hand, so the unit suite (with the conflicting-remote stub) is the primary acceptance; an optional manual check is two browser profiles editing the same record (one offline) then reconnecting → the offline editor's change wins by default and `syncState.conflicts` increments. Ready for SP5b2 (delta pull) and SP5d (conflict UI + re-hydrate on conflict).
