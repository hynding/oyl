# Nutrition Meal-Row Scaled Total — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a logged meal's scaled calorie total (nutrients × servings) on the row when `servings > 1`, alongside the existing per-serving breakdown.

**Architecture:** One component (`oyl-nutrition.js`): a module-level `consumptionMeta(c)` helper builds the row-meta string (per-serving + a scaled `N kcal total` when servings > 1, omitted when the food has no calories), replacing the inline meta assignment. `sumNutrients` is added to the existing barrel import.

**Tech Stack:** Vanilla JS + JSDoc (checkJs, strict), Vitest (happy-dom).

Spec: `docs/superpowers/specs/2026-06-17-vanilla-oyl-meal-row-scaled-total-design.md`

## Global Constraints

- Compact form: per-serving macro breakdown once, plus a scaled **calorie** total (`N kcal total`) only when `servings > 1` AND the food has calories (R2 fallback: omit otherwise — never render `undefined total`).
- The meal **name** (`{label} ×{servings}`) and the **foods-catalog** rows (per-serving) are unchanged.
- `consumptionMeta` is a module-level pure function (no `this`); its param is typed `Consumption` (strict/checkJs — no implicit any).
- Tests assert on the **consumption-list row's own** textContent (the first `<ol>`'s `<li>`), not the whole screen shadowRoot (the day-totals strip also shows "300 kcal …").
- `pnpm vanilla test` and `pnpm vanilla typecheck` stay green.
- Git: end the commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch already isolated by the executor.

---

### Task 1: Scaled calorie total on the meal row

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-nutrition.js` (line 1 import; new module-level helper; line 124 meta assignment)
- Test: `apps/vanilla-oyl/src/components/oyl-nutrition.test.js` (add `Consumption` import + 3 cases)

**Interfaces:**
- Consumes: `sumNutrients` from `@oyl/all-of-oyl`; `formatNutrients`/`formatClockTime` from `@oyl/all-of-oyl/format` (already imported).
- Produces: `consumptionMeta(c: Consumption): string` (module-private to `oyl-nutrition.js`; not exported).

- [ ] **Step 1: Write the failing tests**

In `apps/vanilla-oyl/src/components/oyl-nutrition.test.js`, change the line-2 import to add `Consumption`:

```js
import { InMemoryRepository, Food, Consumption } from '@oyl/all-of-oyl'
```

Then add these three cases inside the `describe('<oyl-nutrition>', ...)` block (the `row(...)` reads the consumption list's first row — the first `<ol>`, before the foods-catalog `<ol>`):

```js
  /** @param {any} el @returns {any} */
  const firstMealRow = (el) => el.shadowRoot.querySelectorAll('ol')[0].querySelector('li')

  it('shows per-serving nutrients and a scaled calorie total for a multi-serving meal', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const oatmeal = await foods.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    await store.add(new Consumption({ occurredAt: new Date(), food: { id: oatmeal.id, nutrients: oatmeal.nutrients }, servings: 2 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('150 kcal')       // per serving
    expect(row.textContent).toContain('300 kcal total') // scaled contribution
    el.remove()
  })

  it('omits the total for a single-serving meal', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Consumption({ occurredAt: new Date(), nutrients: { calories: 150 }, servings: 1 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('150 kcal')
    expect(row.textContent).not.toContain('total')
    el.remove()
  })

  it('omits the total for a multi-serving meal with no calories', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Consumption({ occurredAt: new Date(), nutrients: { waterMl: 500 }, servings: 2 }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    const row = firstMealRow(el)
    expect(row.textContent).toContain('500 ml')
    expect(row.textContent).not.toContain('total')
    el.remove()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition.test.js`
Expected: FAIL — the multi-serving case fails (`expected '…150 kcal · 5g P · 12:06 AM…' to contain '300 kcal total'`); the two "omits total" cases already pass (the current row shows no total) and stay green.

- [ ] **Step 3: Add the import, helper, and wire the meta**

In `apps/vanilla-oyl/src/components/oyl-nutrition.js`:

1. Change line 1 to add `sumNutrients`:
   ```js
   import { DayKey, sumNutrients } from '@oyl/all-of-oyl'
   ```
2. Add this module-level helper (place it after the imports, before the `const styles = sheet(...)` declaration):
   ```js
   /**
    * Row meta for a logged consumption: per-serving nutrients, plus a scaled
    * calorie total when servings > 1 (omitted when the food has no calories).
    * @param {import('@oyl/all-of-oyl').Consumption} c
    * @returns {string}
    */
   function consumptionMeta(c) {
     const perServing = formatNutrients(c.nutrients)
     const scaledCalories = sumNutrients([c]).calories
     const total = c.servings > 1 && scaledCalories !== undefined
       ? ` · ${Math.round(scaledCalories)} kcal total`
       : ''
     return `${perServing}${total} · ${formatClockTime(c.occurredAt)}`
   }
   ```
3. Replace the meta assignment at line 124:
   ```js
   meta.textContent = `${formatNutrients(c.nutrients)} · ${formatClockTime(c.occurredAt)}`
   ```
   with:
   ```js
   meta.textContent = consumptionMeta(c)
   ```
   (Leave the foods-catalog `meta.textContent = formatNutrients(f.nutrients)` at line 148 unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition.test.js`
Expected: PASS (the original 2 cases + the 3 new ones).

- [ ] **Step 5: Run the full gate**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all tests PASS; typecheck clean (the `@param {…Consumption}` annotation keeps the helper free of implicit-any under strict checkJs).

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-nutrition.js apps/vanilla-oyl/src/components/oyl-nutrition.test.js
git commit -m "feat(vanilla-oyl): show scaled calorie total on multi-serving meal rows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of Done

- `pnpm vanilla test` and `pnpm vanilla typecheck` green.
- A `servings: 2` meal row shows per-serving macros + `N kcal total`; a `servings: 1` row shows no total annotation; a calorie-less food (servings > 1) shows no `total` / no `undefined`.
- The meal name and foods-catalog rows are unchanged.
