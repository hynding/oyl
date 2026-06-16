# Backend SP5b — Explicit conflict policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the sync engine's `409` resolution an explicit, configurable policy (`conflictPolicy: 'client-wins' (default) | 'server-wins'`), resolve against the *deleted-inclusive* server state (fixing a latent SP5a tombstone bug), record resolved conflicts in `syncState`, and bound the retry so a queued write is never lost. Engine-only; no app behavior change by default.

**Architecture:** All in `packages/all-of-oyl/src/core/sync-engine.ts`: a `conflictPolicy` option, two new helpers (`advanceBaseRevision` — the extracted SP5a R-15 reconcile; `currentServerRecord` — `get` then `list({includeDeleted})` fallback), a `resolveConflict` helper driving both policies with a bounded retry, `conflicts`/`lastConflict` on `SyncState`, and a rewritten flush `save` branch.

**Tech Stack:** TypeScript (strict, NodeNext, explicit `.js` imports, no DOM lib); Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-conflict-policy-design.md`

**Conventions/gates:** `pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts`; `pnpm --filter @oyl/all-of-oyl test`; `pnpm --filter @oyl/all-of-oyl typecheck:src`; `pnpm all-of build`. Conflicts are **save-only** (the protocol's DELETE asserts no revision). The deterministic conflict tests need no special stub — `InMemoryRepository` already throws `DomainError('REVISION_CONFLICT')` on a revision mismatch, so a direct `remote.save(...)`/`remote.delete(...)` creates the divergence; only the bounded-retry test needs an always-conflict wrapper.

---

### Task 1: Conflict policy in the sync engine

**Files:**
- Modify: `packages/all-of-oyl/src/core/sync-engine.ts`
- Test: `packages/all-of-oyl/src/core/sync-engine.test.ts` (extend)

- [ ] **Step 1: Write the failing tests.** Append to `packages/all-of-oyl/src/core/sync-engine.test.ts`. First add `DomainError` to the imports at the top of the file:

```ts
import { DomainError } from './domain-error.js'
```

Then add this block (it reuses the file's existing `mem`, `codec`, `now`, `area`, `setup` helpers and imports — `createCacheStore`, `createOutbox`, `manualConnectivity`, `InMemoryRepository` — which are already imported in this test file from Task 4):

```ts
/** Wraps a remote so every save throws REVISION_CONFLICT — a perpetually-racing writer. */
function alwaysConflictRemote(inner: any) {
  return {
    get: (id: any) => inner.get(id),
    list: (opts: any) => inner.list(opts),
    save: async () => { throw new DomainError('REVISION_CONFLICT', 'forced') },
    delete: (id: any) => inner.delete(id),
    purge: (id: any) => inner.purge(id),
    saveMany: (items: any) => inner.saveMany(items),
  }
}

/** Build an engine with an explicit conflict policy (one 'lifeAreas' collection). */
function setupPolicy(policy: 'client-wins' | 'server-wins', remoteOverride?: any) {
  const storage = mem()
  const cache = createCacheStore(storage, 'oyl/cache/lifeAreas', codec)
  const remote = remoteOverride ?? new InMemoryRepository(now)
  const outbox = createOutbox(storage, 'oyl/outbox', now)
  const engine = createSyncEngine({ collections: { lifeAreas: { cache, remote } }, outbox, connectivity: manualConnectivity(true), now, conflictPolicy: policy })
  return { engine, cache, remote, outbox, repo: engine.repositories.lifeAreas! }
}

describe('createSyncEngine — conflict policy', () => {
  it('client-wins (default): conflict resolves with client data and records the conflict once', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.save((await remote.get(a.id))!) // another device bumps the server (rev 2)
    await repo.save((await cache.get(a.id))!)     // local edit (cache base still rev 1)
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()    // live, client data won
    expect(engine.syncState.get().conflicts).toBe(1)
    expect(engine.syncState.get().lastConflict?.id).toBe(String(a.id))
    expect(engine.syncState.get().status).toBe('idle')
  })

  it('client-wins over a server tombstone: resurrects with client data (fixes SP5a bug)', async () => {
    const { repo, remote, engine, cache } = setup(true)
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.delete(a.id)                       // another device deleted it (tombstone, rev bumped)
    await repo.save((await cache.get(a.id))!)       // still live locally → edit
    await engine.flush()
    expect(await remote.get(a.id)).toBeTruthy()     // resurrected (live again) with client data
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('server-wins: adopts the server record, drops the op, records the conflict', async () => {
    const { repo, remote, engine, cache, outbox } = setupPolicy('server-wins')
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.save((await remote.get(a.id))!)    // server rev 2 (the winner)
    await repo.save((await cache.get(a.id))!)
    await engine.flush()
    expect((await cache.getRaw(a.id))?.meta?.revision).toBe((await remote.get(a.id))?.meta?.revision)
    expect(outbox.size()).toBe(0)
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('server-wins over a server tombstone: the record is removed locally', async () => {
    const { repo, remote, engine, cache } = setupPolicy('server-wins')
    const a = area()
    await repo.save(a); await engine.flush()
    await remote.delete(a.id)
    await repo.save((await cache.get(a.id))!)
    await engine.flush()
    expect(await cache.get(a.id)).toBeUndefined()   // server deletion won (tombstone adopted → hidden)
    expect(engine.syncState.get().conflicts).toBe(1)
  })

  it('bounded retry: a perpetual conflict leaves the op queued (not a hard error, not counted)', async () => {
    const { repo, engine, outbox } = setupPolicy('client-wins', alwaysConflictRemote(new InMemoryRepository(now)))
    await repo.save(area())
    await engine.flush()
    expect(outbox.size()).toBe(1)                   // op preserved for a later retry
    expect(engine.syncState.get().status).not.toBe('error')
    expect(engine.syncState.get().conflicts).toBe(0) // unresolved → not counted
  })

  it('no conflict: conflicts stays 0', async () => {
    const { repo, engine } = setup(true)
    await repo.save(area()); await engine.flush()
    expect(engine.syncState.get().conflicts).toBe(0)
  })
})
```

> Implementer note: `setup()` (from Task 4) returns `{ engine, cache, remote, outbox, conn, repo }`; `setupPolicy` (above) returns `{ engine, cache, remote, outbox, repo }`. Keep each test's intent if you adjust mechanics.

- [ ] **Step 2: Run — confirm the new block FAILS** (no `conflictPolicy`, `conflicts` undefined, tombstone case errors):
`pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts`

- [ ] **Step 3: Implement** — edit `packages/all-of-oyl/src/core/sync-engine.ts`:

**3a. `SyncState`** (replace the interface, lines ~9–15):
```ts
export interface SyncState {
  online: boolean
  pending: number
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastError?: string
  lastSyncedAt?: Date
  conflicts: number
  lastConflict?: { collection: string; id: string; at: Date }
}
```

**3b. deps + policy** — add `conflictPolicy` to the `createSyncEngine` deps object type (after `backoff?`):
```ts
  conflictPolicy?: 'client-wins' | 'server-wins'
```
and after `const backoff = …` (line ~46):
```ts
  const policy = deps.conflictPolicy ?? 'client-wins'
  const MAX_CONFLICT_RETRIES = 3
```

**3c. initial state** (line ~48) — add `conflicts: 0`:
```ts
  let state: SyncState = { online: connectivity.isOnline(), pending: outbox.size(), status: 'idle', conflicts: 0 }
```

**3d. `recordConflict`** — add right after the `syncState` const (after line ~57):
```ts
  function recordConflict(collection: string, id: Id): void {
    emit({ conflicts: state.conflicts + 1, lastConflict: { collection, id: String(id), at: now() } })
  }
```

**3e. helpers** — add after the `message` helper (after line ~73, before `let currentFlush`):
```ts
  async function advanceBaseRevision(cache: CacheStore<any>, id: Id, saved: Rec): Promise<void> {
    const current = (await cache.getRaw(id)) as Rec | undefined
    if (current?.meta && saved?.meta) {
      current.meta = { ...current.meta, revision: saved.meta.revision }
      await cache.putRaw(current)
    }
  }

  /** Deleted-inclusive read: get hides tombstones, so fall back to list. undefined = hard-purged. */
  async function currentServerRecord(remote: Repository<any>, id: Id): Promise<Rec | undefined> {
    const got = (await remote.get(id)) as Rec | undefined
    if (got) return got
    const all = (await remote.list({ includeDeleted: true })) as Rec[]
    return all.find((r) => r.id === id)
  }

  /** Apply the conflict policy to a flush save conflict. Returns true if resolved (op may be removed). */
  async function resolveConflict(
    coll: { cache: CacheStore<any>; remote: Repository<any> },
    collection: string,
    id: Id,
    localRec: Rec,
  ): Promise<boolean> {
    for (let i = 0; i < MAX_CONFLICT_RETRIES; i++) {
      const cur = await currentServerRecord(coll.remote, id)
      if (policy === 'server-wins') {
        if (cur) await coll.cache.putRaw(cur)
        else await coll.cache.removeRaw(id)
        recordConflict(collection, id)
        return true
      }
      // client-wins: re-push local data over the current revision (cur undefined → server re-creates)
      if (cur?.meta && localRec.meta) localRec.meta = { ...localRec.meta, revision: cur.meta.revision }
      try {
        const saved = (await coll.remote.save(localRec)) as Rec
        await advanceBaseRevision(coll.cache, id, saved)
        recordConflict(collection, id)
        return true
      } catch (e) {
        if (!isConflict(e)) throw e
        // a second concurrent write raced us; loop to re-fetch + retry
      }
    }
    return false
  }
```

**3f. flush `save` branch** — replace the block from `let saved: Rec` through its `outbox.removeIfSeq(...)` (lines ~105–120) with:
```ts
              try {
                const saved = (await remote.save(rec)) as Rec
                await advanceBaseRevision(cache, id, saved)
              } catch (e) {
                if (!isConflict(e)) throw e
                const resolved = await resolveConflict(coll, entry.collection, id, rec)
                if (!resolved) { scheduleRetry(); emit({ status: 'offline' }); return }
              }
              outbox.removeIfSeq(entry.collection, id, entry.seq)
```
(The `delete`/`purge` branches and the outer `catch` are unchanged. The old inline `remote.get`-based reconcile is fully replaced.)

- [ ] **Step 4: Run the new tests — PASS**, then the full all-of suite + strict typecheck + DOM-free build:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
```
Expected: all green; `typecheck:src` exit 0 (now that test/fake are excluded); build "dist/ is bare-import free."

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts
git commit -m "feat(all-of-oyl): explicit conflict policy in sync engine (client-wins default | server-wins, deleted-inclusive resolution, bounded retry, conflict recording)"
```

---

### Task 2: Vanilla regression check (no code change expected)

**Files:** none (verification).

The default policy is `client-wins` (unchanged behavior) and `bootstrap.js` doesn't pass `conflictPolicy`, so vanilla-oyl should be unaffected — but `SyncState` gained required field `conflicts`, so confirm nothing typed against `SyncState` breaks.

- [ ] **Step 1: Run vanilla gates**
```bash
pnpm vanilla test
pnpm vanilla typecheck
```
Expected: green (279 tests). If `pnpm vanilla typecheck` flags a missing `conflicts` somewhere that constructs a `SyncState` literal, fix that construction minimally and report. (None expected — the app only *reads* `syncState`.)

- [ ] **Step 2:** No commit if nothing changed. If a fix was needed, commit it:
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add -A && git commit -m "fix(vanilla-oyl): satisfy SyncState.conflicts after the engine conflict-policy change"
```

---

## Notes for the implementer

- `src/` rules: explicit `.js` imports; no DOM/node globals; the build is the DOM gate.
- The conflict path is **save-only** — leave the `delete`/`purge` branches and the outer `catch` untouched.
- Don't change `bootstrap.js`/`data.js`/`main.js` — the default policy preserves behavior and the enriched `syncState` flows through automatically (SP5d consumes it).
- Keep each test's intent if you adjust mechanics; `InMemoryRepository` + direct `remote.save`/`remote.delete` is how you stage a deterministic conflict (no stub needed except `alwaysConflictRemote` for the bounded-retry case).
