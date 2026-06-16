# Backend SP5b2 — Delta/cursor pull — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make `pull()` a delta: the backend guarantees `updatedAt` advances on every write and filters `list` by `?since`; the engine keeps a per-collection `updatedAt` high-water mark (with a `resync()` escape hatch). Backward-compatible (absent `since`/`cursors` = full list).

**Architecture:** Backend (`apps/strapi-oyl` controller) + the `since` opt threaded through the port/adapters/`HttpRepository` + a new `CursorStore` + the engine's delta `pull()`/`resync()` + vanilla wiring + the protocol doc.

**Tech Stack:** Strapi 5 (booted tests); TypeScript (strict, NodeNext, no DOM lib) + Vitest; vanilla JS.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-delta-pull-design.md`

**Gates:** `pnpm --filter @oyl/all-of-oyl test` / `typecheck:src` / `pnpm all-of build`; `pnpm strapi-app test` (booted); `pnpm vanilla test` / typecheck.

---

### Task 1: Backend — guarantee `updatedAt` + `?since` filter

**Files:**
- Modify: `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts`
- Test: `apps/strapi-oyl/test/conformance.test.ts` (extend — reuses the existing boot)

- [ ] **Step 1: Write the failing backend tests.** In `apps/strapi-oyl/test/conformance.test.ts`, add `import { describe, it, expect } from 'vitest'` to the existing vitest import, then append (it reuses the module-level `baseUrl`/`jwt` set in `beforeAll`):

```ts
describe('delta pull (?since)', () => {
  const hdr = () => ({ Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' })
  const put = (id: string, data: unknown, revision: number | null = null) =>
    fetch(`${baseUrl}/v1/entries/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify({ data, revision }) })
  const list = (qs = '') => fetch(`${baseUrl}/v1/entries${qs}`, { headers: hdr() }).then((r) => r.json())

  it('updatedAt advances on update (R-1)', async () => {
    const id = crypto.randomUUID()
    const created = await (await put(id, { v: 1 })).json()
    const updated = await (await put(id, { v: 2 }, created.revision)).json()
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime())
  })

  it('?since with a future timestamp returns nothing (the filter works)', async () => {
    await put(crypto.randomUUID(), { v: 1 })
    const future = new Date(Date.now() + 60_000).toISOString()
    const res = await list(`?since=${encodeURIComponent(future)}&includeDeleted=1`)
    expect(res.records.length).toBe(0)
  })

  it('?since=cursor includes a record updated after the cursor (R-5)', async () => {
    const id = crypto.randomUUID()
    const created = await (await put(id, { v: 1 })).json()
    const full = await list('?includeDeleted=1')
    const cursor = full.records.map((r: any) => r.updatedAt).sort().at(-1) as string
    await put(id, { v: 2 }, created.revision) // update → updatedAt advances
    const delta = await list(`?since=${encodeURIComponent(cursor)}&includeDeleted=1`)
    expect(delta.records.find((r: any) => r.id === id)?.data?.v).toBe(2)
  })
})
```

- [ ] **Step 2: Run — confirm FAIL** (no `?since` filter; `updatedAt` may not advance):
`pnpm --filter @oyl/strapi-oyl-app test` (boots Strapi; slow)

- [ ] **Step 3: Implement** in `apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts`:

3a. `list` — add the `since` filter (no `orderBy` — R-9):
```ts
    async list(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection } = ctx.params
      const where: Record<string, unknown> = { owner: { id: owner }, collection }
      if (ctx.query.includeDeleted !== '1') where.deletedAt = null
      if (ctx.query.since) where.updatedAt = { $gte: new Date(String(ctx.query.since)) }
      const rows = (await query().findMany({ where })) as unknown as RecordRow[]
      ctx.body = { records: rows.map(toEnvelope) }
    },
```
(R-6: if a booted run shows `$gte` isn't the operator the query engine expects, adjust to the correct spelling.)

3b. `upsert` — set timestamps explicitly (`const now` at the top of the handler):
```ts
    async upsert(ctx: any) {
      const owner = ctx.state.user?.id
      if (owner == null) return ctx.unauthorized()
      const { collection, id } = ctx.params
      const { data, revision } = (ctx.request.body ?? {}) as { data?: unknown; revision?: number | null }
      const existing = await findRow(owner, collection, id)
      const decision = decideUpsert(existing ? { revision: existing.revision } : undefined, revision ?? null)
      if (decision.action === 'conflict') {
        ctx.status = 409
        ctx.body = { error: { code: 'REVISION_CONFLICT', message: `stale revision for ${collection}/${id}` } }
        return
      }
      const now = new Date()
      const saved =
        decision.action === 'create'
          ? await query().create({ data: { owner: owner, collection, recordId: id, data: data as any, revision: 1, deletedAt: null, createdAt: now, updatedAt: now } })
          : await query().update({ where: { id: existing!.id }, data: { data: data as any, revision: decision.revision, deletedAt: null, updatedAt: now } })
      ctx.body = toEnvelope(saved as unknown as RecordRow)
    },
```

3c. `remove` soft-delete — add `updatedAt`:
```ts
      } else if (!existing.deletedAt) {
        await query().update({ where: { id: existing.id }, data: { deletedAt: new Date(), revision: existing.revision + 1, updatedAt: new Date() } })
      }
```
(or hoist a single `const now = new Date()` and use it for both `deletedAt` and `updatedAt`.)

3d. `batch` — add `updatedAt: now` to both the create and update `data` (hoist `const now = new Date()` before the apply loop):
```ts
      const now = new Date()
      const records: ReturnType<typeof toEnvelope>[] = []
      for (const { item, existingId, revision } of plans) {
        const saved =
          existingId == null
            ? await query().create({ data: { owner: owner, collection, recordId: item.id, data: item.data as any, revision: 1, deletedAt: null, createdAt: now, updatedAt: now } })
            : await query().update({ where: { id: existingId }, data: { data: item.data as any, revision, deletedAt: null, updatedAt: now } })
        records.push(toEnvelope(saved as unknown as RecordRow))
      }
```

- [ ] **Step 4: Run — PASS** (the 3 new tests + the existing conformance contract still green):
`pnpm --filter @oyl/strapi-oyl-app test`

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/strapi-oyl/src/api/oyl-record/controllers/oyl-record.ts apps/strapi-oyl/test/conformance.test.ts
git commit -m "feat(strapi-oyl): guarantee updatedAt on every write + ?since delta filter on list"
```

---

### Task 2: Thread `since` through the port, adapters, and HttpRepository

**Files:**
- Modify: `packages/all-of-oyl/src/core/repository.ts`, `in-memory-repository.ts`, `local-storage-repository.ts`, `cache-store.ts`, `http-repository.ts`
- Test: `packages/all-of-oyl/src/core/http-repository.test.ts` (extend)

- [ ] **Step 1: Write the failing test.** In `http-repository.test.ts`, add a case (reuse the file's existing fake-client + codec helpers — read the file first to match its pattern):

```ts
it('list passes since + includeDeleted as query params', async () => {
  let captured = ''
  const client = { request: async (_m: string, path: string) => { captured = path; return { records: [] } } }
  const repo = createHttpRepository(client as any, 'entries', codec as any)
  await repo.list({ includeDeleted: true, since: '2026-06-15T12:00:00.000Z' })
  expect(captured).toBe('/entries?includeDeleted=1&since=2026-06-15T12%3A00%3A00.000Z')
  await repo.list()
  expect(captured).toBe('/entries')
})
```
(If the file already defines a fake-client/codec helper, use it instead of the inline `client`/`codec` above.)

- [ ] **Step 2: Run — FAIL** (since not in the query):
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.test.ts`

- [ ] **Step 3: Implement.**

3a. **Port** `repository.ts` line ~12:
```ts
  list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]>
```

3b. **`in-memory-repository.ts`** + **`local-storage-repository.ts`** — widen the `list` signature (ignore `since`):
```ts
  async list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]> {
```
(body unchanged — `since` is ignored.)

3c. **`cache-store.ts`** — widen both the interface (line ~19) and the impl (line ~45):
```ts
  list(opts?: { includeDeleted?: boolean; since?: string }): Promise<T[]>   // interface
```
```ts
    async list(opts) {   // impl unchanged; opts now typed wider via the interface
```

3d. **`http-repository.ts`** `list` — build the query from both flags:
```ts
    async list(opts) {
      const params: string[] = []
      if (opts?.includeDeleted) params.push('includeDeleted=1')
      if (opts?.since) params.push(`since=${encodeURIComponent(opts.since)}`)
      const res = (await client.request('GET', `${base}${params.length ? '?' + params.join('&') : ''}`)) as { records: RecordEnvelope[] }
      return res.records.map(revive)
    },
```

- [ ] **Step 4: Verify**
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/http-repository.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
```
All green (the widened signatures must satisfy the port across all implementers).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/repository.ts packages/all-of-oyl/src/core/in-memory-repository.ts packages/all-of-oyl/src/core/local-storage-repository.ts packages/all-of-oyl/src/core/cache-store.ts packages/all-of-oyl/src/core/http-repository.ts packages/all-of-oyl/src/core/http-repository.test.ts
git commit -m "feat(all-of-oyl): thread list({since}) through the port, adapters, and HttpRepository"
```

---

### Task 3: `CursorStore`

**Files:**
- Create: `packages/all-of-oyl/src/core/cursor-store.ts` + `cursor-store.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Failing test** `packages/all-of-oyl/src/core/cursor-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createCursorStore } from './cursor-store.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike { let v: string | null = null; return { getItem: () => v, setItem: (_k, val) => { v = val } } }

describe('createCursorStore', () => {
  let storage: StorageLike
  beforeEach(() => { storage = mem() })

  it('get/set per collection, persists across instances, and clear drops all', () => {
    const c = createCursorStore(storage, 'oyl/sync-cursors')
    expect(c.get('entries')).toBeUndefined()
    c.set('entries', '2026-01-01T00:00:00.000Z')
    c.set('plans', '2026-02-01T00:00:00.000Z')
    expect(c.get('entries')).toBe('2026-01-01T00:00:00.000Z')
    const c2 = createCursorStore(storage, 'oyl/sync-cursors')
    expect(c2.get('plans')).toBe('2026-02-01T00:00:00.000Z')
    c2.clear()
    expect(createCursorStore(storage, 'oyl/sync-cursors').get('entries')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `packages/all-of-oyl/src/core/cursor-store.ts`:
```ts
import { DomainError } from './domain-error.js'
import type { StorageLike } from './local-storage-repository.js'

/** Per-collection delta high-water marks (ISO updatedAt), persisted to one storage key. */
export interface CursorStore {
  get(collection: string): string | undefined
  set(collection: string, cursor: string): void
  clear(): void
}

export function createCursorStore(storage: StorageLike, key: string): CursorStore {
  function read(): Record<string, string> {
    const raw = storage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new DomainError('MALFORMED_JSON', `${key} is not an object`)
    }
    return parsed as Record<string, string>
  }
  return {
    get(collection) {
      return read()[collection]
    },
    set(collection, cursor) {
      const all = read()
      all[collection] = cursor
      storage.setItem(key, JSON.stringify(all))
    },
    clear() {
      storage.setItem(key, JSON.stringify({}))
    },
  }
}
```
(`StorageLike` has no `removeItem`, so `clear()` writes `{}` — `get` returns `undefined` for any collection.)

- [ ] **Step 4: Barrel** — add to `packages/all-of-oyl/src/index.ts` (near the outbox export):
```ts
export { createCursorStore, type CursorStore } from './core/cursor-store.js'
```

- [ ] **Step 5: Verify** + commit:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/cursor-store.test.ts
pnpm --filter @oyl/all-of-oyl typecheck:src
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/cursor-store.ts packages/all-of-oyl/src/core/cursor-store.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): CursorStore — persisted per-collection delta high-water marks"
```

---

### Task 4: Engine — delta `pull()` + `resync()`

**Files:**
- Modify: `packages/all-of-oyl/src/core/sync-engine.ts`
- Test: `packages/all-of-oyl/src/core/sync-engine.test.ts` (extend)

- [ ] **Step 1: Write the failing test.** Add `createCursorStore` to the imports, then append (R-8 recording stub + an advancing clock so `updatedAt` differs):

```ts
import { createCursorStore } from './cursor-store.js'

/** A remote that records the `since` it was called with and filters by it (InMemory ignores since). */
function recordingRemote(inner: any) {
  const sinceCalls: (string | undefined)[] = []
  return {
    sinceCalls,
    get: (id: any) => inner.get(id),
    save: (item: any) => inner.save(item),
    delete: (id: any) => inner.delete(id),
    purge: (id: any) => inner.purge(id),
    saveMany: (items: any) => inner.saveMany(items),
    async list(opts: any) {
      sinceCalls.push(opts?.since)
      const all = (await inner.list({ includeDeleted: true })) as any[]
      return opts?.since ? all.filter((r) => r.meta?.updatedAt?.toISOString() >= opts.since) : all
    },
  }
}

describe('createSyncEngine — delta pull', () => {
  it('first pull full + sets cursor; later pulls send since=cursor; resync forces full', async () => {
    let t = Date.parse('2026-06-15T12:00:00.000Z')
    const clock = () => new Date(t)
    const storage = mem()
    const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
    const inner = new InMemoryRepository(clock)
    const remote = recordingRemote(inner)
    const outbox = createOutbox(storage, 'oyl/outbox', clock)
    const cursors = createCursorStore(storage, 'oyl/sync-cursors')
    const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: manualConnectivity(true), now: clock, cursors })

    await inner.save(area('A', 'a'))      // a "server" record at 12:00:00
    await engine.pull()
    expect(remote.sinceCalls[0]).toBeUndefined()
    expect((await cache.list()).length).toBe(1)

    t = Date.parse('2026-06-15T12:00:05.000Z')
    await inner.save(area('B', 'b'))      // newer server record
    await engine.pull()
    expect(remote.sinceCalls[1]).toBe('2026-06-15T12:00:00.000Z') // since = the cursor from pull 1
    expect((await cache.list()).length).toBe(2)

    await engine.resync()
    expect(remote.sinceCalls[2]).toBeUndefined()  // cursor cleared → full pull
  })
})
```

- [ ] **Step 2: Run — FAIL** (`cursors` not a dep; `resync` missing; pull ignores cursor).

- [ ] **Step 3: Implement** in `sync-engine.ts`:

3a. Add `cursors?: CursorStore` to the `createSyncEngine` deps type; import the type:
```ts
import type { CursorStore } from './cursor-store.js'
```
and destructure: `const { collections, outbox, connectivity, now, timers, cursors } = deps` (add `cursors`).

3b. `SyncEngine` interface — add `resync(): Promise<void>`.

3c. Replace `pull()` with the delta version:
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
    cursors?.clear()
    await pull()
  }
```

3d. Add `resync` to the returned object: `return { repositories, syncState, start, flush, pull, resync }`.

- [ ] **Step 4: Verify**
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
```
All green (existing engine tests — which pass no `cursors` — still full-list-pull correctly).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts
git commit -m "feat(all-of-oyl): delta pull via CursorStore high-water mark + engine.resync()"
```

---

### Task 5: Wiring + protocol doc

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/keys.js`, `apps/vanilla-oyl/src/storage/bootstrap.js`, `docs/oyl-sync-protocol-v1.md`

- [ ] **Step 1: keys** — add to `apps/vanilla-oyl/src/storage/keys.js` (near `OUTBOX_KEY`):
```js
export const CURSORS_KEY = 'oyl/sync-cursors'
```

- [ ] **Step 2: bootstrap** — in `apps/vanilla-oyl/src/storage/bootstrap.js`, import `createCursorStore` (add to the `@oyl/all-of-oyl` import) + `CURSORS_KEY` (from `./keys.js`); in the remote branch build the cursor store and pass it:
```js
const outbox = createOutbox(storage, OUTBOX_KEY, now)
const cursors = createCursorStore(storage, CURSORS_KEY)
const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
const engine = createSyncEngine({ collections, outbox, connectivity: opts.connectivity ?? alwaysOnline(), now, timers, cursors })
```

- [ ] **Step 3: protocol doc** — in `docs/oyl-sync-protocol-v1.md`, document the list query: `GET /:collection?since=<ISO>` returns records with `updatedAt >= since`; the server guarantees `updatedAt` advances on every write; absent `since` = full list; clients keep a per-collection high-water mark and use `>=` + idempotent merge. (Add to the list-endpoint section; keep the existing doc's style.)

- [ ] **Step 4: Verify** (no behavior change in tests; the engine now gets a cursor store):
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Green (279).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/bootstrap.js docs/oyl-sync-protocol-v1.md
git commit -m "feat(vanilla-oyl): wire CursorStore into the sync engine (delta pull) + document ?since"
```

---

### Task 6: Real-Chrome / curl acceptance

**Files:** none. Needs the backend + app running (native `pnpm strapi-app develop` :1340 + `pnpm vanilla dev` :8041, or the compose stack). If servers/Docker aren't available, **STOP and report** — Tasks 1–5 are the deliverable.

- [ ] **Step 1:** Start the backend + app; in Chrome at `:8041`, Status → Connection → remote → `http://localhost:1340/api` → Apply; register/sign in.
- [ ] **Step 2 (cursor established):** add a journal entry (it flushes), then reload. Inspect `localStorage['oyl/sync-cursors']` — it has a per-collection ISO cursor.
- [ ] **Step 3 (delta on next pull):** with the network panel open (or strapi logs), reload again → the pull issues `GET …/v1/entries?since=<cursor>&includeDeleted=1` (delta), not a bare full list.
- [ ] **Step 4 (pull merges a server change):** PUT a record directly to the backend (with the JWT, as in the SP5a acceptance) → reload → it appears (pulled via the delta because its `updatedAt > cursor`).
- [ ] **Step 5 (resync):** clear `localStorage['oyl/sync-cursors']` (or call `dataState`'s engine resync if exposed) → reload → the next pull is a full list again. Report outcomes; stop servers.

---

## Notes for the implementer

- `src/` rules: explicit `.js` imports; no DOM/node globals; `pnpm all-of build` is the DOM gate.
- The `since` opt is **ignored** by the local adapters (in-memory/local-storage/cache-store) — widen their signatures only (R-13); the engine passes `since` only to the *remote*.
- No `orderBy` in the backend `list` (R-9) — the engine computes the max itself.
- The cursor compare (`u >= max`) is a string compare valid only for canonical `toISOString()` values (R-10) — don't substitute another timestamp source.
- Existing engine tests pass no `cursors` → full-list pull (SP5a behavior) must stay green.
