# `apps/stencil-oyl` Nutrition screen — Design

**Date:** 2026-10-08
**Status:** draft (branch `feat/stencil-oyl-nutrition`, stacked on `feat/stencil-oyl-planner`)
**Program:** Stencil front-end — sub-project 5 (third redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 4 (`oyl-day-nav`,
`ui-checkbox`, the row/confirm convention).

## Purpose

Replace the `/nutrition` placeholder: the day's meals (consumptions) with daily nutrient totals,
a composer that logs from the shared consumable catalog (optionally a specific product) or an
ad-hoc meal, and the catalog section where a consumable can be added. Same domain behavior as
vanilla's `oyl-nutrition` (the journal, consumables and consumable-products stores are unchanged
and shared); new look, totals as tiles, week-strip dots, and one new primitive, `ui-select`.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Totals | **Five stat tiles** under the day nav — kcal, g protein, g carbs, g fat, ml water — mono numbers, an em dash when the day has nothing. Replaces vanilla's one-line `formatNutrients` summary. |
| Selects | **Add `ui-select`** to `@oyl/ui-oyl` (label + native `<select>`, `options`, form-associated, `uiChange`). Used for the consumable and product pickers here; the Journal's metric and Planner's unit selects migrate in a later tidy-up (their e2e selectors keep working through the inner `select`). |
| Catalog | **Collapsed "New consumable" disclosure** (`<details>`) above the catalog list; the form opens on demand. |
| Delete | **Inline Delete → Yes/No** on meal rows, the same confirm cluster as the Journal/Planner rows (vanilla deleted immediately). |

## Screen anatomy

```
<oyl-nutrition store consumables consumableProducts tz>
  <oyl-day-nav day today marked announcement onDayChange>      marked = day has ≥1 consumption
  .totals  5 × <div class="tile"><b>{value}</b><small>{unit}</small></div>
  <oyl-meal-form store consumables consumableProducts day onLogged>      — ui-card
  <ol>  <li><oyl-meal-row consumption label onRemove></li> …   newest first
  .empty[data-role=empty]  "No meals logged for {heading}. Log one above."
  section.catalog
    .section-label "Consumables"
    <details><summary>New consumable</summary><oyl-consumable-form store onAdded></details>
    <ol class="catalog"> <li>{name} <span class="meta">{formatNutrients(facts)}</span></li> …
```

- Lists are vanilla's: `store.consumptionsOn(day)` sorted newest first; the row label is the
  consumable's name (looked up in `consumables.all()`), else `consumption.note`, else "Meal";
  "×N" when `servings !== 1`. Totals come from `store.dailyNutrients(day)`.
- One `effect` tracks the day signal, the journal revision (through its reads) and the
  consumables revision (through `all()`); the catalog list reads `consumables.all()` inside
  the same effect (a separate `@State() catalog`).
- Announcements through `oyl-day-nav`'s `announcement`: "Showing …", "Meal logged", "Meal
  deleted", "Consumable added". ArrowLeft/Right via `isEditableTarget` as the other screens.

### Totals tiles

`TILES = [['calories','kcal'], ['protein','g protein'], ['totalCarbohydrate','g carbs'],
['totalFat','g fat'], ['waterMl','ml water']]`; value = `Math.round(n[key])` or "—" when
undefined. The tile strip has `role="group" aria-label="Daily totals"`; each tile's
accessible name is "{value} {unit}". The strip carries `data-role="totals"` and the Nutrition
e2e asserts on its deep text ("300" after 2 × 150 kcal; all dashes when empty).

### `oyl-meal-form` (composer)

- `ui-segment name="mode"` options **From catalog** (`catalog`) / **Ad-hoc** (`adhoc`), default
  catalog.
- Catalog mode: `ui-select name="consumable" label="Consumable"` listing `consumables.all()`
  (value = id, label = name; "— pick a consumable —" placeholder option when the catalog is
  empty is unnecessary: the select simply has no options and submit throws "Pick a consumable
  to log", as vanilla). `ui-select name="consumableProduct" label="Product (optional)"` shown
  only when `consumableProducts.all()` has products for the selected consumable; first option
  "— no specific product —" (value `''`).
- Ad-hoc mode: `ui-field name="note" label="Meal name"` + a `.nutrients` grid of five
  `ui-field type="number"` (`calories`, `protein`, `totalCarbohydrate`, `totalFat`, `waterMl`;
  labels Calories / Protein (g) / Carbs (g) / Fat (g) / Water (ml)); blanks are omitted from
  the `nutrients` object, as vanilla.
- Both: `.row2` of `ui-field name="servings" type="number"` (default `1`) and
  `ui-field name="when" type="datetime-local"` prefilled `${day}THH:MM` (re-synced on day
  change and after submit). Submit `ui-button type="submit" variant="primary"` "Log it";
  ⌘/Ctrl+Enter submits.
- Submit builds the `Consumption` exactly as vanilla: product path → `effectiveFacts(product,
  consumable) ?? consumable.facts` with `consumableId` + `consumableProductId`; catalog path →
  `{ consumable: { id, nutrients: facts } }`; ad-hoc → `{ nutrients, note? }`. `await
  store.add(consumption)`, reset (servings 1, note/nutrients cleared, when re-synced), emit
  `logged`. Errors render in `[data-role=error]` (aria-live).

### `oyl-meal-row`

Grid `body | actions` (no time column — the time sits in the meta line, mono): `.title`
(label + "×N"), `.meta` = `formatNutrients(c.nutrients)` + " · {N} kcal total" when
`servings > 1` and calories are known (vanilla's `consumptionMeta`) + " · {clock time}".
Actions = inline Delete → "Delete?" Yes/No (`data-act="delete"|"confirm-yes"|"confirm-no"`,
`role=group`, No focused), native buttons as the other rows; emits `remove {id}`.
`consumptionMeta` moves app-side (`src/nutrition/format.ts` + unit test).

### `oyl-consumable-form`

`ui-field name="name" label="Name"` + the same five nutrient `ui-field`s (`.nutrients` grid)
+ `ui-button type="submit"` "Add consumable". Builds `new Consumable({ name, slug:
toSlug(name), facts })`, `await store.add`, clears, emits `added`. Errors in
`[data-role=error]`. Rendered inside the catalog `<details>`; after a successful add the
details stays open (the user may add several).

## New `@oyl/ui-oyl` primitive

| Tag | Props | Events | Notes |
|---|---|---|---|
| `ui-select` | `label`, `name` (reflected), `options: { value, label }[]`, `value` (mutable), `disabled`, `hint?`, `error?` | `uiChange` (`{ value }`), composed | Same anatomy/aria as `ui-field` with a native `<select>` (inner `change` stopped). Form-associated. When `options` changes and the current `value` is no longer present, `value` becomes the first option's value (or `''`) and `uiChange` does NOT fire (a sync, not a user change). Token-only CSS (`--size-control`, `--line-2`, `--radius-1`), readme, spec, registered in stencil-oyl. |

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `Consumption`, `Consumable`, `effectiveFacts`, `toSlug`,
  `sumNutrients`, `formatNutrients`, `formatClockTime` and the three stores exist.
- `boot/routes.ts`: `nutrition` creates `oyl-nutrition` with `store = app.dataState.journal`,
  `consumables = app.dataState.consumables`, `consumableProducts = app.dataState.consumableProducts`,
  `tz = app.tz`; `nutrition` leaves `NOT_YET`.
- Consumptions are **backed** (`consumptions` ∈ `BACKED`) and consumables/products are
  catalog-backed, so the e2e asserts persistence (add → outbox drained → reload).

## Verification

- **Specs (ui-oyl):** `ui-select` label binding, options render, `value` ↔ `uiChange`, reflected
  `name`, disabled, hint/error aria, form value, options-change value sync without an event.
- **Specs (stencil-oyl):** `oyl-meal-row` (label with ×N, meta with total kcal + time, confirm
  flow → `remove`); `oyl-meal-form` (default catalog mode with the consumables as options; product
  select appears only with matching products; ad-hoc fields; catalog submit → `Consumption` with
  `consumableId` + snapshot nutrients; product submit → `consumableProductId` + effective facts;
  ad-hoc submit → nutrients from the filled fields only + note; no consumable → error; when
  re-syncs on day change; ⌘Enter submits); `oyl-consumable-form` (builds a `Consumable` with slug
  + facts, clears, emits `added`; empty name → error); `oyl-nutrition` (fake stores: tiles show
  rounded totals / dashes, rows newest first with catalog labels, empty text, `remove` → `store.remove`
  + announcement, `logged`/`added` announce, catalog list renders names + facts, `marked` for
  days with consumptions, arrow keys).
- **Unit:** `consumptionMeta`, `TILES` formatting helper (`tileValue`).
- **e2e:** `tests-stencil/nutrition.spec.ts` = vanilla's five nutrition tests with stencil
  selectors (`oyl-consumable-form` inside the opened `details`, `ui-select[name=consumable]
  select`, `ui-field[name=servings] input`, `oyl-meal-row`, `inlineConfirm(row, 'delete')`,
  `[data-role=totals]` via `deepText`, `oyl-nutrition ui-button[data-nav=prev] button`) plus one
  for the week-strip dot. Unique consumable names (the catalog is shared). Mobile project runs
  the same specs.
- Definition of Done per CLAUDE.md: `pnpm ui test|typecheck|build`, `pnpm stencil
  test|typecheck|build`, stencil e2e projects green; vanilla untouched.

## Out of scope

- Editing meals/consumables, deleting catalog items (deferred backend capability), adding
  products from this screen (vanilla has no UI for it either), nutrient targets/goals, search
  in the catalog list (a later polish once the list is long), migrating the Journal/Planner
  selects to `ui-select`.

## Risks

| Risk | Mitigation |
|---|---|
| `ui-select` value sync when the catalog hydrates after first render | The options-change watcher adopts the first option without emitting; the composer reads the select's `value` at submit time, never caches it. |
| Shared catalog grows → long `<select>` and list | Accepted for v1 (vanilla has the same); a search field is listed under out of scope. |
| `<details>` in happy-dom | Specs assert the form's presence and behavior, not the open/closed rendering; e2e clicks the summary. |
