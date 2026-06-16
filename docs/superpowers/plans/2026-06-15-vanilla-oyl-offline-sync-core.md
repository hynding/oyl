# Backend SP5a — Offline-first sync engine (core) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline-first sync engine in `@oyl/all-of-oyl/src/core` (a raw `CacheStore`, a durable `Outbox`, a `Connectivity` seam, and `createSyncEngine`) that, in vanilla-oyl's remote mode, reads/writes a local cache instantly and syncs to the backend via flush-on-reconnect + boot pull (last-write-wins, client-wins). Engine only — exposes a `syncState` observable, renders nothing.

**Architecture:** Per collection the engine produces a `Repository<T>` facade the existing stores consume unchanged: reads → cache; writes → cache (optimistic) + outbox enqueue + flush trigger. Flush pushes to the remote (client-wins on 409) and **advances the cache base revision only** (never overwrites local data). Pull merges the remote into the cache for non-pending records. All Web/DOM access is injected.

**Tech Stack:** TypeScript (strict, NodeNext, explicit `.js` imports) for `src/`; Vitest. Vanilla JS + JSDoc for the app wiring; Vitest (happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-offline-sync-core-design.md`

**Conventions (verified):**
- `src/` is strict + NodeNext: **every relative import needs an explicit `.js` extension**; `noUnusedLocals`/`noUnusedParameters` are on. The build tsconfig has **no DOM/node lib** — never reference `setTimeout`/`localStorage`/`fetch`/`window` in `src/` (inject them).
- `StorageLike` (`{ getItem, setItem }`) is exported from `core/local-storage-repository.js`. Codec shape is `{ toJSON(item): unknown; fromJSON(shape): T }` (see `LocalStorageRepository`).
- `DomainError('REVISION_CONFLICT', …)` is how a stale save surfaces (from `InMemoryRepository`/`LocalStorageRepository`, and `HttpRepository` maps 409 → the same).
- Run one all-of test file: `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/<file>.test.ts`. Strict src typecheck: `pnpm --filter @oyl/all-of-oyl typecheck:src`. Build: `pnpm all-of build`.

---

### Task 1: `CacheStore` (raw, revision-preserving)

**Files:**
- Create: `packages/all-of-oyl/src/core/cache-store.ts`
- Test: `packages/all-of-oyl/src/core/cache-store.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (barrel)

- [ ] **Step 1: Write the failing test** `packages/all-of-oyl/src/core/cache-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createCacheStore } from './cache-store.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike & { dump(): string | null } {
  let v: string | null = null
  return { getItem: () => v, setItem: (_k, val) => { v = val }, dump: () => v }
}
const codec = COLLECTIONS.lifeAreas as any

/** A LifeArea carrying explicit meta (revision preserved, not bumped). */
function area(rev: number, deleted = false) {
  const a = new LifeArea({ name: 'Health', slug: 'health' })
  a.meta = { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), revision: rev, ...(deleted ? { deletedAt: new Date('2026-01-03') } : {}) }
  return a
}

describe('createCacheStore', () => {
  /** @type {ReturnType<typeof mem>} */
  let storage: ReturnType<typeof mem>
  beforeEach(() => { storage = mem() })

  it('putRaw preserves revision and meta exactly (no bump)', async () => {
    const c = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
    const a = area(7)
    await c.putRaw(a)
    const got = await c.getRaw(a.id)
    expect(got?.meta?.revision).toBe(7)
    expect(got?.meta?.createdAt.toISOString()).toBe(new Date('2026-01-01').toISOString())
    // a second putRaw with a different revision overwrites, still no bump
    a.meta = { ...a.meta!, revision: 9 }
    await c.putRaw(a)
    expect((await c.getRaw(a.id))?.meta?.revision).toBe(9)
  })

  it('get hides tombstones; getRaw includes them; list filters', async () => {
    const c = createCacheStore(storage, 'k', codec)
    const live = area(1)
    const dead = area(2, true)
    await c.putRaw(live)
    await c.putRaw(dead)
    expect(await c.get(dead.id)).toBeUndefined()
    expect(await c.getRaw(dead.id)).toBeTruthy()
    expect((await c.list()).map((i) => i.id)).toEqual([live.id])
    expect((await c.list({ includeDeleted: true })).length).toBe(2)
  })

  it('removeRaw hard-removes', async () => {
    const c = createCacheStore(storage, 'k', codec)
    const a = area(1)
    await c.putRaw(a)
    await c.removeRaw(a.id)
    expect(await c.getRaw(a.id)).toBeUndefined()
  })

  it('persists via storage (a fresh instance over the same key sees the data)', async () => {
    const a = area(3)
    await createCacheStore(storage, 'k', codec).putRaw(a)
    const c2 = createCacheStore(storage, 'k', codec)
    expect((await c2.getRaw(a.id))?.meta?.revision).toBe(3)
  })
})
```

- [ ] **Step 2: Run it — FAIL** (`./cache-store.js` missing):
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/cache-store.test.ts`

- [ ] **Step 3: Implement** `packages/all-of-oyl/src/core/cache-store.ts`:

```ts
import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { StorageLike } from './local-storage-repository.js'

interface Codec<T> {
  toJSON(item: T): unknown
  fromJSON(shape: unknown): T
}

/**
 * A raw, revision-PRESERVING record store for the offline cache. Unlike
 * LocalStorageRepository it never bumps or checks revision: putRaw stores the
 * item's meta verbatim (so it can mirror the server's revision and be overwritten
 * by pull), and getRaw exposes tombstones for the sync engine. One per collection.
 */
export interface CacheStore<T extends { id: Id; meta?: PersistedMeta }> {
  get(id: Id): Promise<T | undefined>
  list(opts?: { includeDeleted?: boolean }): Promise<T[]>
  getRaw(id: Id): Promise<T | undefined>
  putRaw(item: T): Promise<void>
  removeRaw(id: Id): Promise<void>
}

export function createCacheStore<T extends { id: Id; meta?: PersistedMeta }>(
  storage: StorageLike,
  key: string,
  codec: Codec<T>,
): CacheStore<T> {
  function readAll(): T[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${key} is not an array`)
    return parsed.map((s) => codec.fromJSON(s))
  }
  function writeAll(items: T[]): void {
    storage.setItem(key, JSON.stringify(items.map((i) => codec.toJSON(i))))
  }
  return {
    async get(id) {
      const f = readAll().find((i) => i.id === id)
      return !f || f.meta?.deletedAt ? undefined : f
    },
    async list(opts) {
      const all = readAll()
      return opts?.includeDeleted ? all : all.filter((i) => !i.meta?.deletedAt)
    },
    async getRaw(id) {
      return readAll().find((i) => i.id === id)
    },
    async putRaw(item) {
      const all = readAll()
      const idx = all.findIndex((i) => i.id === item.id)
      if (idx === -1) all.push(item)
      else all[idx] = item
      writeAll(all)
    },
    async removeRaw(id) {
      const all = readAll()
      const next = all.filter((i) => i.id !== id)
      if (next.length !== all.length) writeAll(next)
    },
  }
}
```

- [ ] **Step 4: Barrel** — add to `packages/all-of-oyl/src/index.ts` after the `LocalStorageRepository` export line:

```ts
export { createCacheStore, type CacheStore } from './core/cache-store.js'
```

- [ ] **Step 5: Run — PASS** + strict src typecheck:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/cache-store.test.ts
pnpm --filter @oyl/all-of-oyl typecheck:src
```

- [ ] **Step 6: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/cache-store.ts packages/all-of-oyl/src/core/cache-store.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): CacheStore — raw revision-preserving record store for the offline cache"
```

---

### Task 2: `Outbox` (durable, coalescing, seq compare-and-remove)

**Files:**
- Create: `packages/all-of-oyl/src/core/outbox.ts`
- Test: `packages/all-of-oyl/src/core/outbox.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/all-of-oyl/src/core/outbox.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createOutbox } from './outbox.js'
import type { StorageLike } from './local-storage-repository.js'
import { Id } from './id.js'

function mem(): StorageLike { let v: string | null = null; return { getItem: () => v, setItem: (_k, val) => { v = val } } }
const at = () => new Date('2026-06-15T00:00:00Z')
const A = '11111111-1111-4111-8111-111111111111' as unknown as Id
const B = '22222222-2222-4222-8222-222222222222' as unknown as Id

describe('createOutbox', () => {
  let storage: StorageLike
  beforeEach(() => { storage = mem() })

  it('enqueues, counts, and lists FIFO', () => {
    const o = createOutbox(storage, 'oyl/outbox', at)
    o.enqueue('entries', 'save', A)
    o.enqueue('plans', 'save', B)
    expect(o.size()).toBe(2)
    expect(o.list().map((e) => e.collection)).toEqual(['entries', 'plans'])
  })

  it('coalesces per (collection,id): save+save → one, save+delete → delete, each a new seq', () => {
    const o = createOutbox(storage, 'k', at)
    const s1 = o.enqueue('entries', 'save', A)
    const s2 = o.enqueue('entries', 'save', A)
    expect(o.size()).toBe(1)
    expect(s2.seq).toBeGreaterThan(s1.seq)
    const d = o.enqueue('entries', 'delete', A)
    expect(o.size()).toBe(1)
    expect(o.list()[0]!.op).toBe('delete')
    expect(d.seq).toBeGreaterThan(s2.seq)
  })

  it('has() reports pending; removeIfSeq drops only on a matching seq', () => {
    const o = createOutbox(storage, 'k', at)
    const e = o.enqueue('entries', 'save', A)
    expect(o.has('entries', A)).toBe(true)
    o.removeIfSeq('entries', A, e.seq - 1) // stale seq → no-op
    expect(o.has('entries', A)).toBe(true)
    o.removeIfSeq('entries', A, e.seq)
    expect(o.has('entries', A)).toBe(false)
  })

  it('survives reload and keeps seq monotonic', () => {
    const o1 = createOutbox(storage, 'k', at)
    const e1 = o1.enqueue('entries', 'save', A)
    const o2 = createOutbox(storage, 'k', at) // re-read same storage
    expect(o2.has('entries', A)).toBe(true)
    const e2 = o2.enqueue('plans', 'save', B)
    expect(e2.seq).toBeGreaterThan(e1.seq)
  })
})
```

- [ ] **Step 2: Run — FAIL.**
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/outbox.test.ts`

- [ ] **Step 3: Implement** `packages/all-of-oyl/src/core/outbox.ts`:

```ts
import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { StorageLike } from './local-storage-repository.js'

export type OutboxOp = 'save' | 'delete' | 'purge'
export interface OutboxEntry { seq: number; collection: string; op: OutboxOp; id: string; enqueuedAt: string }

export interface Outbox {
  /** Coalesces per (collection,id): replaces any prior entry; assigns a fresh monotonic seq. */
  enqueue(collection: string, op: OutboxOp, id: Id): OutboxEntry
  /** FIFO snapshot. */
  list(): OutboxEntry[]
  /** Compare-and-remove: drop the entry only if the current seq matches (protects a concurrent re-enqueue). */
  removeIfSeq(collection: string, id: Id, seq: number): void
  has(collection: string, id: Id): boolean
  size(): number
}

export function createOutbox(storage: StorageLike, key: string, now: () => Date): Outbox {
  function read(): OutboxEntry[] {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new DomainError('MALFORMED_JSON', `${key} is not an array`)
    return parsed as OutboxEntry[]
  }
  function write(entries: OutboxEntry[]): void {
    storage.setItem(key, JSON.stringify(entries))
  }
  let seqCounter = read().reduce((m, e) => Math.max(m, e.seq), 0)
  return {
    enqueue(collection, op, id) {
      const sid = String(id)
      const entries = read().filter((e) => !(e.collection === collection && e.id === sid))
      const entry: OutboxEntry = { seq: ++seqCounter, collection, op, id: sid, enqueuedAt: now().toISOString() }
      entries.push(entry)
      write(entries)
      return entry
    },
    list() {
      return read()
    },
    removeIfSeq(collection, id, seq) {
      const sid = String(id)
      const entries = read()
      const next = entries.filter((e) => !(e.collection === collection && e.id === sid && e.seq === seq))
      if (next.length !== entries.length) write(next)
    },
    has(collection, id) {
      const sid = String(id)
      return read().some((e) => e.collection === collection && e.id === sid)
    },
    size() {
      return read().length
    },
  }
}
```

- [ ] **Step 4: Barrel** — add to `index.ts`:
```ts
export { createOutbox, type Outbox, type OutboxEntry, type OutboxOp } from './core/outbox.js'
```

- [ ] **Step 5: Run — PASS** + `pnpm --filter @oyl/all-of-oyl typecheck:src`.

- [ ] **Step 6: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/outbox.ts packages/all-of-oyl/src/core/outbox.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): Outbox — durable coalescing write queue with seq compare-and-remove"
```

---

### Task 3: `Connectivity` (types + test doubles)

**Files:**
- Create: `packages/all-of-oyl/src/core/connectivity.ts`
- Test: `packages/all-of-oyl/src/core/connectivity.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/all-of-oyl/src/core/connectivity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alwaysOnline, alwaysOffline, manualConnectivity } from './connectivity.js'

describe('connectivity test doubles', () => {
  it('alwaysOnline / alwaysOffline report fixed state', () => {
    expect(alwaysOnline().isOnline()).toBe(true)
    expect(alwaysOffline().isOnline()).toBe(false)
  })

  it('manualConnectivity flips state and notifies subscribers', () => {
    const c = manualConnectivity(false)
    expect(c.isOnline()).toBe(false)
    const seen: boolean[] = []
    const unsub = c.subscribe((o) => seen.push(o))
    c.setOnline(true)
    c.setOnline(false)
    expect(c.isOnline()).toBe(false)
    expect(seen).toEqual([true, false])
    unsub()
    c.setOnline(true)
    expect(seen).toEqual([true, false]) // no more after unsubscribe
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `packages/all-of-oyl/src/core/connectivity.ts`:

```ts
/** Online/offline signal, injected so the engine never touches navigator/window. */
export interface Connectivity {
  isOnline(): boolean
  subscribe(cb: (online: boolean) => void): () => void
}

export function alwaysOnline(): Connectivity {
  return { isOnline: () => true, subscribe: () => () => {} }
}

export function alwaysOffline(): Connectivity {
  return { isOnline: () => false, subscribe: () => () => {} }
}

export function manualConnectivity(initial = true): Connectivity & { setOnline(v: boolean): void } {
  let online = initial
  const subs = new Set<(o: boolean) => void>()
  return {
    isOnline: () => online,
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    setOnline(v) {
      online = v
      for (const cb of subs) cb(v)
    },
  }
}
```

- [ ] **Step 4: Barrel** — add to `index.ts`:
```ts
export { type Connectivity, alwaysOnline, alwaysOffline, manualConnectivity } from './core/connectivity.js'
```

- [ ] **Step 5: Run — PASS** + `typecheck:src`.

- [ ] **Step 6: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/connectivity.ts packages/all-of-oyl/src/core/connectivity.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): Connectivity seam + test doubles (alwaysOnline/Offline/manual)"
```

---

### Task 4: `createSyncEngine` (facade + flush + pull + start + syncState)

**Files:**
- Create: `packages/all-of-oyl/src/core/sync-engine.ts`
- Test: `packages/all-of-oyl/src/core/sync-engine.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the failing test** `packages/all-of-oyl/src/core/sync-engine.test.ts`. Uses `InMemoryRepository` as the `remote` (it enforces revision + throws `DomainError('REVISION_CONFLICT')`, exactly like the real backend), a `CacheStore` over in-memory storage, the real `Outbox`, and `manualConnectivity`.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createSyncEngine } from './sync-engine.js'
import { createCacheStore } from './cache-store.js'
import { createOutbox } from './outbox.js'
import { manualConnectivity } from './connectivity.js'
import { InMemoryRepository } from './in-memory-repository.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'
import type { StorageLike } from './local-storage-repository.js'

function mem(): StorageLike { let v: string | null = null; return { getItem: () => v, setItem: (_k, val) => { v = val } } }
const codec = COLLECTIONS.lifeAreas as any
const now = () => new Date('2026-06-15T12:00:00Z')

/** Build an engine with one collection 'lifeAreas': a CacheStore + an InMemoryRepository remote. */
function setup(online = true) {
  const storage = mem()
  const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
  const remote = new InMemoryRepository<LifeArea>(now)
  const outbox = createOutbox(storage, 'oyl/outbox', now)
  const conn = manualConnectivity(online)
  const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: conn, now })
  return { engine, cache, remote, outbox, conn, repo: engine.repositories.lifeAreas! }
}
const area = (name = 'Health', slug = 'health') => new LifeArea({ name, slug })

describe('createSyncEngine', () => {
  it('offline save writes the cache + outbox, not the remote', async () => {
    const { repo, cache, remote, outbox } = setup(false)
    const a = area()
    await repo.save(a)
    expect((await cache.getRaw(a.id))?.id).toBe(a.id)
    expect(outbox.has('lifeAreas', a.id)).toBe(true)
    expect(await remote.get(a.id)).toBeUndefined()
  })

  it('flush pushes to the remote, drains the outbox, advances the base revision (data unchanged)', async () => {
    const { repo, cache, remote, outbox, engine } = setup(true)
    const a = area()
    await repo.save(a)
    await engine.flush()
    expect((await remote.get(a.id))?.id).toBe(a.id)
    expect(outbox.size()).toBe(0)
    expect((await cache.getRaw(a.id))?.meta?.revision).toBe((await remote.get(a.id))?.meta?.revision)
  })

  it('edit-after-flush does not 409 (base read from cache)', async () => {
    const { repo, remote, engine, cache, outbox } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    // re-save the SAME logical record (its in-memory revision is now stale vs the reconciled cache)
    const local = (await cache.get(a.id))!
    await repo.save(local)
    await engine.flush()
    expect(engine.syncState.get().status).toBe('idle') // drained, no error/conflict surfaced
    expect(outbox.size()).toBe(0)
    expect((await remote.get(a.id))?.meta?.revision).toBeGreaterThan(1)
  })

  it('concurrent backend edit → 409 → client-wins', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    // someone bumps the remote behind our back
    const onServer = (await remote.get(a.id))!
    await remote.save(onServer) // revision +1 on the server
    // now make a local edit and flush — our cached base is stale → 409 → client-wins
    const local = (await cache.get(a.id))!
    await repo.save(local)
    await engine.flush()
    expect((await remote.get(a.id))?.id).toBe(a.id) // still there, client data won
  })

  it('pull brings a remote-only record into the cache and skips pending ids', async () => {
    const { repo, cache, remote, engine } = setup(true)
    const remoteOnly = area('Money', 'money')
    await remote.save(remoteOnly)
    const pending = area('Mind', 'mind')
    await repo.save(pending) // pending op, NOT yet flushed (we will pull before flush)
    await engine.pull()
    expect((await cache.getRaw(remoteOnly.id))?.id).toBe(remoteOnly.id) // pulled in
    expect((await cache.getRaw(pending.id))?.id).toBe(pending.id) // local kept (skipped)
  })

  it('reconnect triggers a flush; syncState reflects offline/pending → idle', async () => {
    const { repo, conn, engine, remote } = setup(false)
    await engine.start()
    const a = area()
    await repo.save(a)
    expect(engine.syncState.get().pending).toBe(1)
    conn.setOnline(true)
    await Promise.resolve(); await Promise.resolve() // let the fire-and-forget flush settle
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()
    expect(engine.syncState.get().pending).toBe(0)
  })
})

```

> Implementer notes: (a) verify `InMemoryRepository`'s constructor signature — if it isn't `new InMemoryRepository(clock)`, adjust the `setup()` helper. (b) These tests are the starting point; keep each assertion's *intent* (offline-queues, flush-pushes-and-advances-revision-only, edit-after-flush-no-409, 409-client-wins, pull-skips-pending, reconnect-drains) and add cases freely under TDD.

- [ ] **Step 2: Run — FAIL** (`./sync-engine.js` missing).

- [ ] **Step 3: Implement** `packages/all-of-oyl/src/core/sync-engine.ts`:

```ts
import { DomainError } from './domain-error.js'
import type { Id } from './id.js'
import type { PersistedMeta } from './persisted-meta.js'
import type { Repository } from './repository.js'
import type { CacheStore } from './cache-store.js'
import type { Outbox } from './outbox.js'
import type { Connectivity } from './connectivity.js'

export interface SyncState {
  online: boolean
  pending: number
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastError?: string
  lastSyncedAt?: Date
}

export interface Observable<T> {
  get(): T
  subscribe(cb: (v: T) => void): () => void
}

interface Timers {
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

type Rec = { id: Id; meta?: PersistedMeta }

export interface SyncEngine {
  repositories: Record<string, Repository<any>>
  syncState: Observable<SyncState>
  start(): Promise<void>
  flush(): Promise<void>
  pull(): Promise<void>
}

export function createSyncEngine(deps: {
  collections: Record<string, { cache: CacheStore<any>; remote: Repository<any> }>
  outbox: Outbox
  connectivity: Connectivity
  now: () => Date
  timers?: Timers
  backoff?: (attempt: number) => number
}): SyncEngine {
  const { collections, outbox, connectivity, now, timers } = deps
  const backoff = deps.backoff ?? ((a) => Math.min(30_000, 1_000 * 2 ** a))

  let state: SyncState = { online: connectivity.isOnline(), pending: outbox.size(), status: 'idle' }
  const subs = new Set<(v: SyncState) => void>()
  function emit(patch: Partial<SyncState>): void {
    state = { ...state, ...patch, pending: outbox.size(), online: connectivity.isOnline() }
    for (const cb of subs) cb(state)
  }
  const syncState: Observable<SyncState> = {
    get: () => state,
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb) },
  }

  function isConflict(e: unknown): boolean {
    return e instanceof DomainError && e.code === 'REVISION_CONFLICT'
  }
  function errKind(e: unknown): 'auth' | 'transport' | 'other' {
    const x = e as { name?: string; kind?: string }
    if (x?.name === 'HttpRepositoryError') return x.kind === 'auth' ? 'auth' : 'transport'
    return 'other'
  }
  function notFound(e: unknown): boolean {
    const x = e as { name?: string; kind?: string; status?: number }
    return x?.name === 'HttpRepositoryError' && x.status === 404
  }
  function message(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  let flushing = false
  let attempt = 0
  let retry: unknown = undefined
  function scheduleRetry(): void {
    if (!timers) return
    if (retry !== undefined) timers.clear(retry)
    retry = timers.set(() => { retry = undefined; void flush() }, backoff(attempt++))
  }

  async function flush(): Promise<void> {
    if (flushing) return
    if (!connectivity.isOnline()) { emit({ status: 'offline' }); return }
    flushing = true
    emit({ status: 'syncing' })
    try {
      let entries = outbox.list()
      while (entries.length > 0) {
        for (const entry of entries) {
          const coll = collections[entry.collection]
          if (!coll) { outbox.removeIfSeq(entry.collection, entry.id as unknown as Id, entry.seq); continue }
          const { cache, remote } = coll
          const id = entry.id as unknown as Id
          try {
            if (entry.op === 'save') {
              const rec = (await cache.getRaw(id)) as Rec | undefined
              if (!rec) { outbox.removeIfSeq(entry.collection, id, entry.seq); continue }
              let saved: Rec
              try {
                saved = await remote.save(rec)
              } catch (e) {
                if (isConflict(e)) {
                  const cur = (await remote.get(id)) as Rec | undefined
                  if (cur?.meta && rec.meta) rec.meta = { ...rec.meta, revision: cur.meta.revision }
                  saved = await remote.save(rec)
                } else throw e
              }
              // R-15: advance the base revision on the CURRENT cache record; never overwrite local data.
              const current = (await cache.getRaw(id)) as Rec | undefined
              if (current?.meta && saved?.meta) {
                current.meta = { ...current.meta, revision: saved.meta.revision }
                await cache.putRaw(current)
              }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            } else if (entry.op === 'delete') {
              try { await remote.delete(id) } catch (e) { if (!notFound(e)) throw e }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            } else {
              try { await remote.purge(id) } catch (e) { if (!notFound(e)) throw e }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
            }
          } catch (e) {
            const kind = errKind(e)
            if (kind === 'auth') { emit({ status: 'error', lastError: message(e) }); flushing = false; return }
            if (kind === 'transport') { scheduleRetry(); emit({ status: 'offline' }); flushing = false; return }
            emit({ status: 'error', lastError: message(e) }); flushing = false; return
          }
          emit({})
        }
        entries = outbox.list()
      }
      attempt = 0
      emit({ status: 'idle', lastSyncedAt: now() })
    } finally {
      flushing = false
    }
  }

  async function pull(): Promise<void> {
    if (!connectivity.isOnline()) return
    for (const name of Object.keys(collections)) {
      const { cache, remote } = collections[name]!
      let serverRecs: Rec[]
      try {
        serverRecs = (await remote.list({ includeDeleted: true })) as Rec[]
      } catch (e) {
        if (errKind(e) === 'transport') { emit({ status: 'offline' }); return }
        throw e
      }
      for (const rec of serverRecs) {
        if (outbox.has(name, rec.id)) continue
        await cache.putRaw(rec)
      }
    }
    emit({ lastSyncedAt: now() })
  }

  function makeFacade(name: string, cache: CacheStore<any>): Repository<any> {
    const trigger = () => { void flush() }
    return {
      get: (id) => cache.get(id),
      list: (opts) => cache.list(opts),
      async save(item: Rec) {
        const existing = (await cache.getRaw(item.id)) as Rec | undefined
        const at = now()
        item.meta = existing?.meta
          ? { createdAt: existing.meta.createdAt, updatedAt: at, revision: existing.meta.revision }
          : { createdAt: at, updatedAt: at, revision: 1 }
        await cache.putRaw(item)
        outbox.enqueue(name, 'save', item.id)
        emit({})
        trigger()
        return item
      },
      async delete(id) {
        const existing = (await cache.getRaw(id)) as Rec | undefined
        if (existing?.meta && !existing.meta.deletedAt) {
          existing.meta = { ...existing.meta, updatedAt: now(), deletedAt: now() }
          await cache.putRaw(existing)
        }
        outbox.enqueue(name, 'delete', id)
        emit({})
        trigger()
      },
      async purge(id) {
        await cache.removeRaw(id)
        outbox.enqueue(name, 'purge', id)
        emit({})
        trigger()
      },
      async saveMany(items: Rec[]) {
        const out: Rec[] = []
        for (const item of items) out.push(await this.save(item))
        return out
      },
    }
  }

  const repositories: Record<string, Repository<any>> = {}
  for (const name of Object.keys(collections)) {
    repositories[name] = makeFacade(name, collections[name]!.cache)
  }

  async function start(): Promise<void> {
    connectivity.subscribe((online) => {
      emit({ online })
      if (online) void flush().then(() => pull())
    })
    if (connectivity.isOnline()) {
      await flush()
      await pull()
    } else {
      emit({ status: 'offline' })
    }
  }

  return { repositories, syncState, start, flush, pull }
}
```

- [ ] **Step 4: Barrel** — add to `index.ts`:
```ts
export { createSyncEngine, type SyncEngine, type SyncState, type Observable } from './core/sync-engine.js'
```

- [ ] **Step 5: Run the test — PASS**, then strict typecheck + the **DOM-free build** (the real gate — confirms no `setTimeout`/`window`/etc. leaked):
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
```
Expected: tests pass; typecheck clean; build emits `dist/` with no errors (the no-bare-imports guard also passes).

- [ ] **Step 6: Full all-of test + commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
pnpm --filter @oyl/all-of-oyl test
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): createSyncEngine — offline-first cache+outbox engine (flush/pull, client-wins, syncState)"
```

---

### Task 5: App keys + browser connectivity + bootstrap wiring

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/keys.js`
- Create: `apps/vanilla-oyl/src/storage/connectivity.js` + `connectivity.test.js`
- Modify: `apps/vanilla-oyl/src/storage/bootstrap.js`
- Modify (extend): `apps/vanilla-oyl/src/storage/bootstrap.test.js`

- [ ] **Step 1: Keys** — add to `apps/vanilla-oyl/src/storage/keys.js` (after `dataKey`):
```js
export const CACHE_PREFIX = 'oyl/cache/'
/** Full localStorage key for a collection's offline cache. @param {string} collection @returns {string} */
export function cacheKey(collection) {
  return `${CACHE_PREFIX}${collection}`
}
export const OUTBOX_KEY = 'oyl/outbox'
```

- [ ] **Step 2: Browser connectivity test** `apps/vanilla-oyl/src/storage/connectivity.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { createBrowserConnectivity } from './connectivity.js'

function fakeWindow(online) {
  /** @type {Record<string, ((e: any) => void)[]>} */
  const listeners = {}
  return {
    navigator: { onLine: online },
    addEventListener: (t, cb) => { (listeners[t] ||= []).push(cb) },
    removeEventListener: (t, cb) => { listeners[t] = (listeners[t] || []).filter((f) => f !== cb) },
    _fire: (t) => { for (const cb of listeners[t] || []) cb({}) },
  }
}

describe('createBrowserConnectivity', () => {
  it('reports navigator.onLine and notifies on online/offline events', () => {
    const win = fakeWindow(true)
    const c = createBrowserConnectivity(/** @type {any} */ (win))
    expect(c.isOnline()).toBe(true)
    const seen = []
    const unsub = c.subscribe((o) => seen.push(o))
    win._fire('offline'); win._fire('online')
    expect(seen).toEqual([false, true])
    unsub()
    win._fire('offline')
    expect(seen).toEqual([false, true])
  })
})
```

- [ ] **Step 3: Implement** `apps/vanilla-oyl/src/storage/connectivity.js`:
```js
/**
 * A Connectivity backed by the browser. @param {Window} win
 * @returns {import('@oyl/all-of-oyl').Connectivity}
 */
export function createBrowserConnectivity(win) {
  return {
    isOnline: () => win.navigator.onLine,
    subscribe(cb) {
      const on = () => cb(true)
      const off = () => cb(false)
      win.addEventListener('online', on)
      win.addEventListener('offline', off)
      return () => {
        win.removeEventListener('online', on)
        win.removeEventListener('offline', off)
      }
    },
  }
}
```

- [ ] **Step 4: Bootstrap** — rewrite `apps/vanilla-oyl/src/storage/bootstrap.js` `makeRepositories` to build the engine in remote mode and return `{ repos, engine }`:
```js
import { COLLECTIONS, LocalStorageRepository, createHttpRepository, createCacheStore, createOutbox, createSyncEngine, alwaysOnline } from '@oyl/all-of-oyl'
import { dataKey, cacheKey, OUTBOX_KEY } from './keys.js'
import { now } from './clock.js'

/**
 * @typedef {keyof typeof COLLECTIONS} CollectionName
 * @typedef {Record<CollectionName, import('@oyl/all-of-oyl').Repository<any>>} Repositories
 */

/**
 * Build the repositories. Remote mode (`opts.client`) returns offline-first facades from a
 * sync engine (+ the engine for start()/syncState); local mode returns plain localStorage repos.
 * @param {import('@oyl/all-of-oyl').StorageLike} storage
 * @param {{ client?: import('@oyl/all-of-oyl').HttpClient, connectivity?: import('@oyl/all-of-oyl').Connectivity }} [opts]
 * @returns {{ repos: Repositories, engine?: import('@oyl/all-of-oyl').SyncEngine }}
 */
export function makeRepositories(storage, opts = {}) {
  if (opts.client) {
    /** @type {Record<string, { cache: any, remote: any }>} */
    const collections = {}
    for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
      const codec = /** @type {any} */ (COLLECTIONS[name])
      collections[name] = {
        cache: createCacheStore(storage, cacheKey(name), codec),
        remote: createHttpRepository(opts.client, name, codec),
      }
    }
    const outbox = createOutbox(storage, OUTBOX_KEY, now)
    const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }
    const engine = createSyncEngine({ collections, outbox, connectivity: opts.connectivity ?? alwaysOnline(), now, timers })
    return { repos: /** @type {Repositories} */ (engine.repositories), engine }
  }
  const repos = /** @type {Repositories} */ ({})
  for (const name of /** @type {CollectionName[]} */ (Object.keys(COLLECTIONS))) {
    repos[name] = new LocalStorageRepository(storage, dataKey(name), /** @type {any} */ (COLLECTIONS[name]), now)
  }
  return { repos }
}

/**
 * Live (non-deleted) record count per collection.
 * @param {Repositories} repos @returns {Promise<Record<string, number>>}
 */
export async function collectionCounts(repos) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const name of /** @type {CollectionName[]} */ (Object.keys(repos))) {
    counts[name] = (await repos[name].list()).length
  }
  return counts
}
```

- [ ] **Step 5: Update `bootstrap.test.js`** — every `makeRepositories(...)` call now returns `{ repos, engine }`. Change existing assertions to destructure `const { repos } = makeRepositories(...)`, and add a remote case:
```js
import { manualConnectivity } from '@oyl/all-of-oyl'
// … in the remote test:
it('remote mode builds engine-backed offline facades (cache + outbox)', async () => {
  const storage = /* the test's fake storage */ makeFakeStorage()
  const client = /* a stub HttpClient or createProtocolFake-backed client */ makeStubClient()
  const { repos, engine } = makeRepositories(storage, { client, connectivity: manualConnectivity(false) })
  expect(engine).toBeTruthy()
  const entry = /* a fresh Entry */ makeEntry()
  await repos.entries.save(entry)
  // offline: it's in the cache (list returns it) and queued, not on the client yet
  expect((await repos.entries.list()).length).toBe(1)
})
```
(Adapt to the existing `bootstrap.test.js` helpers — reuse whatever fake storage/client it already defines. Keep the existing local-mode tests, just destructuring `{ repos }`.)

- [ ] **Step 6: Run + typecheck**
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/storage/connectivity.test.js src/storage/bootstrap.test.js
pnpm vanilla typecheck
```

- [ ] **Step 7: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/storage/keys.js apps/vanilla-oyl/src/storage/connectivity.js apps/vanilla-oyl/src/storage/connectivity.test.js apps/vanilla-oyl/src/storage/bootstrap.js apps/vanilla-oyl/src/storage/bootstrap.test.js
git commit -m "feat(vanilla-oyl): wire offline sync engine into makeRepositories (remote) + browser connectivity"
```

---

### Task 6: `data.js` + `main.js` wiring (startSync, syncFlush, login→flush)

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js`
- Modify (extend): `apps/vanilla-oyl/src/state/data.test.js`
- Modify: `apps/vanilla-oyl/src/main.js`

- [ ] **Step 1: `data.js`** — three edits:

(a) Change the `opts` typedef + the destructure of `makeRepositories`:
```js
 * @param {{ client?: import('@oyl/all-of-oyl').HttpClient, connectivity?: import('@oyl/all-of-oyl').Connectivity }} [opts]
 */
export function createDataState(storage, themeState, opts = {}) {
  const { repos, engine } = makeRepositories(storage, opts.client ? { client: opts.client, connectivity: opts.connectivity } : {})
```

(b) Define the sync surface (near the other consts, after `repos`):
```js
  const syncState = engine ? engine.syncState : null
  /** Run the initial flush→pull (no-op in local mode). @returns {Promise<void>} */
  async function startSync() { if (engine) await engine.start() }
  /** Push the outbox now (e.g. after re-login). */
  function syncFlush() { if (engine) void engine.flush() }
```

(c) Add them to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription, accounts, syncState, startSync, syncFlush }
```

- [ ] **Step 2: `data.test.js`** — add a case (reuse the file's existing fakes):
```js
it('remote createDataState exposes syncState + startSync; startSync runs a flush', async () => {
  const ds = createDataState(storage, themeState, { client: makeStubClient(), connectivity: manualConnectivity(true) })
  expect(ds.syncState).toBeTruthy()
  await ds.startSync() // should resolve without throwing
})
// local mode: syncState is null
it('local createDataState has a null syncState', () => {
  const ds = createDataState(storage, themeState, {})
  expect(ds.syncState).toBeNull()
})
```
(Import `manualConnectivity` from `@oyl/all-of-oyl`; reuse the existing stub client/storage helpers.)

- [ ] **Step 3: `main.js`** — wire connectivity, start sync, and login→flush. In the boot function:

(a) import:
```js
import { createBrowserConnectivity } from './storage/connectivity.js'
```
(b) build connectivity + pass it (remote only) where `createDataState` is called:
```js
const connectivity = mode === 'remote' ? createBrowserConnectivity(window) : undefined
const dataState = createDataState(storage, themeState, client ? { client, connectivity } : {})
```
(c) after the existing `await dataState.refresh()` (instant, from cache) try/catch block, add the background sync + freshen:
```js
// SP5a: kick the engine (flush queued writes → pull), then re-hydrate from the freshened cache.
if (mode === 'remote') {
  void dataState.startSync().then(() => dataState.refresh()).catch(() => {})
}
```
(d) resume the outbox after a successful (re-)login — add an effect on the auth session:
```js
let wasSignedIn = !!authState.session.get()
effect(() => {
  const signedIn = !!authState.session.get()
  if (signedIn && !wasSignedIn) dataState.syncFlush()
  wasSignedIn = signedIn
})
```
(`effect` is already imported in `main.js`.)

- [ ] **Step 4: Full app gates**
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Expected: all pass (existing + the new data/bootstrap/connectivity tests).

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): startSync→refresh boot + login→flush; expose syncState/startSync"
```

---

### Task 7: Real-Chrome acceptance (offline-first round-trip)

**Files:** none (verification only). Needs the compose stack (SP4c) or native `strapi-app`/`vanilla`.

If Docker/servers aren't available, **STOP and report** — Tasks 1–6 are the deliverable; this is manual verification.

- [ ] **Step 1: Bring up the backend + app** (compose): `docker compose up -d --build postgres strapi-app vanilla`; wait for `strapi-app` healthy.
- [ ] **Step 2:** In Chrome at `http://localhost:8041` → Status → Connection → URL `http://localhost:3340/api`, Remote, Apply → register/sign in.
- [ ] **Step 3 (offline writes):** DevTools → Network → Offline. Add/edit/delete several journal entries → they apply **instantly**. Inspect `localStorage['oyl/outbox']` → pending ops present. **Reload** while offline → entries still render (served from `oyl/cache/*`).
- [ ] **Step 4 (flush on reconnect):** Network → Online. Within a moment the outbox drains (`oyl/outbox` → `[]`). Verify the records now exist on the backend: `curl -s http://localhost:3340/api/v1/entries -H "Authorization: Bearer <jwt from localStorage oyl/auth>"` shows them.
- [ ] **Step 5 (pull):** Create a record directly on the backend (or from a second browser profile), reload the first browser → the new record appears (pull merged it into the cache).
- [ ] **Step 6:** Tear down (preserve data): `docker compose rm -sf strapi-app vanilla` (NOT `down -v`). Report the outcomes.

---

## Notes for the implementer

- `src/` files: explicit `.js` on every relative import; no DOM/node globals (inject `timers`/`storage`/`connectivity`/`now`). `pnpm all-of build` is the gate that catches a leaked global.
- The engine is adapter-agnostic: it detects conflicts via `DomainError('REVISION_CONFLICT')` and auth/transport via a duck-typed `HttpRepositoryError` (`.name`/`.kind`/`.status`) — don't import the HTTP adapter into `sync-engine.ts`.
- `makeRepositories` now returns `{ repos, engine }` — update **every** caller (data.js, and any test) to destructure.
- Don't touch the stores, `HttpRepository`, `LocalStorageRepository`, auth, or `apps/strapi-oyl`. Local mode must stay byte-for-byte unchanged.
- Reconcile (flush) advances **revision only** — never `putRaw` the server's data over the cache (R-15).
