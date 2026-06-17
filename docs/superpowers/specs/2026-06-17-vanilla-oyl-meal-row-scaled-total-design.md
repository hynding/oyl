# Nutrition meal row: per-serving + scaled total

**Date:** 2026-06-17
**Status:** Approved — ready for planning
**Package:** `apps/vanilla-oyl` (`oyl-nutrition.js` only)

## Goal

On the Nutrition screen, a logged meal row currently shows the food's
**per-serving** nutrients (`formatNutrients(c.nutrients)`) even when
`servings > 1`, so a 2-serving meal reads "Oatmeal ×2 · 150 kcal…" while it
contributes 300 kcal to the (correct) day total. Add the **scaled calorie
total** to the row so the line's actual contribution is visible, without
duplicating the full macro list.

## Decision (locked)

Compact form: keep the per-serving macro breakdown once, and append the scaled
**calorie** total as a headline when (and only when) it adds information
(`servings > 1` and the food has calories).

## Design

### Change (`apps/vanilla-oyl/src/components/oyl-nutrition.js`)

1. Add `sumNutrients` to the existing main-barrel import (line 1):
   `import { DayKey, sumNutrients } from '@oyl/all-of-oyl'`. (`sumNutrients` is
   exported from `@oyl/all-of-oyl`; `formatNutrients` stays from
   `@oyl/all-of-oyl/format`.)
2. Extract a small local helper inside `render()` (or a private method) that
   builds the consumption-row meta string, replacing the inline
   `meta.textContent = ...` at the current row loop:

   ```js
   /**
    * Row meta: per-serving nutrients + scaled calorie total (when servings > 1).
    * @param {import('@oyl/all-of-oyl').Consumption} c
    */
   const consumptionMeta = (c) => {
     const perServing = formatNutrients(c.nutrients)
     const scaledCalories = sumNutrients([c]).calories
     const total = c.servings > 1 && scaledCalories !== undefined
       ? ` · ${Math.round(scaledCalories)} kcal total`
       : ''
     return `${perServing}${total} · ${formatClockTime(c.occurredAt)}`
   }
   ```

   The row loop sets `meta.textContent = consumptionMeta(c)`.

Resulting rows:
- `servings === 1`: `150 kcal · 5g P · 27g C · 3g F · 12:06 AM` (unchanged).
- `servings > 1` (with calories): `150 kcal · 5g P · 27g C · 3g F · 300 kcal total · 12:06 AM`.
- `servings > 1`, **no calories (R2 fallback)**: omit the total segment →
  `500 ml · 12:06 AM` (no `undefined total`).

The meal **name** (`{label} ×{servings}`) is unchanged. The **foods-catalog**
rows are unchanged (inherently per-serving, no servings, no total).

### Density (R3)

The `servings > 1` meta is longer; `.meta` is its own span in a flex `<li>`, so
it wraps. The plan's manual check confirms a 2-serving row renders without
overflow at a narrow viewport.

## Testing (R4)

`apps/vanilla-oyl/src/components/oyl-nutrition.test.js` — add cases (assert via
the screen's own shadowRoot textContent, per the shadow-DOM convention):
- A `servings: 2` consumption row contains **both** the per-serving value
  (`150 kcal`) **and** the scaled total (`300 kcal total`).
- A `servings: 1` consumption row contains the per-serving value and **no**
  "total" annotation.
- (Optional) a water-only (`{ waterMl }`) `servings: 2` row shows the per-serving
  value and **no** "total" segment (R2 fallback).

## Out of scope

- The foods-catalog row format (stays per-serving).
- Scaling the full macro list per row (rejected — the compact calorie total is
  the chosen, less-dense form).
- Any core/store change (`sumNutrients` already exists).

## Definition of Done

- `pnpm vanilla test` and `pnpm vanilla typecheck` green.
- A 2-serving meal row shows per-serving macros + `N kcal total`; a 1-serving
  row shows no total annotation; a calorie-less food shows no `undefined`.
