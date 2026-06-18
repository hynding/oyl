# Rename `Food` → `Consumable` — design

**Date:** 2026-06-18
**Status:** Approved (brainstorming)
**Scope:** `@oyl/all-of-oyl` domain core + `apps/vanilla-oyl`. No backend code change.

## Goal

Rename the nutrition catalog type `Food` to `Consumable` (and the collection `foods` → `consumables`), so the catalog name pairs with the existing `Consumption` log ("you consume a *Consumable*") and honestly covers drinks, water, and supplements — not just food. Carry the rename through the provenance link field (`foodId` → `consumableId`) in both `Consumption` and `PlannedMeal`.

## Why now / why a clean break

The catalog already pairs awkwardly: the log entry is `Consumption` ("something you ate **or drank**"), and `Nutrients` includes `waterMl`, so "Food" is already a misnomer. The project is pre-adoption, so **existing `foods` data may be discarded** rather than migrated (decision confirmed during brainstorming). That collapses what would otherwise be a schema-migration project into a **pure mechanical rename plus a one-time operational data reset**:

- **No migration code** (the repo has a schema-version *marker*, `CURRENT_SCHEMA_VERSION`, but no migration-application framework, and we are not adding one here).
- **No schema-version bump** — fresh data writes cleanly under the new names.
- **No dual-read / backward-compat** for the old `foodId` field.
- **No backend code change** — `oyl-record` stores opaque bodies and an opaque `collection` string; the rename is just different data the client sends.

## Separation-of-concerns improvement (in scope)

The nutrient value-object helpers currently live in `nutrition/food.ts` but are shared (Consumable carries them; Consumption snapshots them). As part of this work, extract them to a new **`nutrition/nutrients.ts`**: the `Nutrients` type, `NUTRIENT_METRICS`, `assertNutrients`, `nutrientsFromJSON`, `nutrientsToJSON`. `consumable.ts` and `consumption.ts` both import from `./nutrients.js`. This is the one structural improvement bundled with the rename; nothing else is refactored.

## Rename surface

### `@oyl/all-of-oyl/src`

| File | Change |
|---|---|
| `nutrition/nutrients.ts` | **New.** Holds `Nutrients`, `NUTRIENT_METRICS`, `assertNutrients`, `nutrientsFromJSON`, `nutrientsToJSON` (moved out of `food.ts`). |
| `nutrition/food.ts` → `nutrition/consumable.ts` | Rename file; class `Food` → `Consumable`; import nutrient helpers from `./nutrients.js`. |
| `nutrition/consumption.ts` | Import nutrient helpers from `./nutrients.js`; `readonly foodId?` → `consumableId?`; ctor `food?: {id, nutrients}` param → `consumable?`; `toJSON`/`fromJSON` key `foodId` → `consumableId`; JSDoc ("snapshot from the Consumable", "`consumableId` is provenance"). |
| `plan/planned-meal.ts` | `readonly foodId` → `consumableId`; ctor `food?`/`foodId?` params → `consumable?`/`consumableId?`; `resolved`/error messages ("references a consumable", "conflicting consumable provenance"); `toJSON`/`fromJSON` key; the grocery-list "per food id" comments → "per consumable id". |
| `collections.ts` | `import { Consumable } from './nutrition/consumable.js'`; collection key `foods:` → `consumables:`. |
| `index.ts` | Export `Consumable` + `makeConsumable` (was `Food`/`makeFood`); export the nutrient helpers from `./nutrition/nutrients.js`. |
| `fixtures/seed.ts` | `Seed.foods` field → `consumables`; demo data `foods: [...]` → `consumables: [...]`. |
| `fixtures/builders.ts` | `makeFood` → `makeConsumable`; the consumption/planned-meal builders' `food` overrides → `consumable`. |
| Tests | `nutrition/food.test.ts` → `consumable.test.ts`; new `nutrients.test.ts` if helpers had dedicated cases (else fold into consumable.test.ts); update `consumption.test.ts`, `plan/planned-meal.test.ts`, `collections.test.ts` (the `Seed`↔`COLLECTIONS` key-mirror assertion now expects `consumables`), `fixtures/fixtures.test.ts`, and `index.test.ts` if it references `Food`. |

**Gotcha:** `collections.test.ts` enforces that `COLLECTIONS` keys mirror the `Seed` shape exactly — both the manifest key (`consumables`) and `Seed.consumables` must change together or that test fails.

### `apps/vanilla-oyl/src`

| File | Change |
|---|---|
| `state/foods-store.js` → `state/consumables-store.js` | `createFoodsStore` → `createConsumablesStore`; `repos.foods` → `repos.consumables`. |
| `state/data.js` | The store wiring: `foods: createConsumablesStore(repos.consumables, …)` (property on the returned data state becomes `consumables`); any `repos.foods` → `repos.consumables`. |
| `main.js` | Nutrition route factory: `view.foods` → `view.consumables` (and the import of the store). |
| `components/oyl-food-form.js` → `oyl-consumable-form.js` | Class `OylFoodForm` → `OylConsumableForm`; `defineFoodForm` → `defineConsumableForm`; custom-element tag `oyl-food-form` → `oyl-consumable-form`. |
| `components/oyl-nutrition-composer.js` | Store typedef + `this.foods` → `consumables`; the "From food" radio + `name="food"`/`aria-label="Food"` select → "From consumable" / `name="consumable"` / `aria-label="Consumable"`. |
| `components/oyl-nutrition.js` | Store ref + `oyl-consumable-form` usage; user-facing labels. |
| Tests | Rename `foods-store.test.js` → `consumables-store.test.js`, `oyl-food-form.test.js` → `oyl-consumable-form.test.js`; update `oyl-nutrition*.test.js`. |

### UI labels

User-facing copy becomes **"Consumable" / "Consumables"** (matching the model; drinks/water aren't "food"). Applies to the nutrition screen's catalog heading, the composer's "From consumable" picker, and the add-consumable form.

### Backend (`apps/strapi-oyl`)

No code change. The `collection` field is an opaque string.

## Operational reset (replaces migration)

A one-time, documented step (the rename discards old `foods` data rather than migrating it):
- **Client:** clear OYL `localStorage` (the `oyl/*` keys) — e.g. the Status screen's "Reset local data", or `localStorage.clear()`.
- **Backend:** `docker compose down -v` (drops the Postgres volume), or delete `apps/strapi-oyl/.tmp/data.db` for native dev.

After reset, the app starts fresh with the `consumables` collection.

## Testing

- Domain: `Consumable` round-trips (renamed `consumable.test.ts`); `Consumption` and `PlannedMeal` round-trip `consumableId`; `collections.test.ts` green with the `consumables` key/Seed mirror; `nutrients.ts` helpers covered (moved tests still pass).
- App: `consumables-store` CRUD; `oyl-consumable-form` submit; `oyl-nutrition`/composer render against the renamed store via their own shadowRoots.
- These are renames of existing tests asserting the same behavior under new names — not new behavior.

## Definition of Done

- `pnpm --filter @oyl/all-of-oyl test`, `pnpm all-of typecheck:src`, `pnpm all-of build` (DOM-safety) green.
- `pnpm vanilla test`, `pnpm vanilla typecheck`, `pnpm vanilla build:lib` green.
- Backend unaffected (no code change).
- A final case-insensitive sweep — `grep -rniE '\bfoods?\b|foodId' packages/all-of-oyl/src apps/vanilla-oyl/src` — returns nothing (no stray `Food`/`foods`/`foodId` references survive).
- `CLAUDE.md` updated: the nutrition note ("Food catalog + Consumption logging" → "Consumable catalog + Consumption logging"), `state/foods-store.js` → `consumables-store.js`, and the `@oyl/all-of-oyl/format`/entry-kind references that mention food.

## Out of scope

- Any data migration or backward-compat reading of `foods`/`foodId` (clean break by decision).
- Splitting nutrition into further modules beyond the `nutrients.ts` extraction.
- Backend/protocol changes.
