# Rename Food → Consumable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the nutrition catalog `Food` → `Consumable` (collection `foods` → `consumables`, provenance field `foodId` → `consumableId` in `Consumption` and `PlannedMeal`), and extract nutrient helpers to their own module — a clean-break mechanical rename, no data migration.

**Architecture:** Three sequential commits, each ending with its package green: (1) extract `nutrition/nutrients.ts` (a pure move, `Food` name unchanged); (2) rename across the domain core `@oyl/all-of-oyl`; (3) rename across the `apps/vanilla-oyl` app + docs + a final repo-wide sweep. This is not TDD — it preserves behavior; the existing tests are renamed/updated and must still pass, and a `grep` sweep verifies no old names survive.

**Tech Stack:** TypeScript (strict `src/`, NodeNext, explicit `.js` import extensions), Vitest; vanilla JS + JSDoc Web Components, Vitest (happy-dom).

## Global Constraints

- `@oyl/all-of-oyl` `src/` is `"type": "module"` + NodeNext: every relative import uses an explicit `.js` extension.
- `src/` stays DOM-free (browser build has no DOM lib); `pnpm all-of build` is the gate. `src/` enforces `noUnusedLocals`/`noUnusedParameters`.
- vanilla-oyl is zero-runtime-dep vanilla JS + JSDoc; component tests assert via the component's own shadowRoot.
- **Clean break:** NO data migration, NO schema-version bump, NO backward-compat reading of `foods`/`foodId`, NO temporary aliases. Existing data is discarded via an operational reset, not migrated.
- Backend (`apps/strapi-oyl`) gets NO code change (`collection` is an opaque string).
- Never weaken a type/lint rule. Behavior is unchanged — tests are renamed/updated, not loosened.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `refactor/rename-food-to-consumable`.

**Rename map (authoritative — applies across tasks):**

| Old | New |
|---|---|
| `Food` (class) | `Consumable` |
| `makeFood` (builder) | `makeConsumable` |
| collection key `foods` | `consumables` |
| `Seed.foods` (field) | `Seed.consumables` |
| `Consumption.foodId` / `PlannedMeal.foodId` | `consumableId` |
| ctor param `food` (Consumption, PlannedMeal, builders) | `consumable` |
| file `nutrition/food.ts` | `nutrition/consumable.ts` |
| `createFoodsStore` | `createConsumablesStore` |
| `repos.foods` / `dataState.foods` / `view.foods` | `repos.consumables` / `dataState.consumables` / `view.consumables` |
| `OylFoodForm` / `defineFoodForm` / `<oyl-food-form>` | `OylConsumableForm` / `defineConsumableForm` / `<oyl-consumable-form>` |
| file `state/foods-store.js` | `state/consumables-store.js` |
| file `components/oyl-food-form.js` | `components/oyl-consumable-form.js` |
| user-facing "Food"/"Foods" copy | "Consumable"/"Consumables" |

**Commands:**
- Lib: `pnpm --filter @oyl/all-of-oyl test` · `pnpm all-of typecheck:src` · `pnpm all-of build`
- App: `pnpm vanilla test` · `pnpm vanilla typecheck` · `pnpm vanilla build:lib`

---

## Task 1: Extract `nutrition/nutrients.ts` (pure move, no rename)

Moves the shared nutrient value-object helpers out of `food.ts` so `Food`/`Consumable` and `Consumption` both import them from a focused module. **`Food` keeps its name in this task** — this is only a move, so the diff is a move, not a rename (and the whole repo stays green).

**Files:**
- Create: `packages/all-of-oyl/src/nutrition/nutrients.ts`
- Modify: `packages/all-of-oyl/src/nutrition/food.ts` (remove the helpers, import them from `./nutrients.js`)
- Modify every other importer of the helpers (find via grep — at least `nutrition/consumption.ts`, `nutrition/totals.ts`, `fixtures/builders.ts`, `index.ts`)
- Test: `packages/all-of-oyl/src/nutrition/nutrients.test.ts` (new — move any nutrient-helper-specific cases here; otherwise a minimal round-trip test)

**Interfaces:**
- Produces: `nutrition/nutrients.ts` exporting `type Nutrients`, `NUTRIENT_METRICS`, `assertNutrients`, `nutrientsFromJSON`, `nutrientsToJSON` (identical signatures to their current definitions in `food.ts`).
- Consumes: nothing new.

- [ ] **Step 1: Baseline green**

Run: `pnpm --filter @oyl/all-of-oyl test`
Expected: PASS (establishes the behavior we must preserve).

- [ ] **Step 2: Find every importer of the nutrient helpers**

Run: `grep -rn "NUTRIENT_METRICS\|assertNutrients\|nutrientsFromJSON\|nutrientsToJSON\|type Nutrients\|Nutrients" packages/all-of-oyl/src --include=*.ts | grep -v '\.test\.'`
Note each file that imports these from `./food.js` / `../nutrition/food.js` — those import paths get repointed to `nutrients.js` in Step 4.

- [ ] **Step 3: Create `nutrients.ts`** — move the exact current definitions of `Nutrients`, `NUTRIENT_METRICS`, `assertNutrients`, `nutrientsFromJSON`, `nutrientsToJSON` out of `food.ts` into the new file. Preserve their bodies verbatim; keep `import { DomainError } from '../core/domain-error.js'` (and any other deps they use) in the new file. Example head:

```ts
import { DomainError } from '../core/domain-error.js'

/** Per-serving nutrient values. Only present fields are emitted as metrics. */
export type Nutrients = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  waterMl?: number
}

/** Field → metric key. The one place the mapping lives. */
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof Nutrients, string]> = [
  ['calories', 'nutrition.calories'],
  ['protein', 'nutrition.protein'],
  ['carbs', 'nutrition.carbs'],
  ['fat', 'nutrition.fat'],
  ['waterMl', 'nutrition.water_ml'],
]

// ...assertNutrients, nutrientsFromJSON, nutrientsToJSON moved verbatim...
```

- [ ] **Step 4: Repoint imports** — in `food.ts` remove the moved definitions and add `import { type Nutrients, NUTRIENT_METRICS, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrients.js'` (only the ones `food.ts` actually uses — let `noUnusedLocals` guide you). In each other importer found in Step 2, change the helper imports from `./food.js`/`../nutrition/food.js` to the `nutrients.js` path (keep the `Food` import from `food.js`). In `index.ts`, split the re-export (line ~62): keep `export { Food } from './nutrition/food.js'` and add `export { type Nutrients, NUTRIENT_METRICS, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrition/nutrients.js'`.

- [ ] **Step 5: Add `nutrients.test.ts`** — if `food.test.ts` had cases specifically for `assertNutrients`/`nutrientsFromJSON`/`nutrientsToJSON`, move them into `nutrients.test.ts`. Otherwise add a minimal round-trip + rejection test:

```ts
import { describe, expect, it } from 'vitest'
import { assertNutrients, nutrientsToJSON, nutrientsFromJSON } from './nutrients.js'
import { DomainError } from '../core/domain-error.js'

describe('nutrients helpers', () => {
  it('round-trips present fields', () => {
    const n = { calories: 200, protein: 10 }
    expect(nutrientsFromJSON(nutrientsToJSON(n))).toEqual(n)
  })
  it('rejects a negative nutrient', () => {
    let code: unknown
    try { assertNutrients({ calories: -1 }) } catch (e) { code = (e as DomainError).code }
    expect(code).toBe('INVALID_QUANTITY')
  })
})
```

- [ ] **Step 6: Gates green**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: PASS; `dist/` bare-import free. (The whole repo is still green — `Food` is unchanged, the app is untouched.)

- [ ] **Step 7: Commit**

```bash
git add packages/all-of-oyl/src/nutrition/
git commit -m "refactor(all-of-oyl): extract nutrient helpers to nutrition/nutrients.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Rename Food → Consumable in the domain core

Apply the rename map across `@oyl/all-of-oyl`. **Expected transient state:** after this commit `@oyl/all-of-oyl` is green but `apps/vanilla-oyl` is RED (it still references the old names) — Task 3 fixes the app immediately. Do not run or gate on the vanilla suite in this task. This is normal for a staged cross-package rename on a feature branch; the branch is never merged between Tasks 2 and 3.

**Files:**
- Rename: `nutrition/food.ts` → `nutrition/consumable.ts`; `nutrition/food.test.ts` → `nutrition/consumable.test.ts` (use `git mv`)
- Modify: `nutrition/consumable.ts`, `nutrition/consumption.ts`, `plan/planned-meal.ts`, `collections.ts`, `index.ts`, `fixtures/seed.ts`, `fixtures/builders.ts`
- Test: `nutrition/consumable.test.ts`, `nutrition/consumption.test.ts`, `plan/planned-meal.test.ts`, `collections.test.ts`, `fixtures/fixtures.test.ts`, `index.test.ts` (whichever reference the old names)

**Interfaces:**
- Produces: `Consumable` class (from `./nutrition/consumable.js`), `makeConsumable` builder, `COLLECTIONS.consumables`, `Seed.consumables`, `Consumption.consumableId`/`PlannedMeal.consumableId`, ctor param `consumable`. All exported from `@oyl/all-of-oyl`.
- Consumes: `nutrition/nutrients.ts` from Task 1.

- [ ] **Step 1: Rename the files (preserve history)**

```bash
git mv packages/all-of-oyl/src/nutrition/food.ts packages/all-of-oyl/src/nutrition/consumable.ts
git mv packages/all-of-oyl/src/nutrition/food.test.ts packages/all-of-oyl/src/nutrition/consumable.test.ts
```

- [ ] **Step 2: Apply the rename map across the domain core**

Per-file specifics (apply the rename map table; these are the non-obvious spots):
- `consumable.ts`: class `Food` → `Consumable`; any self-referential `Food` in JSDoc → `Consumable`.
- `consumption.ts`: import path `./consumable.js` (for the snapshot type if any); field `foodId` → `consumableId` (declaration, `toJSON` key, `fromJSON` destructure + parse); ctor param `food` → `consumable`; JSDoc "snapshot from the Food" → "…Consumable", "`foodId` is provenance" → "`consumableId` is provenance".
- `plan/planned-meal.ts`: field `foodId` → `consumableId`; ctor params `food`/`foodId` → `consumable`/`consumableId`; the conflict-check + `toJSON`/`fromJSON` keys; error messages `"a planned meal references a food"` → `"…references a consumable"`, `"conflicting food provenance"` → `"conflicting consumable provenance"`, `"planned-meal has a malformed foodId"` → `"…malformed consumableId"`; the grocery-list "per food id" comments → "per consumable id".
- `collections.ts`: `import { Consumable } from './nutrition/consumable.js'`; key `foods: classCodec(Food.fromJSON)` → `consumables: classCodec(Consumable.fromJSON)`.
- `index.ts`: `export { Food } from './nutrition/food.js'` → `export { Consumable } from './nutrition/consumable.js'`; in the builders export block, `makeFood` → `makeConsumable`.
- `fixtures/seed.ts`: `Seed.foods` field → `consumables`; the demo `foods: [oatmeal.toJSON(), chickenBowl.toJSON()]` → `consumables: [...]`.
- `fixtures/builders.ts`: `makeFood` → `makeConsumable` (and the `Food` import → `Consumable` from `../nutrition/consumable.js`); consumption/planned-meal builders' `food` override → `consumable`.
- Tests: update all asserted symbols/keys/messages; `collections.test.ts` — the `Seed`↔`COLLECTIONS` key-mirror assertion now expects `consumables` (both sides must say `consumables` or it fails).

- [ ] **Step 3: Verify no old names remain in the core**

Run: `grep -rniE '\bfoods?\b|foodId|makeFood|OylFood' packages/all-of-oyl/src`
Expected: no matches. (If a legitimate non-rename hit appears — e.g. a demo item literally named "food" — judge it; none are expected.)

- [ ] **Step 4: Gates green (lib only)**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm all-of typecheck:src && pnpm all-of build`
Expected: PASS; `dist/` bare-import free. (Do NOT run the vanilla suite — it is expected-red until Task 3.)

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src
git commit -m "refactor(all-of-oyl): rename Food -> Consumable (foods->consumables, foodId->consumableId)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rename Food → Consumable in the app + docs + final sweep

Brings `apps/vanilla-oyl` onto the renamed domain, restoring repo-wide green, and updates `CLAUDE.md`.

**Files:**
- Rename: `state/foods-store.js` → `state/consumables-store.js`; `state/foods-store.test.js` → `state/consumables-store.test.js`; `components/oyl-food-form.js` → `components/oyl-consumable-form.js`; `components/oyl-food-form.test.js` → `components/oyl-consumable-form.test.js` (use `git mv`)
- Modify: `state/consumables-store.js`, `state/data.js`, `main.js`, `components/oyl-consumable-form.js`, `components/oyl-nutrition-composer.js`, `components/oyl-nutrition.js`, and the renamed/related tests
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `Consumable`/`makeConsumable`/`COLLECTIONS.consumables` from Task 2.
- Produces: `createConsumablesStore`, `dataState.consumables`, `<oyl-consumable-form>`.

- [ ] **Step 1: Rename the files (preserve history)**

```bash
git mv apps/vanilla-oyl/src/state/foods-store.js apps/vanilla-oyl/src/state/consumables-store.js
git mv apps/vanilla-oyl/src/state/foods-store.test.js apps/vanilla-oyl/src/state/consumables-store.test.js
git mv apps/vanilla-oyl/src/components/oyl-food-form.js apps/vanilla-oyl/src/components/oyl-consumable-form.js
git mv apps/vanilla-oyl/src/components/oyl-food-form.test.js apps/vanilla-oyl/src/components/oyl-consumable-form.test.js
```

- [ ] **Step 2: Apply the rename map across the app**

Per-file specifics:
- `state/consumables-store.js`: `createFoodsStore` → `createConsumablesStore`; `repos.foods` → `repos.consumables`; internal var/JSDoc `food` → `consumable`.
- `state/data.js`: import `createConsumablesStore` from `./consumables-store.js`; line ~47 `const foods = createFoodsStore(repos.foods)` → `const consumables = createConsumablesStore(repos.consumables)`; the `refresh()` hydrate list `foods.hydrate()` → `consumables.hydrate()`; the returned object's `foods` property → `consumables`.
- `main.js`: nutrition route factory line ~253 `view.foods = dataState.foods` → `view.consumables = dataState.consumables`.
- `components/oyl-consumable-form.js`: `import { Food }` → `import { Consumable }`; class `OylFoodForm` → `OylConsumableForm`; `defineFoodForm` → `defineConsumableForm`; `customElements.define('oyl-food-form', …)` → `'oyl-consumable-form'`; the `FoodsStore` typedef → `ConsumablesStore` pointing at `consumables-store.js`; `new Food(...)` → `new Consumable(...)`; user copy `'Food name'` → `'Consumable name'`.
- `components/oyl-nutrition-composer.js`: `FoodsStore` typedef → `ConsumablesStore` (path `consumables-store.js`); `this.foods` → `this.consumables`; radio `this._radio('mode', 'food', 'From food', true)` → `('mode', 'consumable', 'From consumable', true)`; `select.name = 'food'` → `'consumable'`; `select.setAttribute('aria-label', 'Food')` → `'Consumable'`; var `modeFood`/`foodGroup` → `modeConsumable`/`consumableGroup`.
- `components/oyl-nutrition.js`: import/define `oyl-consumable-form` (`defineConsumableForm`); the `consumables` store ref (was `foods`); user-facing catalog labels "Food"/"Foods" → "Consumable"/"Consumables".
- Renamed tests: update the element tag (`oyl-consumable-form`), `createConsumablesStore`, store prop `consumables`, and any `'Food'` label assertions to `'Consumable'`. Behavior assertions otherwise unchanged.

- [ ] **Step 3: Update `CLAUDE.md`** — in the entry-kinds / nutrition convention bullet, change "Food catalog + Consumption logging" → "Consumable catalog + Consumption logging"; `state/foods-store.js` → `state/consumables-store.js`; mention the nutrition catalog type is `Consumable` (was `Food`) and nutrient helpers live in `@oyl/all-of-oyl` `nutrition/nutrients.ts`. Keep it terse, no restructuring.

- [ ] **Step 4: Final repo-wide sweep**

Run: `grep -rniE '\bfoods?\b|foodId|makeFood|OylFood|foods-store|oyl-food-form' packages/all-of-oyl/src apps/vanilla-oyl/src`
Expected: no matches anywhere. (Backend untouched by design — do not grep/modify `apps/strapi-oyl`.)

- [ ] **Step 5: All gates green (repo-wide now)**

Run: `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test && pnpm --filter @oyl/all-of-oyl test`
Expected: PASS (vanilla full suite + lib). `build:lib` re-vendors the renamed lib so the app's importmap copy is current.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src CLAUDE.md
git commit -m "refactor(vanilla-oyl): rename Food -> Consumable across the app + docs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Operational reset (post-merge, manual — not a code task)

The rename discards old `foods` data rather than migrating it. After this lands, perform once:
- **Client:** clear OYL `localStorage` (Status → "Reset local data", or `localStorage.clear()`).
- **Backend:** `docker compose down -v` (drops the Postgres volume), or delete `apps/strapi-oyl/.tmp/data.db` for native dev.

## Self-review notes (coverage map)

- Spec "nutrients.ts extraction" → Task 1. Spec domain rename surface (consumable.ts, consumption.ts, planned-meal.ts, collections.ts, index.ts, fixtures, the `Seed`↔`COLLECTIONS` gotcha) → Task 2. Spec app rename surface (stores, components incl. composer/nutrition, main.js, data.js) → Task 3. UI label "Consumables" → Task 3 Step 2. CLAUDE.md update + the DoD grep sweep → Task 3 Steps 3–4. Operational reset → documented above (manual). Backend no-change → respected (sweep excludes `apps/strapi-oyl`).
- No-migration / no-schema-bump / no-dual-read / no-aliases constraints → honored (no such code in any task).
- Transient app-red between Tasks 2 and 3 is called out so the Task 2 reviewer doesn't flag it as a defect.
