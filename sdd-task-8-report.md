# Task 8 Report — Retire `entries` alias; per-kind bootstrap repos

## Files Changed

| File | Change |
|---|---|
| `packages/all-of-oyl/src/collections.ts` | Removed `entries:` from COLLECTIONS and KINDS; removed `reviveEntry` from import (kept `revivePlan`) |
| `packages/all-of-oyl/src/collections.test.ts` | Replaced `kindOf('entries')` with `kindOf('notes')`; replaced "entries alias still exists" test with "entries alias is gone" using `@ts-expect-error` |
| `packages/all-of-oyl/src/fixtures/seed.ts` | Removed `entries: Record<string, unknown>[]` from `Seed` interface; replaced `entries: entries.map(e => e.toJSON())` + empty per-kind arrays with filtered per-kind splits |
| `packages/all-of-oyl/src/fixtures/fixtures.test.ts` | Added `const allEntryShapes = [...seed.notes, ...seed.consumptions, ...seed.transactions, ...seed.measurements, ...seed.activitySessions]`; replaced all `seed.entries` usages (×6) with `allEntryShapes`; updated length assertion to 263 |
| `apps/strapi-oyl/test/parity.test.ts` | Replaced `kindOf('entries')` with `kindOf('notes')` + `kindOf('consumptions')` |
| `apps/vanilla-oyl/src/storage/bootstrap.js` | Removed `entries: 'notes'` from PATH_BY_COLLECTION; updated ROW_KIND_BY_COLLECTION to all 5 per-kind collections; added `const BACKED = new Set(['notes', 'consumptions'])`; updated personal-repo loop to build real repos only for BACKED, else emptyRepo() |
| `apps/vanilla-oyl/src/storage/bootstrap.test.js` | Replaced `repos.entries` with `repos.notes`; replaced `PATH_BY_COLLECTION.entries` with `PATH_BY_COLLECTION.notes`; added `Consumption` import; added consumptions-enqueue test; added stub-repos (transactions/measurements/activitySessions) test |
| `apps/vanilla-oyl/src/state/data.test.js` | Replaced `ds.repos.entries.save(...)` with `ds.repos.notes.save(...)` |
| `apps/vanilla-oyl/src/storage/backup.test.js` | Replaced `dataKey('entries')` + `seed.entries.length` with `dataKey('notes')` + `seed.notes.length`; updated corrupt-payload test to use `notes` collection |
| `apps/vanilla-oyl/src/storage/seed.test.js` | Replaced `dataKey('entries')` + `seed.entries.length` with `dataKey('notes')` + `seed.notes.length` |

## Per-kind seed split counts (total = 263, verified by test)

The 42-day loop + showcase entries were split by `kind`:

| Kind | Collection | Count (approx) |
|---|---|---|
| `note` | `seed.notes` | Weekly reflections over 6 weeks (~6) |
| `consumption` | `seed.consumptions` | Breakfast every day + dinner most days + 1 ad-hoc ≈ ~84 |
| `transaction` | `seed.transactions` | Groceries every 3rd day + 1 refund ≈ ~15 |
| `measurement` | `seed.measurements` | 3 per day (weight/sleep/mood) + 3 DST cluster ≈ ~129 |
| `activity-session` | `seed.activitySessions` | 1 per day (run or meditate) ≈ ~42 |
| **Total** | | **263** |

The `expect(allEntryShapes).toHaveLength(263)` assertion passes — all shapes were preserved, none dropped.

## ROW_KIND / decode verification

`Consumption.fromJSON` calls `parseEntryBase(shape, 'consumption')` which validates `kind === 'consumption'`. Strapi rows do NOT carry a `kind` field. Therefore `strapiRowToShape(row, { kind: 'consumption' })` MUST inject `kind` for the decode to work. All per-kind Entry collections (`notes`, `consumptions`, `transactions`, `measurements`, `activitySessions`) require `rowKind` injection.

Result: `ROW_KIND_BY_COLLECTION` is populated for all 5 and used in the BACKED collections' `createServerPersonalRepository` call. Non-BACKED collections get `emptyRepo()` and bypass decode entirely.

## DoD Gate Outputs

1. `pnpm --filter @oyl/all-of-oyl test collections fixtures` → **26 tests passed (2 files)**
2. `pnpm all-of typecheck:src` → **clean (no errors)**
3. `pnpm all-of build` → **clean; dist/ is bare-import free**
4. `pnpm --filter @oyl/strapi-oyl-app exec vitest run test/parity.test.ts` → **17 tests passed (1 file)**
5. `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test` → **352 tests passed (77 files); typecheck clean**

## Grep for residual entries

`COLLECTIONS.entries`, `KINDS[...entries]`, `repos.entries`, `seed.entries`, `PATH_BY_COLLECTION.entries`, `kindOf(...entries)` — **zero remaining** in src/test files (excludes: local `const entries` array in seed.ts, `Object.entries`, `this.entries` in journal.ts, comment prose — all legitimate).

## Concerns

None. All gates green. The `@ts-expect-error` in collections.test.ts is the correct pattern for asserting that a removed key no longer exists on the type.

`.git/sdd/` directory was not writable — report written to `sdd-task-8-report.md` in the repo root instead.
