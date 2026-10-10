# `apps/stencil-oyl` Nutrition screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/nutrition` placeholder in `apps/stencil-oyl` with the redesigned Nutrition screen (day nav with dots, five total tiles, catalog/ad-hoc meal composer, meal rows with inline delete, catalog section with a collapsed add form), adding `ui-select` to `@oyl/ui-oyl`. Same domain behavior as vanilla's nutrition; vanilla untouched.

**Architecture:** `oyl-nutrition` owns the day signal and one `effect` over the journal + consumables stores; `oyl-day-nav` is reused; `oyl-meal-form` and `oyl-consumable-form` submit through native `<form>`s on form-associated primitives; `oyl-meal-row` emits `remove`.

**Tech Stack:** as sub-projects 2–4.

**Spec:** `docs/superpowers/specs/2026-10-08-stencil-oyl-nutrition-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-nutrition` (stacked on `feat/stencil-oyl-planner`; spec commit `e0226f7`). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's nutrition** (lists, totals math, Consumption construction paths, resets, announcements). New: the look, tiles, dots, inline delete confirm, `ui-select`.
- **Selectors for e2e** (keep stable): `oyl-nutrition`, `[data-role="totals"]`, `[data-role="empty"]`, `oyl-meal-form ui-segment [data-value="catalog|adhoc"]`, `ui-select[name="consumable"] select`, `ui-select[name="consumableProduct"] select`, `ui-field[name="note|servings|when|calories|protein|totalCarbohydrate|totalFat|waterMl"] input`, `ui-button[type="submit"] button`, `oyl-meal-row`, `[data-act="delete"|"confirm-yes"|"confirm-no"]`, `oyl-nutrition details summary`, `oyl-consumable-form ui-field[name="name"] input`, `oyl-nutrition ol.catalog li`.
- **Gates per task:** `pnpm ui test|typecheck|build` when ui-oyl changes; `pnpm stencil test|typecheck|build`; Task 6 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports freed first).
- New `ui-*` tags get registered in `apps/stencil-oyl/src/global/app.ts`.
- Handlers on `ui-*` hosts never close over render state (CLAUDE.md gotcha).

---

## Task 1: `ui-select`

**Files:** `packages/ui-oyl/src/components/ui-select/{ui-select.tsx,ui-select.css,ui-select.spec.tsx}`, `packages/ui-oyl/src/index.ts` (export `SelectOption`), `packages/ui-oyl/src/dev/index.html`, `apps/stencil-oyl/src/global/app.ts`

- [x] **Step 1: failing specs** — label bound via `for`/`id`; `name` reflected; options render as `<option value>` with labels; initial `value` selects its option; changing the select emits composed `uiChange {value}` and updates `value`; setting `value` from outside updates the select; `disabled`; hint/error aria as `ui-field`; form value via the shim; replacing `options` so the current value vanishes adopts the first option's value WITHOUT emitting `uiChange`.
- [x] **Step 2: component + CSS** — mirror `ui-field` (ids, `formAssociated`, `@Watch('value')` → `setFormValue`, `@Watch('options')` → value sync).
- [x] **Step 3:** showcase section; register in stencil-oyl; export `SelectOption` type.
- [x] **Step 4: gate + commit** — `feat(ui-oyl): ui-select`.

## Task 2: `oyl-meal-row` + `src/nutrition/format.ts`

**Files:** `apps/stencil-oyl/src/nutrition/format.ts` + `format.unit.ts`, `apps/stencil-oyl/src/components/oyl-meal-row/{…}`

- [x] **Step 1: failing tests** — `consumptionMeta(c)` (per-serving nutrients; "· N kcal total" only when servings > 1 and calories known; ends with the clock time); `tileValue(n, key)` ("—" when undefined, rounded otherwise); `mealLabel(c, byId)` (catalog name → note → "Meal", "×N" when servings ≠ 1). Row spec: title + meta; Delete → "Delete?" group, No restores, Yes emits `remove {id}`.
- [x] **Step 2: implement** — `@Prop() consumption`, `@Prop() label` (the screen resolves the catalog name), `@Event() remove`, `@State() confirming`.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-meal-row`.

## Task 3: `oyl-consumable-form`

**Files:** `apps/stencil-oyl/src/components/oyl-consumable-form/{…}`, `apps/stencil-oyl/src/nutrition/format.ts` (`NUTRIENT_FIELDS`)

- [x] **Step 1: failing specs** — renders name + five nutrient fields; submit builds a `Consumable` with `slug = toSlug(name)` and only the filled facts, calls `store.add`, clears, emits `added`; empty name → error in `[data-role=error]`.
- [x] **Step 2: implement.**
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-consumable-form`.

## Task 4: `oyl-meal-form`

**Files:** `apps/stencil-oyl/src/components/oyl-meal-form/{…}`

- [x] **Step 1: failing specs** — default catalog mode: segment `catalog`, `ui-select[name=consumable]` options = consumables (id/name), no product select without products, `ui-field[name=servings]` = 1, `when` prefilled `${day}THH:MM`; a consumable with products shows `ui-select[name=consumableProduct]` with the "— no specific product —" first option; ad-hoc mode shows note + five nutrient fields and hides the selects; catalog submit → `store.add` with `consumableId` and snapshot nutrients × servings read from the fields; product submit → `consumableProductId` + effective facts; ad-hoc submit → nutrients only from filled fields + note, emits `logged`, resets (servings 1, note cleared); empty catalog submit → "Pick a consumable to log" error; day change re-syncs `when`; ⌘Enter submits.
- [x] **Step 2: implement** — props `store`, `consumables`, `consumableProducts?`, `day`; `@State() mode`, `consumableId`, `error`, `when`, `catalog` (mirrored from `consumables.all()` through an `effect`, disposed on disconnect), `products` (same for `consumableProducts`).
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-meal-form composer`.

## Task 5: `oyl-nutrition` + route

**Files:** `apps/stencil-oyl/src/components/oyl-nutrition/{…}`, `apps/stencil-oyl/src/boot/routes.ts` + `routes.unit.ts`

- [x] **Step 1: failing specs** — fake journal store (`consumptionsOn`, `dailyNutrients`, `add`, `remove`) + fake consumables/products stores (`all`, `add`), reactive through `core()`: tiles show rounded totals and dashes; rows newest first with catalog labels and ×N; empty text; `remove` → `store.remove` + "Meal deleted"; `logged` → "Meal logged"; `added` → "Consumable added"; catalog list renders names + facts and reacts to `add`; `marked` true for days with consumptions; ArrowRight moves a day unless in a field.
- [x] **Step 2: implement.**
- [x] **Step 3: route** — `nutrition` creates `oyl-nutrition` with the journal/consumables/products stores + tz; remove from `NOT_YET`; unit test text.
- [x] **Step 4: gate + commit** — `feat(stencil-oyl): Nutrition screen replaces the placeholder`.

## Task 6: e2e

**Files:** `apps/e2e-oyl/tests-stencil/nutrition.spec.ts`, `tests-stencil/lib.ts` (`addConsumable`, `logAdhoc`), `routing.spec.ts` (placeholder test → `/finance`)

- [x] **Step 1:** port vanilla's five nutrition tests (unique names; persistence through `awaitOutboxDrained` + reload) + inline confirm + a week-strip dot test.
- [x] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [x] **Step 3: commit** — `test(e2e): stencil nutrition spec`.

## Task 7: Visual check + docs

- [x] Headless screenshots desktop + Pixel 7; fix anything off.
- [x] CLAUDE.md (stencil-oyl row: Nutrition; ui-oyl row: ten primitives incl. `ui-select`), spec statuses (nutrition implemented; program table row 5), tick this plan.
- [x] Final gates; commit `docs: stencil-oyl Nutrition; ui-oyl select`.

## Deferred

- Catalog search; editing/deleting catalog items; migrating the Journal/Planner selects to `ui-select`; nutrient targets.
