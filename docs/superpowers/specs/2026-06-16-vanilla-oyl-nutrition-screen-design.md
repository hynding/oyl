# Nutrition screen (`/nutrition`)

**Date:** 2026-06-16
**Status:** Approved — ready for planning
**Packages:** `@oyl/all-of-oyl` (small additions), `apps/vanilla-oyl` (the screen)

> Sub-project #3 of a 3-part program (formatters → account balance/spend → **Nutrition screen**). Consumes #1's `@oyl/all-of-oyl/format` subpath.

## Goal

Surface the existing, fully-built `Food`/`Consumption` nutrition domain as a
day-scoped Nutrition screen: log what you ate (from the foods catalog or
ad-hoc), see the day's nutrient totals, and manage a foods catalog. Structurally
a twin of the Finance screen (`Consumption` is an `Entry` like `Transaction`;
`Food` is a catalog like `Account`).

## Scope (v1, all approved)

Log from the foods catalog, daily nutrient totals, foods catalog management
(add/remove), and ad-hoc logging. **Out of scope:** calorie/macro goals,
editing logged consumptions or foods (add/remove only), search/barcode.

## Domain facts (no change needed beyond two small helpers)

- `Food` (catalog, collection `foods`): `{ id, name, nutrients: Nutrients }`,
  per-serving. `Nutrients = { calories?, protein?, carbs?, fat?, waterMl? }`.
- `Consumption extends Entry` (kind `consumption`, collection `entries`):
  snapshots `nutrients` × `servings`, optional `foodId` provenance, optional
  `note`; `metrics()` emits `nutrition.* × servings`. Constructible from a food
  (`food: { id, nutrients }`) or ad-hoc (`nutrients` directly).
- Both are already in `COLLECTIONS`, the reviver, and the seed (Oatmeal,
  Chicken Bowl + seeded consumptions) — so `?seed` populates the screen.

## Design

### Core additions (`@oyl/all-of-oyl`)

1. `src/nutrition/totals.ts` — `sumNutrients(consumptions: readonly Consumption[]): Nutrients`.
   Sums `nutrients[field] × servings` for each field in `NUTRIENT_METRICS`,
   omitting fields no consumption has. Type-only `Consumption` import; runtime
   `NUTRIENT_METRICS` import. Exported from the barrel. (Aggregation in the
   domain, per sub-project #2's lesson; framework-free + reusable.)
   - **R4:** `sumNutrients` and the journal's `nutrition.*` metric totals both
     derive from `NUTRIENT_METRICS`, so the screen's totals and Insights'
     calories never diverge.
2. `src/format/nutrition.ts` — `formatNutrients(n: Nutrients): string`, a compact
   summary (e.g. `"150 kcal · 5g P · 27g C · 3g F"`, water appended when
   present, `""` when all empty). Re-exported from `src/format/index.ts`.
   **(R1)** Value-formatting lives in the shared `@oyl/all-of-oyl/format`
   subpath, consistent with sub-project #1 — NOT an app-side formatter.
   Type-only `Nutrients` import → DOM-safe; passes `pnpm all-of build`.

### App stores

- `state/foods-store.js` — catalog store over `repos.foods`, a near-clone of
  `state/accounts-store.js` (`add`/`remove`/`all`/`hydrate` + `revision`).
- `state/journal-store.js` — add two reactive methods:
  - `consumptionsOn(day)` → `entriesOn(day)` filtered to `Consumption`
    (mirrors `transactionsIn`). Imports `Consumption`.
  - `dailyNutrients(day)` → `sumNutrients(this.consumptionsOn(day))`. Imports
    `sumNutrients`.
- `state/data.js` — create `foods` from `repos.foods` and expose it on the data
  state, passed to the screen (mirroring `accounts`).

### Components (3 new + 1 edit, mirroring Finance/Journal)

- `components/oyl-nutrition.js` — the screen. Day nav (prev/next + "Today",
  copied from `oyl-journal`'s `_day` signal + `_go`/`_navButton`), a **daily
  totals** strip (`dailyNutrients(day)` via `formatNutrients`, calories
  prominent), the day's **consumption list** (rendered inline; each row resolves
  its food name from the catalog by `foodId`, falling back to `note`/nutrients
  when the food was deleted or it's ad-hoc; delete via `store.remove`), and a
  **Foods catalog** section (the food form + the list of foods with their
  nutrients; remove via `foods.remove`). Props: `store` (journal), `foods`
  (foods-store), `tz`.
- `components/oyl-nutrition-composer.js` — log a `Consumption`. A mode toggle
  **From food** (a `<select>` of `foods.all()` + servings) / **Ad-hoc** (note as
  the meal name + nutrient inputs + servings), and a **"When"** datetime
  defaulting to the viewed day at current time via a `getDay` callback
  (**R2** — mirrors `oyl-log-form` so logging respects the viewed day). On
  submit: `new Consumption({ occurredAt, food: { id, nutrients } | nutrients,
  servings, note? })` → `store.add`.
- `components/oyl-food-form.js` — add a `Food` (name + per-serving nutrient
  number inputs) → `foods.add(new Food({ name, nutrients }))`.
- `components/oyl-journal.js:90` — **R3:** extend the day-list filter to
  `e.kind !== 'transaction' && e.kind !== 'consumption'`, so consumptions live
  only on Nutrition (mirroring how transactions moved to Finance). Empty-state
  copy ("note or a measurement") is unchanged.

### Wiring

- `main.js` — `defineNutrition()`; a `nutrition:` route factory creating
  `<oyl-nutrition>` with `store = dataState.journal`, `foods = dataState.foods`,
  `tz`.
- `components/oyl-nav.js` — add `['nutrition', 'Nutrition']` to `ITEMS` (after
  `journal`).

### File-size note (R5)

If `oyl-nutrition.js` exceeds ~200 lines, split the Foods-catalog section into
its own sub-component. Otherwise keep it inline (as Finance renders accounts
inline).

## Testing

- **Core:** `src/nutrition/totals.test.ts` (`sumNutrients`: multi-consumption,
  servings scaling, partial/missing fields, empty → `{}`); `src/format/nutrition.test.ts`
  (`formatNutrients`: full, partial, empty).
- **App:** `state/foods-store.test.js` (add/remove/all/hydrate);
  `state/journal-store.test.js` — add `consumptionsOn`/`dailyNutrients` cases
  (reactive, filters to Consumption, correct totals); component tests for
  `oyl-nutrition-composer` and `oyl-food-form` (assert via their own
  shadowRoot/props per the shadow-DOM convention — drive the form, assert the
  store received the right `Consumption`/`Food`); `oyl-journal.test.js` — add/
  confirm a case that a `consumption` entry does **not** appear in the day-list.

## Definition of Done

- `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green.
- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- `/nutrition` deep-loads: nav has a Nutrition tab; logging from a food and
  ad-hoc both add a consumption visible in the day's list with updated totals;
  adding/removing a food works; consumptions no longer appear in Journal.
- One nutrient formatter, in `@oyl/all-of-oyl/format`; aggregation
  (`sumNutrients`) in core, not the app.
