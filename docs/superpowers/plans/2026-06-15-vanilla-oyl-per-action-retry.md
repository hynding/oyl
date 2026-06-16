# Backend SP5d3 — Per-action retry / poison-op handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Quarantine "poison" per-op errors (non-retryable 4xx, or unexpected errors) so one bad write never blocks or spins the shared outbox; surface a `failed` count + Retry/Discard.

**Architecture:** A 3-way `classify` (`auth | transport | poison`) replacing `errKind`; an outbox that marks/clears/discards failed entries; a flush loop that **filters** failed entries (terminates) and quarantines poison ops; `syncState.failed`; a chip "N failed" + Status Retry/Discard.

**Tech Stack:** TS (strict, NodeNext, no DOM lib) + Vitest for `src/`; vanilla JS + Vitest for the app.

**Spec:** `docs/superpowers/specs/2026-06-15-vanilla-oyl-per-action-retry-design.md`

**Gates:** `pnpm --filter @oyl/all-of-oyl test` / `typecheck:src` / `pnpm all-of build`; `pnpm vanilla test` / `pnpm vanilla typecheck`.

---

### Task 1: Outbox failed-tracking

**Files:** Modify `packages/all-of-oyl/src/core/outbox.ts`; Test `outbox.test.ts`.

- [ ] **Step 1: Failing test** — append to `outbox.test.ts` (reuses `mem`/`at`/`A`/`B`):
```ts
it('markFailed / clearFailed / discardFailed', () => {
  const o = createOutbox(storage, 'k', at)
  o.enqueue('entries', 'save', A)
  o.enqueue('plans', 'save', B)
  o.markFailed('entries', A, 'boom')
  const failed = o.list().find((e) => e.id === String(A))
  expect(failed?.failedAt).toBeTruthy()
  expect(failed?.error).toBe('boom')
  expect(o.list().length).toBe(2) // failed entries still listed
  o.clearFailed()
  expect(o.list().find((e) => e.id === String(A))?.failedAt).toBeUndefined()
  o.markFailed('entries', A, 'again')
  o.discardFailed()
  expect(o.list().length).toBe(1)
  expect(o.list()[0]!.collection).toBe('plans')
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** in `outbox.ts`:
  - `OutboxEntry` gains the fields:
    ```ts
    export interface OutboxEntry { seq: number; collection: string; op: OutboxOp; id: string; enqueuedAt: string; failedAt?: string; error?: string }
    ```
  - `Outbox` interface gains:
    ```ts
    markFailed(collection: string, id: Id, error: string): void
    clearFailed(): void
    discardFailed(): void
    ```
  - In the returned object add:
    ```ts
    markFailed(collection, id, error) {
      const sid = String(id)
      const entries = read()
      const e = entries.find((x) => x.collection === collection && x.id === sid)
      if (e) { e.failedAt = now().toISOString(); e.error = error; write(entries) }
    },
    clearFailed() {
      const entries = read()
      let changed = false
      for (const e of entries) if (e.failedAt) { delete e.failedAt; delete e.error; changed = true }
      if (changed) write(entries)
    },
    discardFailed() {
      const entries = read()
      const next = entries.filter((e) => !e.failedAt)
      if (next.length !== entries.length) write(next)
    },
    ```

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/outbox.test.ts
pnpm --filter @oyl/all-of-oyl typecheck:src
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/outbox.ts packages/all-of-oyl/src/core/outbox.test.ts
git commit -m "feat(all-of-oyl): Outbox failed-tracking (markFailed/clearFailed/discardFailed)"
```

---

### Task 2: Engine classify + poison quarantine + retry/discard

**Files:** Modify `packages/all-of-oyl/src/core/sync-engine.ts`; Test `sync-engine.test.ts`.

- [ ] **Step 1: Failing test** — append (reuses `mem`/`codec`/`now`/`area`/`createCacheStore`/`createOutbox`/`manualConnectivity`/`InMemoryRepository`; import `HttpRepositoryError` from `'./http-repository.js'`):
```ts
import { HttpRepositoryError } from './http-repository.js'

/** A remote that throws a 413 for ids in `poison`, else delegates. */
function flakyRemote(inner) {
  const poison = new Set()
  return {
    poison,
    get: (id) => inner.get(id), list: (o) => inner.list(o), delete: (id) => inner.delete(id), purge: (id) => inner.purge(id), saveMany: (i) => inner.saveMany(i),
    save: async (x) => { if (poison.has(x.id)) throw new HttpRepositoryError('server', 'too large', 413); return inner.save(x) },
  }
}

describe('createSyncEngine — poison quarantine', () => {
  function setupFlaky() {
    const storage = mem()
    const inner = new InMemoryRepository(now)
    const remote = flakyRemote(inner)
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now })
    return { engine, inner, remote, repo: engine.repositories.lifeAreas }
  }

  it('quarantines a poison op + flushes the rest; failed=1, pending=0; terminates', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p'); const G = area('G', 'g')
    remote.poison.add(P.id)
    await repo.save(P); await repo.save(G)
    await engine.flush()
    expect(await inner.get(G.id)).toBeTruthy()        // good flushed
    expect(await inner.get(P.id)).toBeUndefined()      // poison not on remote
    expect(engine.syncState.get().failed).toBe(1)
    expect(engine.syncState.get().pending).toBe(0)
    expect(engine.syncState.get().lastFailedError).toContain('413')
  })

  it('retryFailed re-attempts (now succeeds) → failed=0, on remote', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p')
    remote.poison.add(P.id)
    await repo.save(P); await engine.flush()
    expect(engine.syncState.get().failed).toBe(1)
    remote.poison.delete(P.id)                         // fixed
    await engine.retryFailed()
    expect(engine.syncState.get().failed).toBe(0)
    expect(await inner.get(P.id)).toBeTruthy()
  })

  it('discardFailed drops the op (failed=0, never pushed)', async () => {
    const { engine, inner, remote, repo } = setupFlaky()
    const P = area('P', 'p')
    remote.poison.add(P.id)
    await repo.save(P); await engine.flush()
    engine.discardFailed()
    expect(engine.syncState.get().failed).toBe(0)
    expect(await inner.get(P.id)).toBeUndefined()
  })

  it('a plain Error is quarantined (not infinite, not halting)', async () => {
    const storage = mem(); const inner = new InMemoryRepository(now)
    const remote = { get: (id) => inner.get(id), list: (o) => inner.list(o), delete: (id) => inner.delete(id), purge: (id) => inner.purge(id), saveMany: (i) => inner.saveMany(i), save: async () => { throw new Error('boom') } }
    const engine = createSyncEngine({ collections: { lifeAreas: { cache: createCacheStore(storage, 'oyl/cache/lifeAreas', codec), remote } }, outbox: createOutbox(storage, 'oyl/outbox', now), connectivity: manualConnectivity(true), now })
    await engine.repositories.lifeAreas.save(area())
    await engine.flush() // must terminate
    expect(engine.syncState.get().failed).toBe(1)
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** in `sync-engine.ts`:
  - `SyncState` gains (after `lastConflict?`): `failed: number` and `lastFailedError?: string`.
  - `SyncEngine` gains: `retryFailed(): Promise<void>` and `discardFailed(): void`.
  - Replace `errKind` with `classify`:
    ```ts
    function classify(e: unknown): 'auth' | 'transport' | 'poison' {
      const x = e as { name?: string; kind?: string; status?: number }
      if (x?.name === 'HttpRepositoryError') {
        if (x.kind === 'auth') return 'auth'
        if (typeof x.status === 'number' && x.status >= 400 && x.status < 500) return 'poison'
        return 'transport'
      }
      return 'poison'
    }
    ```
  - Add count helpers + use them in the initial `state` and in `emit` (R-7):
    ```ts
    const countPending = () => outbox.list().filter((e) => !e.failedAt).length
    const countFailed = () => outbox.list().filter((e) => e.failedAt).length
    let state: SyncState = { online: connectivity.isOnline(), pending: countPending(), status: 'idle', conflicts: 0, failed: countFailed() }
    // …
    function emit(patch: Partial<SyncState>): void {
      state = { ...state, ...patch, pending: countPending(), failed: countFailed(), online: connectivity.isOnline() }
      for (const cb of subs) cb(state)
    }
    ```
  - `doFlush`: filter the worklist (R-2) and quarantine poison in the OUTER catch (R-6 — leave the inner conflict + delete/purge 404 catches as-is):
    ```ts
      let entries = outbox.list().filter((e) => !e.failedAt)
      while (entries.length > 0) {
        for (const entry of entries) {
          // … unchanged save (inner conflict) / delete / purge …
          } catch (e) {
            const kind = classify(e)
            if (kind === 'auth') { emit({ status: 'error', lastError: message(e) }); return }
            if (kind === 'transport') { scheduleRetry(); emit({ status: 'offline' }); return }
            outbox.markFailed(entry.collection, id, message(e)); emit({ lastFailedError: message(e) }) // poison → quarantine + continue
          }
          emit({})
        }
        entries = outbox.list().filter((e) => !e.failedAt)
      }
    ```
  - `pull`: change its `errKind(e) === 'transport'` to `classify(e) === 'transport'`.
  - Add the two methods + put them on the returned object:
    ```ts
    async function retryFailed(): Promise<void> { outbox.clearFailed(); await flush() }
    function discardFailed(): void { outbox.discardFailed(); emit({}) }
    // return { …, retryFailed, discardFailed }
    ```

- [ ] **Step 4: Verify (all green)**
```bash
pnpm --filter @oyl/all-of-oyl exec vitest run src/core/sync-engine.test.ts
pnpm --filter @oyl/all-of-oyl test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
```

- [ ] **Step 5: Commit**
```bash
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add packages/all-of-oyl/src/core/sync-engine.ts packages/all-of-oyl/src/core/sync-engine.test.ts
git commit -m "feat(all-of-oyl): classify poison errors → quarantine (filtered flush) + syncState.failed + retryFailed/discardFailed"
```

---

### Task 3: data.js passthrough + chip "N failed"

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`; Modify `apps/vanilla-oyl/src/components/oyl-sync-status.js`; Tests.

- [ ] **Step 1: data.js** — add `retryFailed`/`discardFailed` near `resync`:
```js
/** @returns {Promise<void>} */
function retryFailed() { return engine ? engine.retryFailed() : Promise.resolve() }
function discardFailed() { if (engine) engine.discardFailed() }
```
and append to the returned object (currently ends `…, migrationOffer, migrateLocal }`): `, retryFailed, discardFailed }`.

- [ ] **Step 2: chip failing test** — append to `oyl-sync-status.test.js`:
```js
it('shows N failed (danger) even when idle', () => {
  const { el } = mount({ online: true, pending: 0, status: 'idle', conflicts: 0, failed: 2 })
  expect(el.hasAttribute('hidden')).toBe(false)
  expect(el.shadowRoot.textContent).toContain('2 failed')
  el.remove()
})
```
(`mount` + `synced` are in the file; the new object just adds `failed`.)

- [ ] **Step 3: chip implement** — in `oyl-sync-status.js`, in the classifier function (named `toChip` per SP5d) add a **first** branch (precedence — R-5):
```js
if (s.failed > 0) return { tone: 'danger', text: `${s.failed} failed` }
```
(before the `syncing`/`error`/`offline`/`pending` branches, so it shows even when idle/syncing).

- [ ] **Step 4: Verify** + commit:
```bash
pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-sync-status.test.js src/state/data.test.js
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/components/oyl-sync-status.js apps/vanilla-oyl/src/components/oyl-sync-status.test.js
git commit -m "feat(vanilla-oyl): data.js retryFailed/discardFailed + chip 'N failed' branch"
```

---

### Task 4: Status Retry/Discard + main wiring

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-status-panel.js`; Modify `apps/vanilla-oyl/src/main.js`; Test `oyl-status-panel.test.js`.

- [ ] **Step 1: Failing test** — append to `oyl-status-panel.test.js`:
```js
describe('<oyl-status-panel> failed writes', () => {
  const diag = { schema: { status: 'ok' }, counts: {}, theme: { theme: 'classic', mode: 'system' }, build: 'dev' }
  const failedState = { online: true, pending: 0, status: 'idle', conflicts: 0, failed: 2, lastSyncedAt: new Date() }
  it('shows Retry + Discard when failed>0; clicks call handlers', async () => {
    let retried = false; let discarded = false
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal(failedState), onResync: () => {}, onRetryFailed: () => { retried = true }, onDiscardFailed: () => { discarded = true } }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    const retry = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="retry-failed"]'))
    const discard = /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-act="discard-failed"]'))
    expect(retry).toBeTruthy(); expect(discard).toBeTruthy()
    retry.click(); discard.click()
    expect(retried).toBe(true); expect(discarded).toBe(true)
    el.remove()
  })
  it('no Retry/Discard when failed is 0', async () => {
    const el = /** @type {any} */ (document.createElement('oyl-status-panel'))
    el.sync = { state: signal({ ...failedState, failed: 0 }), onResync: () => {}, onRetryFailed: () => {}, onDiscardFailed: () => {} }
    el.diagnostics = diag
    document.body.append(el)
    await Promise.resolve()
    expect(el.shadowRoot.querySelector('button[data-act="retry-failed"]')).toBeNull()
    el.remove()
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: oyl-status-panel** — in the `if (this.sync) { … }` block, after building `resyncBtn`, add a failed-info `<p>` + Retry + Discard buttons (created once, toggled by the track):
```js
      const failedInfo = document.createElement('p')
      const retryBtn = document.createElement('button')
      retryBtn.textContent = 'Retry'; retryBtn.dataset.act = 'retry-failed'
      retryBtn.addEventListener('click', () => this.sync?.onRetryFailed?.(), { signal: this.lifecycle })
      const discardBtn = document.createElement('button')
      discardBtn.textContent = 'Discard'; discardBtn.dataset.act = 'discard-failed'
      discardBtn.addEventListener('click', () => this.sync?.onDiscardFailed?.(), { signal: this.lifecycle })
```
In the existing `this.track(() => { … })`, after computing `s`, add (and include these nodes in `syncNodes`):
```js
        const hasFailed = !!s && s.failed > 0
        failedInfo.textContent = hasFailed ? `${s.failed} write(s) couldn't sync` : ''
        failedInfo.hidden = !hasFailed
        retryBtn.hidden = !hasFailed
        discardBtn.hidden = !hasFailed
```
Add `failedInfo, retryBtn, discardBtn` to the `syncNodes = [syncLabel, syncInfo, resyncBtn, …]` array. Extend the `sync` prop typedef on the panel to include `onRetryFailed?: () => void, onDiscardFailed?: () => void`.

- [ ] **Step 4: main.js** — extend the `panel.sync` object (the `mode === 'remote' ? { state, onResync } : null`):
```js
      panel.sync = mode === 'remote'
        ? { state: dataState.syncState, onResync: dataState.resync, onRetryFailed: () => void dataState.retryFailed(), onDiscardFailed: () => dataState.discardFailed() }
        : null
```

- [ ] **Step 5: Full gates** + commit:
```bash
pnpm vanilla test
pnpm vanilla typecheck
cd /Users/hynding/Workspace/Repositories/com/github/hynding/oyl
git add apps/vanilla-oyl/src/components/oyl-status-panel.js apps/vanilla-oyl/src/components/oyl-status-panel.test.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): Status Retry/Discard for failed writes + wire panel.sync handlers"
```

---

### Task 5: Acceptance (no-regression + forced-failed UI)

**Files:** none. The poison path is unit-proven (no per-op 4xx exists in the live backend). If servers/Docker unavailable, STOP and report — Tasks 1–4 are the deliverable.

- [ ] **Step 1:** Start native `pnpm strapi-app develop` :1340 + `pnpm vanilla dev` :8041; remote mode, sign in.
- [ ] **Step 2 (no regression):** add/edit entries → they sync; Status shows `Last synced …`, no failed UI; `syncState.failed` is 0.
- [ ] **Step 3 (forced-failed UI):** in the console, inject a failed outbox entry to exercise the UI — `localStorage.setItem('oyl/outbox', JSON.stringify([{ seq: 999, collection: 'entries', op: 'save', id: 'x', enqueuedAt: new Date().toISOString(), failedAt: new Date().toISOString(), error: 'forced' }]))` then reload → the chip shows "1 failed" (danger) and Status → Connection shows "1 write couldn't sync" + Retry + Discard. Click **Discard** → the entry is gone, chip clears. Report outcomes; stop servers.

---

## Notes for the implementer
- `src/` (Tasks 1–2): explicit `.js` imports; no DOM globals; `pnpm all-of build` is the gate.
- `classify` replaces `errKind` and goes in the **outer** per-entry catch only (R-6); leave the inner conflict-`resolveConflict` and `delete`/`purge` 404 catches untouched.
- The flush worklist MUST be `outbox.list().filter((e) => !e.failedAt)` in both the initial read and the `while` re-read (R-2) — else quarantined ops spin the loop.
- Initial `state` must seed `failed: 0` (via `countFailed()`) — required field (R-7).
- Backward-compatible: with no poison op, `failed` stays 0 and the failed UI is hidden.
