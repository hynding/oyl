# Backend SP5b2 — Delta/cursor pull — Design

**Status:** approved (updatedAt cursor; conflict-policy was SP5b; R-1–R-7)
**Date:** 2026-06-15
**Packages:** `apps/strapi-oyl` (backend) + `@oyl/all-of-oyl` (protocol/engine) + `apps/vanilla-oyl` (wiring) + the protocol doc.
**Context:** SP5a's `pull()` re-fetches the **full** record list per collection every boot/reconnect (correct, but wasteful — R-11). SP5b2 makes pull a **delta**: the backend filters by a `?since` cursor over `updatedAt`, and the engine keeps a per-collection high-water mark. Cursor basis = the **server `updatedAt` timestamp** (reuses the existing field; the controller guarantees it advances on every write). Conflict policy was SP5b. Local↔remote migration is SP5c; the sync UI is SP5d.

---

## What this is

Four coordinated changes: (1) the backend guarantees `updatedAt` advances on every write and filters `list` by `?since`; (2) the protocol/`HttpRepository`/port carry an optional `since`; (3) a new `CursorStore` primitive; (4) the engine's `pull()` requests `since=cursor`, merges, and advances the cursor — with a `resync()` escape hatch. Backward-compatible throughout (absent `since` / `cursors` = full list).

### Decisions (settled)

1. **Cursor = server `updatedAt`** (ISO). `>=` comparison + idempotent `putRaw` so a same-millisecond boundary record is re-fetched, never missed.
2. **The controller sets `updatedAt: new Date()` explicitly on every write** (R-1) — create/update/soft-delete/batch — so the cursor field is a guarantee, not a framework assumption. A booted test asserts it strictly advances on update.
3. **Per-collection high-water mark**, persisted (`oyl/sync-cursors`), advanced to `max(updatedAt)` over **all** response records (incl. pending-skipped — they were observed; the queued flush re-asserts them later).
4. **`engine.resync()`** (R-3): clear cursors → full `pull()`. The self-heal seam for the timestamp cursor's one weakness (server-clock regression, R-2) and any cache/cursor drift.
5. **Additive + backward-compatible:** absent `since` = full list; absent `cursors` dep = full-list pull every time (SP5a behavior). The `httpProtocolContract` still passes.

### Out of scope / documented limitations

- **R-2:** a backward server-clock step can drop a delta (a write's `updatedAt` lands below the cursor) — the inherent cost of a timestamp cursor; `resync()` recovers. The rejected sequence approach would avoid it.
- **R-4:** delta shrinks the steady-state pull; the **first / post-long-offline pull is still unpaginated** (SP1's known limit). Pagination is separate/future.
- **R-18b:** hard-purge propagation still unsolved (a purged row vanishes from the delta). Per-user scoping of cache/cursor on logout remains a pre-existing SP5a gap. SP5c (migration) / SP5d (UI) unchanged.

---

## Architecture

### 1. `apps/strapi-oyl` — guarantee `updatedAt` + `?since` filter

In `src/api/oyl-record/controllers/oyl-record.ts`:

- **`list`** — accept `?since`:
  ```ts
  const where: Record<string, unknown> = { owner: { id: owner }, collection }
  if (ctx.query.includeDeleted !== '1') where.deletedAt = null
  if (ctx.query.since) where.updatedAt = { $gte: new Date(String(ctx.query.since)) }   // delta
  const rows = await query().findMany({ where })
  ```
  (R-6: verify the `$gte` operator against a booted `db.query`; adjust if the engine spells it differently. **R-9: no `orderBy`** — the engine computes `max(updatedAt)` itself, so server ordering is unnecessary and avoids any list-order contract concern.)
- **Every write sets `updatedAt`** with a single `const now = new Date()` per handler:
  - `upsert` create: `data: { owner, collection, recordId: id, data, revision: 1, deletedAt: null, createdAt: now, updatedAt: now }`
  - `upsert` update: `data: { data, revision: decision.revision, deletedAt: null, updatedAt: now }`
  - `remove` soft-delete: `data: { deletedAt: now, revision: existing.revision + 1, updatedAt: now }`
  - `batch` create/update: same additions.
- **Conformance unaffected** (R-7): `since`/`orderBy` are additive; the existing `httpProtocolContract` (list with no `since`) still returns the full set. Ensure the contract doesn't assert a list order that `orderBy: asc` would break (it shouldn't — it sorts/keys by id).

### 2. Port + `HttpRepository` — the `since` opt

- `src/core/repository.ts`: `list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]>`.
- `src/core/http-repository.ts` `list`:
  ```ts
  async list(opts) {
    const params: string[] = []
    if (opts?.includeDeleted) params.push('includeDeleted=1')
    if (opts?.since) params.push(`since=${encodeURIComponent(opts.since)}`)
    const res = (await client.request('GET', `${base}${params.length ? '?' + params.join('&') : ''}`)) as { records: RecordEnvelope[] }
    return res.records.map(revive)
  }
  ```
- **R-13 (type ripple):** widen the `list` opts on **`LocalStorageRepository`, `InMemoryRepository`, and `CacheStore`** to `{ includeDeleted?: boolean; since?: string }` and **ignore `since`** (full list) — they implement the updated port (and the facade forwards `opts` to `cache.list`), so their signatures must accept the wider opts even though they don't use it. The engine passes `since` only to the *remote*.

### 3. `src/core/cursor-store.ts` (new)

```ts
export interface CursorStore {
  get(collection: string): string | undefined
  set(collection: string, cursor: string): void
  clear(): void   // drop all cursors (resync escape hatch)
}
export function createCursorStore(storage: StorageLike, key: string): CursorStore
```
One `storage` key holding `{ [collection]: ISO }` (read-modify-write per `set`, like the outbox); `clear` removes the key. Barrel-exported (`createCursorStore`, `type CursorStore`).

### 4. Engine — delta pull + `resync()`

`createSyncEngine` deps gain `cursors?: CursorStore`. `SyncEngine` interface gains `resync(): Promise<void>`.

```ts
async function pull(): Promise<void> {
  if (!connectivity.isOnline()) return
  for (const name of Object.keys(collections)) {
    const { cache, remote } = collections[name]!
    const since = cursors?.get(name)
    let serverRecs: Rec[]
    try {
      serverRecs = (await remote.list({ includeDeleted: true, since })) as Rec[]
    } catch (e) {
      if (errKind(e) === 'transport') { emit({ status: 'offline' }); return }
      throw e
    }
    let max = since
    for (const rec of serverRecs) {
      if (!outbox.has(name, rec.id)) await cache.putRaw(rec)
      const u = rec.meta?.updatedAt?.toISOString()
      if (u && (!max || u >= max)) max = u
    }
    if (cursors && max) cursors.set(name, max)
  }
  emit({ lastSyncedAt: now() })
}

async function resync(): Promise<void> {
  cursors?.clear()      // next pull has no cursor → full list, re-establishing the high-water marks
  await pull()
}
```
(If `cursors` is absent, `pull` passes `since=undefined` → full list — exactly SP5a.)

**Notes:** R-10 — `u >= max` is a *string* compare, valid only because `updatedAt` is always built via `toISOString()` (fixed-width UTC `…Z`, so lexicographic == chronological); don't substitute a non-canonical timestamp. R-11 — the cursor is set **after** the per-collection merge loop, so an interrupted pull (transport mid-collection, or a `putRaw` failure) just re-fetches that delta next time — no partial-cursor-advance data loss (a `putRaw` failure propagates, consistent with SP5a). R-12 (optional) — updating `http-repository-fake.ts` to honor `since` keeps it a faithful backend stand-in (and would let `httpProtocolContract` cover `since`); low priority since the R-8 stub covers the engine test.

### 5. Wiring (`apps/vanilla-oyl`)

- `storage/keys.js`: `export const CURSORS_KEY = 'oyl/sync-cursors'`.
- `storage/bootstrap.js` remote branch: `const cursors = createCursorStore(storage, CURSORS_KEY)` → pass to `createSyncEngine({ …, cursors })`. (Cursor + cache both under `oyl/` → cleared together by Reset.)
- `state/data.js`: optionally expose `resync` (`= () => engine?.resync()`) for SP5d; not required for SP5b2 (no UI).

### 6. Protocol doc

`docs/oyl-sync-protocol-v1.md`: document `GET /:collection?since=<ISO>` → records with `updatedAt >= since`; the server **guarantees `updatedAt` advances on every write**; absent `since` = full list; clients keep a per-collection high-water mark and use `>=` + idempotent merge.

---

## Testing

- **Backend (booted — extend `apps/strapi-oyl/test/conformance.test.ts` or the smoke test):**
  - **R-1:** create a record (capture `updatedAt₁`), then **update** it → `updatedAt₂ > updatedAt₁` (asserts the field advances).
  - **R-5 (delta, flake-free):** full `list()` → `cursor = max(updatedAt)`; update one record; `list({ since: cursor })` **includes** the updated record (and excludes untouched ones whose `updatedAt < cursor`).
  - `httpProtocolContract` still green (R-7).
- **`http-repository.test.ts`:** `list({ includeDeleted: true, since: '2026-…' })` emits `?includeDeleted=1&since=<encoded>` (fake-client assertion); `list()` emits no query.
- **`cursor-store.test.ts` (new):** get/set per collection; persists; `clear()` drops all.
- **`sync-engine.test.ts` (extend) — R-8 recording stub:** the remote must be a small stub that **captures the `since` it was called with** and **filters by it** (`InMemoryRepository` ignores `since`, so it can't verify delta). Cases: first `pull()` (no cursor) → stub called with `since` undefined, full merge, cursor set to `max(updatedAt)`; add a newer remote record → second `pull()` → stub called with `since=<cursor>`, only the new record merges, cursor advances; a pending id is skipped but the cursor still advances; `resync()` clears the cursor → next pull calls the stub with `since` undefined (full) again.

## File structure
```
apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts  (modify: explicit updatedAt on writes + ?since filter) + booted test
packages/all-of-oyl/src/core/repository.ts        (modify: list opts + since)
packages/all-of-oyl/src/core/local-storage-repository.ts  (R-13: widen list opts, ignore since)
packages/all-of-oyl/src/core/in-memory-repository.ts       (R-13: widen list opts, ignore since)
packages/all-of-oyl/src/core/cache-store.ts        (R-13: widen list opts, ignore since)
packages/all-of-oyl/src/core/http-repository.ts    (modify: list passes since) + test
packages/all-of-oyl/src/core/cursor-store.ts       (new) + cursor-store.test.ts
packages/all-of-oyl/src/core/sync-engine.ts        (modify: cursors dep, delta pull, resync) + test
packages/all-of-oyl/src/index.ts                   (barrel: createCursorStore)
apps/vanilla-oyl/src/storage/keys.js               (CURSORS_KEY)
apps/vanilla-oyl/src/storage/bootstrap.js          (build + pass cursors)
docs/oyl-sync-protocol-v1.md                        (document ?since)
```
`CacheStore`/`Outbox`/`Connectivity`/auth/stores untouched (only consumed). Default behavior preserved when `cursors`/`since` are absent.

## Acceptance

`pnpm all-of test` (cursor-store + http-repository + engine delta) + `typecheck:src` + `pnpm all-of build` green; `pnpm strapi-app test` (booted: updatedAt advances + `?since` delta + conformance) green; `pnpm vanilla test` + typecheck green. Then real-Chrome/`curl` against the running backend: after a boot pull establishes the cursor, a subsequent reload's pull issues `GET …?since=<cursor>` and returns only records changed since (verify via the network panel / server logs); a change made on the backend appears after the next pull; `engine.resync()` (or clearing `oyl/sync-cursors`) forces a full pull. Ready for SP5c (migration) and SP5d (sync UI + a resync button).
