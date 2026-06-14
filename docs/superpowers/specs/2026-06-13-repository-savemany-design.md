# Repository.saveMany (atomic batch save) — Design

**Date:** 2026-06-13
**Status:** Approved
**Builds on:** the `Repository<T>` port (`packages/all-of-oyl/src/core/repository.ts`) and its two adapters; consumed by `PlannerStore.complete`.

## Purpose

Add an **atomic batch save** to the persistence port so an app can persist several records of one collection as a single all-or-nothing write. This closes the one real correctness gap in the vanilla-oyl app: `PlannerStore.complete` currently does two separate `save` calls (the completed plan + a recurring successor); if the second fails, the recurring chain breaks silently. With `saveMany`, both persist together or neither does.

## The contract

Add one method to `Repository<T>`:

```ts
/**
 * Atomically persist several items of this collection. All-or-nothing: every item is
 * stamped and stored, or — on any REVISION_CONFLICT or write error — none are and the
 * call rejects. Per-item semantics match save() (create on unknown id → revision 1;
 * otherwise stale-revision → REVISION_CONFLICT, else revision bumps). Returns the
 * stamped items in input order. Empty input → [].
 */
saveMany(items: T[]): Promise<T[]>
```

Both existing adapters implement it; the shared **repository contract suite** gains cases that every adapter must pass.

### Atomicity semantics
- **All-or-nothing.** Validation (id lookup + revision check + meta stamping) happens for *every* item against the pre-call store **before** any write is committed. If any item is stale → `REVISION_CONFLICT`, the call rejects and the store is unchanged.
- **Single collection.** `saveMany` operates on one repository (one collection), which is exactly what `PlannerStore.complete` needs (completed plan + successor are both `plans`). Cross-collection atomicity is out of scope.
- **Ordering / duplicates.** Items are processed in order against the pre-call snapshot; a batch is not expected to contain two items with the same id (undefined-but-safe: last-processed wins on the in-memory snapshot, but this isn't a supported use). Empty array is a no-op returning `[]`.
- **Meta.** Each item is stamped exactly as `save()` would (clone-or-alias per the adapter's existing convention): `LocalStorageRepository` clones via the codec; `InMemoryRepository` aliases. The contract asserts behavior off the **returned** items.

## Adapter implementations

- **`InMemoryRepository.saveMany`**: compute each item's next state (create vs revision-bumped, with conflict checks against the live map) into a staged list; if all pass, apply them all (set meta + store); else throw before mutating anything.
- **`LocalStorageRepository.saveMany`**: `readAll()` once into a working array; for each item, find-or-append with the same create/conflict/bump logic as `save`, cloning via the codec; after all items succeed, **one** `writeAll(working)` (a single `setItem`) — inherently atomic for a single-key collection. A conflict throws before the write; a quota error on the single `setItem` leaves storage untouched.

## Consumer change: PlannerStore.complete

Replace the two sequential saves with one batch:

```js
const completed = planner.get(id)
const batch = completed ? (successor ? [completed, successor] : [completed]) : []
if (batch.length) await plansRepo.saveMany(batch)
```

The existing `try/catch → hydrate() (rollback) → rethrow` stays — but now the failure is genuinely all-or-nothing, so a failed `saveMany` leaves the repo unchanged and the rollback restores the exact prior state (no half-completed recurring chain). The method's "non-atomic persistence" doc note is removed/replaced.

## Testing

- **Repository contract suite** (run against both `InMemoryRepository` and `LocalStorageRepository`): `saveMany` stamps fresh meta on all-new items (each revision 1) and persists all; `saveMany([])` → `[]`; a mixed create+update batch stamps correctly; **atomic conflict** — a batch containing one stale-revision item rejects `REVISION_CONFLICT` and persists *none* of the batch (verified via `list()`); returns items in input order.
- **PlannerStore** (existing tests stay green): the recurring-complete test still persists both plans; the failed-save rollback test still restores the open state (now via the atomic `saveMany` path). Optionally add a case asserting a failed `saveMany` on complete leaves *both* the completion and successor unpersisted (true atomicity through the store).

## Out of scope
Cross-collection transactions; a `deleteMany`/`purgeMany`; changing `save()`’s single-item semantics. Only `saveMany` is added.

## Build sequence (for the plan)
`saveMany` on the interface + `InMemoryRepository` + the contract cases (one task) → `LocalStorageRepository.saveMany` (passes the same contract) → `PlannerStore.complete` uses it + doc note updated + planner tests green.
