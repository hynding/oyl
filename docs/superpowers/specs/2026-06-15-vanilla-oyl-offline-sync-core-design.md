# Backend SP5a — Offline-first sync engine (core) — Design

**Status:** approved (decompose SP5; engine-only, no UI; raw cache + outbox + flush/pull, LWW client-wins; R-2–R-12)
**Date:** 2026-06-15
**Packages:** `@oyl/all-of-oyl` (`src/core/` — the engine) + `apps/vanilla-oyl` (wiring)
**Context:** SP4 made vanilla-oyl persist to `apps/strapi-oyl`, but **remote mode is online-first** — every mutation is an immediate network round-trip that fails when offline (the SP4a notice). SP5a makes remote mode **offline-first**: reads/writes hit a local cache instantly (works offline) and sync to the backend through a durable outbox with flush-on-reconnect + boot pull, last-write-wins. **Engine only** — it exposes a `syncState` observable but renders nothing. SP5b (delta pull + richer conflict policy), SP5c (local↔remote migration), SP5d (sync-status UI + multi-tab) follow.

---

## What this is

A `createSyncEngine(...)` in `@oyl/all-of-oyl/src/core` plus two new primitives it composes — a **raw `CacheStore`** and a durable **`Outbox`**. In remote mode the engine produces, per collection, a `Repository<T>` **facade** the existing stores consume unchanged: reads/writes go to the cache immediately; writes also enqueue a sync op; a flush loop pushes to the backend when online and a pull merges the backend back into the cache. Local mode is byte-for-byte unchanged (plain `LocalStorageRepository`).

### The revision model (the crux — R-2)

`LocalStorageRepository.save` **bumps** the revision and **throws `REVISION_CONFLICT`** on mismatch — wrong for a cache, which must mirror the *server's* revision and let pull overwrite it. So the cache is a **raw store that preserves each record's revision**:
- A local edit changes the record's **data** (and `updatedAt`) but **keeps its revision** = the last-known **server base**. So at flush the cache record already carries the revision `decideUpsert` expects → push succeeds in **one** call.
- **Pull/reconcile** writes the server record (its exact revision/tombstone) straight into the cache — impossible through a revision-enforcing `.save()`.
- A genuine concurrent edit (another writer moved the server forward) → real **`409`** → **LWW client-wins**: `remote.get` the current revision, stamp it onto the cache record, re-push. Conflicts now mean *actual* conflicts, not self-inflicted revision drift.

### Decisions (settled)

1. **Engine-only, no UI.** `syncState` is exposed as a framework-free observable; nothing is rendered (SP5d).
2. **Raw `CacheStore`** (R-2): `get`/`list` (hide tombstones unless `includeDeleted`), `getRaw(id)` (engine-internal, includes tombstones), `putRaw(record)`, `removeRaw(id)`. Same on-disk shape + codec as `LocalStorageRepository`, but **no revision bump/check**.
3. **One durable `Outbox`** (a single `oyl/outbox` key), **coalesced per `(collection, id)`** (save-then-save → one save; save-then-delete → delete). **Reference entries** `{ seq, collection, op:'save'|'delete'|'purge', id, enqueuedAt }` carrying a monotonic `seq` (R-14) — the engine reads the *current* cache record at flush, so N offline edits collapse to one push (R-3 note: the backend is a generic *opaque-record* store with no FK enforcement, so cross-collection order is irrelevant — coalescing may reorder freely).
4. **Facade `Repository<T>`** per collection: `get/list` → cache; `save/delete/purge/saveMany` → cache (optimistic) + enqueue + trigger flush; returns the stamped item. **Writes never throw `REVISION_CONFLICT` synchronously** — the relaxed contract. **R-13: `save` takes the base revision (and original `createdAt`) from `cache.getRaw(id)`, NOT from the incoming item's `meta`** (the in-memory aggregate object goes stale after a flush advances the revision; trusting it would make every post-flush edit `409`).
5. **`flush()`** — online, **single-flight**, loop-until-drained, backoff on transport error (R-4): for each op push to `remote`; `save` 409 → client-wins (`remote.get` rev → re-push). **R-15: reconcile advances the cache record's base revision ONLY — it never overwrites local data** (flush is client→server; writing the server result back would clobber a concurrent local edit made during the in-flight request). **R-14: remove the op only if the outbox entry's `seq` is unchanged** since the push began (else a concurrent re-enqueue would be lost — leave it for the next pass). **R-16: a `delete`/`purge` "not found" (404) counts as success** (idempotent; covers created-then-deleted-offline). **Offline is driven by actual flush outcomes**, not only `navigator.onLine` (R-5).
6. **`pull()`** — `remote.list({ includeDeleted: true })` → `putRaw` each into cache, **skipping ids with a pending outbox op** (local edit wins until flushed). Full-list (no cursor — delta is SP5b).
7. **Boot order `flush() → pull()`** then the app re-runs `refresh()` (R-7). Offline at boot → skip both, run from cache; reconnect → flush→pull.
8. **DOM-agnostic seams:** `Connectivity { isOnline(): boolean, subscribe(cb): () => void }`, `StorageLike` (cache + outbox), `now`, and **`timers` (R-17)** are injected — the engine references no Web/DOM globals (the `StorageLike` precedent; the build tsconfig has no DOM/node lib so there is no internal `setTimeout`). If `timers` is omitted, retry falls back to connectivity-event + next-write triggers (no autonomous backoff).
9. **Resume after re-auth** (R-6): a flush auth-error stops the loop (op stays queued) + `syncState.status='error'`; the app wires login-success → `engine.flush()`.
10. **`syncState`** observable: `{ online, pending, status: 'idle'|'syncing'|'offline'|'error', lastError?, lastSyncedAt? }`.

### Out of scope (→ SP5b/c/d)

Delta/cursor pull + richer conflict policy (SP5b). Local↔remote migration / first-sign-in upload of local-only data (SP5c). Sync-status UI, multi-tab propagation, per-action retry affordances (SP5d). `saveMany` relaxes to per-item ops offline — loses *remote* batch atomicity (the app doesn't depend on it); local atomicity is unaffected (R-9).

### Known limitations (documented, not addressed in SP5a)

- **R-18a · `localStorage` quota** — the cache now duplicates all remote data locally (+ outbox); large datasets could hit the ~5–10 MB limit (the Status estimate already surfaces usage). IndexedDB is a future migration.
- **R-18b · Tombstones accumulate** in the cache (as in `LocalStorageRepository`); and a **hard-purge on another device doesn't propagate via pull** (SP5a's pull upserts the server list but doesn't remove cache records absent from it). Both are SP5b/later cleanup.
- **R-18c · Pull is LWW-server-wins for non-pending records** — a remote change overwrites the local cached copy; explicit conflict policy is SP5b.

---

## Architecture

### 1. `@oyl/all-of-oyl/src/core/cache-store.ts` (new)

```ts
export interface CacheStore<T extends { id: Id; meta?: PersistedMeta }> {
  get(id: Id): Promise<T | undefined>                      // hides tombstones
  list(opts?: { includeDeleted?: boolean }): Promise<T[]>  // filters tombstones unless includeDeleted
  getRaw(id: Id): Promise<T | undefined>                   // includes tombstones (engine-internal)
  putRaw(item: T): Promise<void>                           // stores exact item + meta, NO bump/check
  removeRaw(id: Id): Promise<void>                         // hard remove the entry
}
export function createCacheStore<T>(storage: StorageLike, key: string, codec: Codec<T>): CacheStore<T>
```
Reuses the same persisted shape + codec as `LocalStorageRepository` (so the on-disk JSON is identical), minus all revision logic.

### 2. `@oyl/all-of-oyl/src/core/outbox.ts` (new)

```ts
export type OutboxOp = 'save' | 'delete' | 'purge'
export interface OutboxEntry { seq: number; collection: string; op: OutboxOp; id: string; enqueuedAt: string }
export interface Outbox {
  enqueue(collection: string, op: OutboxOp, id: Id): OutboxEntry  // coalesce per (collection,id); assigns a new monotonic seq
  list(): OutboxEntry[]                                            // FIFO snapshot
  removeIfSeq(collection: string, id: Id, seq: number): void      // R-14: drop only if the current entry's seq matches
  has(collection: string, id: Id): boolean                        // pull uses this to skip pending
  size(): number
}
export function createOutbox(storage: StorageLike, key: string, now: () => Date): Outbox
```
Persisted to one `storage` key; coalescing keeps at most one entry per `(collection, id)` (latest op wins, **new `seq`**; save→delete becomes delete). `removeIfSeq` is the compare-and-remove that protects a concurrent re-enqueue (R-14).

### 3. `@oyl/all-of-oyl/src/core/connectivity.ts` (new — types only)

```ts
export interface Connectivity {
  isOnline(): boolean
  subscribe(cb: (online: boolean) => void): () => void  // returns unsubscribe
}
```
No implementation here (the app supplies a `navigator`-based one). A trivial `alwaysOnline`/`alwaysOffline` test double may live alongside for tests.

### 4. `@oyl/all-of-oyl/src/core/sync-engine.ts` (new)

```ts
export interface SyncState { online: boolean; pending: number; status: 'idle'|'syncing'|'offline'|'error'; lastError?: string; lastSyncedAt?: Date }
export interface Observable<T> { get(): T; subscribe(cb: (v: T) => void): () => void }

export function createSyncEngine<…>(deps: {
  collections: Record<string, { cache: CacheStore<any>; remote: Repository<any> }>
  outbox: Outbox
  connectivity: Connectivity
  now: () => Date
  backoff?: (attempt: number) => number   // default exponential, capped
  timers?: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void }  // injectable for tests
}): {
  repositories: Record<string, Repository<any>>  // the per-collection facades
  syncState: Observable<SyncState>
  start(): Promise<void>     // initial flush→pull + subscribe to connectivity
  flush(): Promise<void>
  pull(): Promise<void>
}
```

**Facade** (per collection) implements `Repository<T>`:
- `get/list` → `cache.get/list`.
- `save(item)` → **base from `cache.getRaw(item.id)` (R-13)**: existing → keep its `revision` + original `createdAt`, `updatedAt=now`; new → `revision 1`, `createdAt=updatedAt=now`. Apply the item's *data* → `cache.putRaw` → `outbox.enqueue(name,'save',id)` → trigger flush → return the stamped item.
- `delete(id)` → tombstone in cache (`putRaw` with `deletedAt=now`, keep revision) → `enqueue 'delete'` → trigger flush.
- `purge(id)` → `cache.removeRaw(id)` → `enqueue 'purge'` → trigger flush.
- `saveMany(items)` → per item: stamp (R-13) + `putRaw` + `enqueue 'save'`; return stamped items (R-9).

**`flush()`** — guarded single-flight; if `!connectivity.isOnline()` or already flushing → return. Loop over `outbox.list()` (snapshot each entry's `seq`):
- `save`: `rec = cache.getRaw(id)`; if missing → `removeIfSeq` & continue. `try remote.save(rec)` → on `REVISION_CONFLICT`: `cur = remote.get(id)`; set `rec.meta.revision = cur.meta.revision`; `remote.save(rec)`. **Reconcile (R-15): set the *current* cache record's `meta.revision` to the server's new revision and `putRaw` it — do NOT write the server's data.** Then `removeIfSeq(name,id,seq)` (R-14).
- `delete`: `remote.delete(id)` (404 = success, R-16); `removeIfSeq`.
- `purge`: `remote.purge(id)` (404 = success, R-16); `removeIfSeq`.
- Transport error → `status='offline'`, schedule retry via injected `timers` (backoff), break. Auth error → `status='error'`, `lastError`, break (keep op). On full drain → `status='idle'`, `lastSyncedAt=now`. Re-run if new ops were enqueued during the pass.

**`pull()`** — if offline → return. For each collection: `remote.list({ includeDeleted: true })` → for each server record, if `outbox.has(name,id)` skip; else `cache.putRaw(serverRecord)` (tombstones included, so remote deletions propagate). Update `lastSyncedAt`.

**`start()`** — subscribe to `connectivity` (on `online` → `flush().then(pull)`); run the initial cycle (online → `flush()→pull()`; offline → set `status='offline'`); resolve after it. `syncState.pending` mirrors `outbox.size()`.

### 5. `apps/vanilla-oyl` wiring

- **`storage/keys.js`**: `CACHE_PREFIX='oyl/cache/'` + `cacheKey(name)`, `OUTBOX_KEY='oyl/outbox'`. (Cache is a **separate namespace** from local-mode's `oyl/data/<collection>` — fork D keeps the datasets separate.)
- **`storage/connectivity.js`** (new): `createBrowserConnectivity(window)` → `{ isOnline: () => window.navigator.onLine, subscribe(cb) { on 'online'/'offline' → cb(...) } }`.
- **`storage/bootstrap.js`** — remote branch (`client` truthy): per collection build `cache = createCacheStore(storage, cacheKey(name), codec)` + `remote = createHttpRepository(client, name, codec)`; `outbox = createOutbox(storage, OUTBOX_KEY, now)`; `engine = createSyncEngine({ collections, outbox, connectivity, now })`; return `{ repos: engine.repositories, engine }`. Local branch unchanged (returns `{ repos }`).
- **`state/data.js`** — `createDataState(storage, theme, { client, connectivity })`: holds the `engine` (if remote); exposes `syncState` (or `null` in local) and `startSync()` (= `engine?.start()`).
- **`main.js`** — build `connectivity` (remote only); `createDataState(..., { client, connectivity })`; boot: `await dataState.refresh()` (instant from cache) → `await dataState.startSync()` (flush→pull) → `await dataState.refresh()` (freshen). Wire login-success → `engine.flush()` (R-6) via an effect on `authState.session`.

### Interaction with SP4a's failure surface

In remote mode, writes now succeed against the **cache** (no synchronous throw), and `refresh()` reads the cache (won't fail on transport) — so the SP4a boot try/catch and the `unhandledrejection`→"Sync failed" notice become largely **dormant** in remote mode (sync errors now live in `syncState`, surfaced in SP5d). They stay as a harmless safety net. Local mode is unaffected.

---

## Testing (Vitest)

- **`cache-store.test.ts`**: `putRaw` preserves revision/meta exactly (no bump); `get` hides tombstones, `getRaw` includes them; `list` filters unless `includeDeleted`; `removeRaw`; round-trips via codec; persists to `storage`.
- **`outbox.test.ts`**: enqueue + coalesce per `(collection,id)` (save+save→one; save+delete→delete); `has`/`size`/`remove`; FIFO `list`; survives reload (re-construct over same storage).
- **`sync-engine.test.ts`** (remote = the protocol fake; fake `Connectivity` + injected `now`/`timers`): offline `save` → cache has it + outbox pending + remote empty; `flush` online → remote has it, outbox drained, **cache base revision advanced (data unchanged — R-15)**; **edit-after-flush does NOT `409`** (base read from cache — R-13); concurrent backend edit → `409` → client-wins (remote ends with client data at server rev+1); **a re-edit *during* an in-flight flush is not lost** (`removeIfSeq` keeps the newer op — R-14); offline `delete` → flush → remote tombstoned; **`delete` of a never-synced (404) id succeeds** (R-16); `pull` brings a remote-only record into cache and **skips** a pending-op id; coalescing reduces remote calls; reconnect (`subscribe` fires) triggers flush→pull; `syncState` transitions (offline→syncing→idle, `pending` count). A **relaxed-contract** block on the facade: reads reflect writes; soft-delete hides; `list({includeDeleted})`.
- **`@oyl/all-of-oyl` barrel**: exports `createCacheStore`, `createOutbox`, `createSyncEngine`, and the `Connectivity`/`SyncState`/`Observable` types (NOT a browser connectivity impl).
- **`apps/vanilla-oyl`**: `bootstrap.test.js` — remote `makeRepositories` returns engine-backed facades whose `list`/`save` hit the cache + outbox; `connectivity.test.js` — the navigator impl; `data.test.js` — `createDataState({client, connectivity})` builds the engine and `startSync` runs a flush→pull (stub remote).

## File structure

```
packages/all-of-oyl/src/core/
  cache-store.ts     (new) + cache-store.test.ts
  outbox.ts          (new) + outbox.test.ts
  connectivity.ts    (new — types + test doubles)
  sync-engine.ts     (new) + sync-engine.test.ts
  index.ts           (modify — barrel exports)
apps/vanilla-oyl/src/
  storage/keys.js        (modify — CACHE_PREFIX/cacheKey, OUTBOX_KEY)
  storage/connectivity.js (new) + connectivity.test.js
  storage/bootstrap.js   (modify — remote branch builds the engine; returns { repos, engine })
  state/data.js          (modify — { client, connectivity }; holds engine; syncState + startSync)
  main.js                (modify — connectivity, startSync→refresh, login→flush)
```
Stores, `HttpRepository`, `LocalStorageRepository`, auth, and `apps/strapi-oyl` are all unchanged (only consumed). Local mode is byte-for-byte the prior behavior.

## Acceptance

`pnpm all-of test` + `pnpm vanilla test` + both typechecks + `pnpm all-of build` (no DOM globals) green. Then real-Chrome against the running backend in **remote** mode: with the app loaded, **go offline** (DevTools) → add/edit/delete journal entries → they apply **instantly** and survive a **reload** (served from cache, offline); the `oyl/outbox` key shows pending ops. **Go online** → the outbox drains (verify the records now exist on the backend via a second client / `curl`), `oyl/outbox` empties. A change made directly on the backend appears in the cache after a reconnect **pull**. A concurrent edit resolves client-wins. Ready for SP5b (delta + conflict policy), SP5c (migration), SP5d (status UI + multi-tab).
