# Repository.saveMany Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an atomic `saveMany(items): Promise<T[]>` to the `Repository<T>` port (both adapters + shared contract), then use it in `PlannerStore.complete` so a completed plan and its recurring successor persist all-or-nothing.

**Architecture:** One method added to the `Repository` interface; `InMemoryRepository` stages-then-applies (validate all before mutating), `LocalStorageRepository` builds a working array then does a single `setItem` (inherently atomic for a single-key collection). The shared repository contract suite gains atomicity cases both adapters must pass. `PlannerStore.complete` replaces its two sequential `save` calls with one `saveMany`.

**Tech Stack:** TypeScript (all-of-oyl strict), Vitest; vanilla-oyl app (`PlannerStore`).

**Spec:** `docs/superpowers/specs/2026-06-13-repository-savemany-design.md`

---

## Conventions
- all-of-oyl tests: `pnpm --filter @oyl/all-of-oyl test` (or `… exec vitest run <pattern>`); typecheck: `pnpm --filter @oyl/all-of-oyl typecheck:src`; build: `pnpm --filter @oyl/all-of-oyl build`.
- app tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`; typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- all-of-oyl `src/` is NodeNext: all relative imports carry `.js` extensions. Strict TS (`noUncheckedIndexedAccess` etc.).

## File structure
- Modify `packages/all-of-oyl/src/core/repository.ts` — add `saveMany` to the interface.
- Modify `packages/all-of-oyl/src/core/in-memory-repository.ts` — implement `saveMany` (stage-then-apply).
- Modify `packages/all-of-oyl/src/core/local-storage-repository.ts` — implement `saveMany` (working array + single write).
- Modify `packages/all-of-oyl/src/core/repository-contract.ts` — add `saveMany` contract cases (run against both adapters).
- Modify `apps/vanilla-oyl/src/state/planner-store.js` — use `saveMany` in `complete`; update the doc note.
- Modify `apps/vanilla-oyl/src/state/planner-store.test.js` — add an atomicity case for `complete`.

---

# Task 1: `saveMany` on the Repository port (interface + both adapters + contract)

Adding the method to the interface forces both adapters to implement it (or they stop satisfying `implements Repository<T>` and tsc fails), and the shared contract runs against both — so this is one cohesive change.

**Files:**
- Modify: `packages/all-of-oyl/src/core/repository-contract.ts`
- Modify: `packages/all-of-oyl/src/core/repository.ts`
- Modify: `packages/all-of-oyl/src/core/in-memory-repository.ts`
- Modify: `packages/all-of-oyl/src/core/local-storage-repository.ts`

- [ ] **Step 1: Add the failing contract cases**

In `packages/all-of-oyl/src/core/repository-contract.ts`, inside the `describe(\`${label} (repository contract)\`, ...)` block (after the existing `it(...)` cases, before the closing `})`), add:

```ts
    it('saveMany stamps fresh meta on all items and persists them', async () => {
      const repo = makeRepo()
      const saved = await repo.saveMany([
        new LifeArea({ name: 'A', slug: 'a' }),
        new LifeArea({ name: 'B', slug: 'b' }),
      ])
      expect(saved).toHaveLength(2)
      expect(saved[0]?.meta?.revision).toBe(1)
      expect(saved[1]?.meta?.revision).toBe(1)
      expect(await repo.list()).toHaveLength(2)
    })

    it('saveMany([]) is a no-op returning []', async () => {
      expect(await makeRepo().saveMany([])).toEqual([])
    })

    it('saveMany handles a mixed create + update batch', async () => {
      const repo = makeRepo()
      const a = await repo.save(new LifeArea({ name: 'A', slug: 'a' })) // revision 1
      const b = new LifeArea({ name: 'B', slug: 'b' }) // new
      const [ua, ub] = await repo.saveMany([a, b])
      expect(ua?.meta?.revision).toBe(2)
      expect(ub?.meta?.revision).toBe(1)
      expect(await repo.list()).toHaveLength(2)
    })

    it('saveMany is atomic: a stale item rejects and persists none of the batch', async () => {
      const repo = makeRepo()
      const a = await repo.save(new LifeArea({ name: 'A', slug: 'a' })) // revision 1
      const stale = LifeArea.fromJSON(a.toJSON()) // snapshot at revision 1
      await repo.save(a) // store now at revision 2; `stale` is behind
      const fresh = new LifeArea({ name: 'C', slug: 'c' }) // new — must NOT leak
      await expect(repo.saveMany([fresh, stale])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
      const all = await repo.list()
      expect(all).toHaveLength(1) // only the original A
      expect(all.find((x) => x.slug === 'c')).toBeUndefined() // fresh was staged but not committed
    })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run repository-contract local-storage-repository`
Expected: FAIL — `repo.saveMany is not a function` for both `InMemoryRepository` and `LocalStorageRepository`.

- [ ] **Step 3: Add `saveMany` to the interface**

In `packages/all-of-oyl/src/core/repository.ts`, add the method to the `Repository<T>` interface (after `save`):

```ts
  /**
   * Atomically persist several items of this collection. All-or-nothing: every item is
   * stamped and stored, or — on any REVISION_CONFLICT or write error — none are. Per-item
   * semantics match save() (unknown id → revision 1; else stale → REVISION_CONFLICT, else
   * revision bumps). Returns the stamped items in input order; [] for empty input.
   */
  saveMany(items: T[]): Promise<T[]>
```

- [ ] **Step 4: Implement `InMemoryRepository.saveMany` (stage-then-apply)**

In `packages/all-of-oyl/src/core/in-memory-repository.ts`, add this method to the class (after `save`):

```ts
  async saveMany(items: T[]): Promise<T[]> {
    const now = this.clock()
    // Stage every item (validate + compute next meta) against the live map BEFORE mutating,
    // so a conflict on any item leaves the store untouched (all-or-nothing).
    const staged = items.map((item) => {
      const stored = this.records.get(item.id)
      if (!stored) {
        return { item, meta: { createdAt: now, updatedAt: now, revision: 1 } }
      }
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      return {
        item,
        meta: { createdAt: stored.meta?.createdAt ?? now, updatedAt: now, revision: (stored.meta?.revision ?? 0) + 1 },
      }
    })
    for (const { item, meta } of staged) {
      item.meta = meta
      this.records.set(item.id, item)
    }
    return staged.map((s) => s.item)
  }
```

(If `DomainError` isn't already imported in this file, it is — `save` uses it. The `meta` object shape matches `PersistedMeta`.)

- [ ] **Step 5: Implement `LocalStorageRepository.saveMany` (working array + single write)**

In `packages/all-of-oyl/src/core/local-storage-repository.ts`, add this method to the class (after `save`):

```ts
  async saveMany(items: T[]): Promise<T[]> {
    const all = this.readAll()
    const now = this.clock()
    const result: T[] = []
    for (const item of items) {
      const idx = all.findIndex((i) => i.id === item.id)
      const next = this.codec.fromJSON(this.codec.toJSON(item)) // clone
      if (idx === -1) {
        next.meta = { createdAt: now, updatedAt: now, revision: 1 }
        all.push(next)
      } else {
        const stored = all[idx]!
        if (item.meta?.revision !== stored.meta?.revision) {
          throw new DomainError(
            'REVISION_CONFLICT',
            `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
          )
        }
        next.meta = { createdAt: stored.meta?.createdAt ?? now, updatedAt: now, revision: (stored.meta?.revision ?? 0) + 1 }
        all[idx] = next
      }
      result.push(next)
    }
    this.writeAll(all) // single setItem AFTER all items validated — atomic for a one-key collection
    return result
  }
```

(A conflict throws inside the loop, before `writeAll`, so storage is untouched. `all[idx]!` mirrors the non-null assertion `save()` already uses under `noUncheckedIndexedAccess`.)

- [ ] **Step 6: Run the contract against both adapters**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run repository-contract local-storage-repository in-memory-repository`
Expected: PASS — the 4 new `saveMany` cases pass for BOTH `InMemoryRepository` and `LocalStorageRepository` (8 new assertions total across the two contract runs), plus the existing cases.

- [ ] **Step 7: Full all-of-oyl gates**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl typecheck:src && pnpm --filter @oyl/all-of-oyl build`
Expected: all tests PASS (363 prior + the new contract cases, run against both adapters); `typecheck:src` clean; build prints `dist/ is bare-import free.`

- [ ] **Step 8: Commit**

```bash
git add packages/all-of-oyl/src/core/repository.ts packages/all-of-oyl/src/core/in-memory-repository.ts packages/all-of-oyl/src/core/local-storage-repository.ts packages/all-of-oyl/src/core/repository-contract.ts
git commit -m "feat(all-of-oyl): Repository.saveMany — atomic batch save (both adapters + contract)"
```

---

# Task 2: PlannerStore.complete uses `saveMany`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/planner-store.test.js`
- Modify: `apps/vanilla-oyl/src/state/planner-store.js`

- [ ] **Step 1: Add the failing atomicity test**

In `apps/vanilla-oyl/src/state/planner-store.test.js`, add this case inside the existing `describe('createPlannerStore', ...)` block (the `setup()` helper with `fail()` and the `task`/`DUE` helpers already exist there):

```js
  it('complete is atomic: a failing save persists neither the completion nor the successor', async () => {
    const { repo, fail } = setup()
    const store = createPlannerStore(repo)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t)
    fail()
    await expect(store.complete(t.id, DUE)).rejects.toThrow('quota')
    expect(store.get(t.id)?.status).toBe('open') // completion rolled back
    expect(await repo.list()).toHaveLength(1) // no successor leaked — atomic
  })
```

- [ ] **Step 2: Run to verify it (currently) passes or fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store`
Expected: with the CURRENT two-save `complete`, this case may already pass for the rollback assertion but the **atomicity** is incidental (the first `save` throws because `fail()` makes *all* writes throw, so the successor never gets written anyway). To make the test meaningfully drive the change, it must also hold when only the *second* write fails. Strengthen the test to fail-on-second-write:

Replace the `setup()` usage in THIS test with a fail-after-N-writes variant. Update the test to:

```js
  it('complete is atomic: a failing successor save persists neither plan', async () => {
    const map = new Map()
    let writeCount = 0
    const storage = {
      /** @param {string} k */ getItem: (k) => map.get(k) ?? null,
      /** @param {string} k @param {string} v */ setItem: (k, v) => {
        // fail only the write that would persist the completion+successor (after the initial add)
        if (writeCount++ >= 1) throw new Error('quota')
        map.set(k, v)
      },
    }
    const repo = new LocalStorageRepository(storage, 'oyl/data/plans', /** @type {any} */ (COLLECTIONS.plans))
    const store = createPlannerStore(repo)
    const t = task('Water', { cadence: Cadence.of(1, 'weeks') })
    await store.add(t) // writeCount: 0 → persisted
    await expect(store.complete(t.id, DUE)).rejects.toThrow('quota') // the complete write fails
    expect(store.get(t.id)?.status).toBe('open')
    expect(await repo.list()).toHaveLength(1) // single plan, open — no partial completion, no successor
  })
```

This proves atomicity precisely: `add` does one write (succeeds); `complete` does ONE `saveMany` write (fails) — so with the OLD two-save code the completion's first `save` would have already persisted before the successor's `save` failed, leaking a done plan. With `saveMany` (single write) nothing persists. (Note: this requires `complete` to use a single batched write; see Step 3/4.)

- [ ] **Step 3: Run to verify it fails against the current two-save implementation**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store -- -t "atomic"`
(or run the whole file: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store`)
Expected: FAIL — with the current two `save` calls, `add` is write #0 (ok), the completed plan's `save` is write #1 (throws). The completed plan was mutated in memory and the first `save` threw *before persisting*, so actually... verify the exact failure. If the current code happens to pass, the single-write switch in Step 4 still makes the intent explicit. Either way, proceed to Step 4 and confirm GREEN after.

- [ ] **Step 4: Switch `complete` to a single `saveMany`**

In `apps/vanilla-oyl/src/state/planner-store.js`, replace the `complete` method. The current method:

```js
    /**
     * Complete a plan; recurring tasks respawn a successor (domain). On save failure we
     * re-hydrate (rollback) and rethrow.
     *
     * KNOWN LIMITATION (non-atomic persistence): the completed plan and the successor are
     * two separate `save` calls — `Repository` has no batch write. If `save(completed)`
     * succeeds but `save(successor)` then fails, the re-hydrate reflects a done plan with
     * no successor: the recurring chain breaks silently (a retry hits ILLEGAL_TRANSITION).
     * Narrow trigger (a quota error landing between two synchronous localStorage writes).
     * Proper fix: an atomic `saveMany` on the shared Repository — tracked follow-up.
     * @param {Id} id @param {DayKey} on @returns {Promise<Task | undefined>}
     */
    async complete(id, on) {
      const successor = planner.complete(id, on)
      try {
        const completed = planner.get(id)
        if (completed) await plansRepo.save(completed)
        if (successor) await plansRepo.save(successor)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return successor
    },
```

becomes:

```js
    /**
     * Complete a plan; recurring tasks respawn a successor (domain). The completed plan
     * and any successor are persisted ATOMICALLY via saveMany (both or neither). On a
     * save failure we re-hydrate (rollback to the persisted truth) and rethrow.
     * @param {Id} id @param {DayKey} on @returns {Promise<Task | undefined>}
     */
    async complete(id, on) {
      const successor = planner.complete(id, on)
      const completed = planner.get(id)
      /** @type {Plan[]} */
      const batch = []
      if (completed) batch.push(completed)
      if (successor) batch.push(successor)
      try {
        if (batch.length) await plansRepo.saveMany(batch)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return successor
    },
```

(The `Plan` typedef is already declared at the top of the file via `@typedef {import('@oyl/all-of-oyl').Plan} Plan`. `PlansRepo` is `Repository<Plan>`, which now has `saveMany`.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run planner-store`
Expected: PASS — all planner-store cases, including the new atomicity case (single `saveMany` write fails → nothing persisted → `list()` length 1, status open) and the existing recurring-complete + rollback cases.

- [ ] **Step 6: Full app + all-of gates**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit && pnpm --filter @oyl/all-of-oyl test`
Expected: app suite PASS (98 prior + 1 new = 99), tsc exit 0, all-of-oyl PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/vanilla-oyl/src/state/planner-store.js apps/vanilla-oyl/src/state/planner-store.test.js
git commit -m "fix(vanilla-oyl): PlannerStore.complete persists completion+successor atomically via saveMany"
```

---

# Task 3: Verify + finish

- [ ] **Step 1: Final full verification**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl build && pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: all green; build bare-import free.

- [ ] **Step 2: Integrate** via `superpowers:finishing-a-development-branch`.

---

## Self-review notes (addressed in this plan)
- **Spec coverage:** interface method (T1 S3); InMemory + LocalStorage impls with atomic semantics (T1 S4–S5); contract cases incl. the atomic-conflict-persists-none case run against both adapters (T1 S1); PlannerStore.complete uses saveMany + doc note replaced (T2 S4); planner atomicity test (T2 S1–S2); out-of-scope (deleteMany/cross-collection) not added.
- **Type consistency:** `saveMany(items: T[]): Promise<T[]>` identical across interface + both adapters; `REVISION_CONFLICT` `DomainError` code reused; `all[idx]!` mirrors existing `save()`; planner `batch` typed `Plan[]`.
- **Atomicity is genuinely tested:** the contract's stale-item-second case proves no partial commit; the planner test fails the single batched write (write #1) to prove neither plan persists — which only holds with the single-`saveMany` switch.
