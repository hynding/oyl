# Nutrition Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the existing `Food`/`Consumption` nutrition domain as a day-scoped Nutrition screen — log meals (from the foods catalog or ad-hoc), see daily nutrient totals, manage a foods catalog.

**Architecture:** A twin of the Finance screen. Two small core helpers (`sumNutrients` aggregation, `formatNutrients` display); app stores (`foods-store`, two new `journal-store` methods); three new components + screen; route/nav/data wiring; and consumptions removed from the Journal list.

**Tech Stack:** TS core (NodeNext, no-DOM build, Vitest); vanilla JS + JSDoc app (Web Components, signals, happy-dom, checkJs + `noUncheckedIndexedAccess` + `noUnusedLocals`).

Spec: `docs/superpowers/specs/2026-06-16-vanilla-oyl-nutrition-screen-design.md`

## Global Constraints

- Aggregation (`sumNutrients`) lives in core `src/nutrition/`; the nutrient value-formatter (`formatNutrients`) lives in `@oyl/all-of-oyl/format` (consistent with the shared-formatters sub-project) — NOT app-side. Core stays DOM-free / `Intl`-free (type-only value-object imports) so `pnpm all-of build` is bare-import-free.
- The app is the browser app: DOM globals used directly; components extend `OylElement`, define styles via `sheet()`, register idempotently. Tests assert via a component's OWN shadowRoot/props (never the parent's textContent), and never add throwaway markup to pass a test.
- Forms surface validation via a `[data-role="error"]` element rather than letting domain constructors throw uncaught.
- `pnpm vanilla typecheck` (checkJs, `noUncheckedIndexedAccess`, `noUnusedLocals`) must stay green.
- Git: end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch already isolated by the executor.

---

### Task 1: Core helpers — `sumNutrients` + `formatNutrients`

**Files:**
- Create: `packages/all-of-oyl/src/nutrition/totals.ts`, `packages/all-of-oyl/src/nutrition/totals.test.ts`
- Create: `packages/all-of-oyl/src/format/nutrition.ts`, `packages/all-of-oyl/src/format/nutrition.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (export `sumNutrients`), `packages/all-of-oyl/src/format/index.ts` (export `formatNutrients`)

**Interfaces:**
- Produces: `sumNutrients(consumptions: readonly Consumption[]): Nutrients` (from `@oyl/all-of-oyl`); `formatNutrients(n: Nutrients): string` (from `@oyl/all-of-oyl/format`).

- [ ] **Step 1: Write the failing tests**

`packages/all-of-oyl/src/nutrition/totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Consumption } from './consumption.js'
import { sumNutrients } from './totals.js'

const c = (nutrients: import('./food.js').Nutrients, servings = 1) =>
  new Consumption({ occurredAt: new Date('2026-06-10T12:00:00Z'), nutrients, servings })

describe('sumNutrients', () => {
  it('sums nutrients × servings across consumptions', () => {
    const total = sumNutrients([c({ calories: 150, protein: 5 }, 2), c({ calories: 550, protein: 42, carbs: 45 })])
    expect(total).toEqual({ calories: 150 * 2 + 550, protein: 5 * 2 + 42, carbs: 45 })
  })
  it('omits fields no consumption carries and returns {} for empty', () => {
    expect(sumNutrients([])).toEqual({})
    expect(sumNutrients([c({ waterMl: 500 })])).toEqual({ waterMl: 500 })
  })
})
```

`packages/all-of-oyl/src/format/nutrition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatNutrients } from './nutrition.js'

describe('formatNutrients', () => {
  it('formats present fields, omits absent, "" when empty', () => {
    expect(formatNutrients({ calories: 150, protein: 5, carbs: 27, fat: 3 })).toBe('150 kcal · 5g P · 27g C · 3g F')
    expect(formatNutrients({ calories: 150.6 })).toBe('151 kcal')
    expect(formatNutrients({ waterMl: 500 })).toBe('500 ml')
    expect(formatNutrients({})).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/nutrition/totals.test.ts src/format/nutrition.test.ts`
Expected: FAIL — `Cannot find module './totals.js'` / `'./nutrition.js'`.

- [ ] **Step 3: Create the source files**

`packages/all-of-oyl/src/nutrition/totals.ts`:

```ts
import type { Consumption } from './consumption.js'
import { NUTRIENT_METRICS, type Nutrients } from './food.js'

/** Sum per-serving nutrients × servings across consumptions; omits fields none carry. */
export function sumNutrients(consumptions: readonly Consumption[]): Nutrients {
  const out: Nutrients = {}
  for (const c of consumptions) {
    for (const [field] of NUTRIENT_METRICS) {
      const v = c.nutrients[field]
      if (v !== undefined) out[field] = (out[field] ?? 0) + v * c.servings
    }
  }
  return out
}
```

`packages/all-of-oyl/src/format/nutrition.ts`:

```ts
import type { Nutrients } from '../nutrition/food.js'

/** Compact summary: "150 kcal · 5g P · 27g C · 3g F" (+ water), "" when empty. */
export function formatNutrients(n: Nutrients): string {
  const parts: string[] = []
  if (n.calories !== undefined) parts.push(`${Math.round(n.calories)} kcal`)
  if (n.protein !== undefined) parts.push(`${Math.round(n.protein)}g P`)
  if (n.carbs !== undefined) parts.push(`${Math.round(n.carbs)}g C`)
  if (n.fat !== undefined) parts.push(`${Math.round(n.fat)}g F`)
  if (n.waterMl !== undefined) parts.push(`${Math.round(n.waterMl)} ml`)
  return parts.join(' · ')
}
```

- [ ] **Step 4: Add the barrel exports**

In `packages/all-of-oyl/src/index.ts`, next to the existing `Consumption` export (`export { Consumption } from './nutrition/consumption.js'`), add:

```ts
export { sumNutrients } from './nutrition/totals.js'
```

In `packages/all-of-oyl/src/format/index.ts`, add a line:

```ts
export { formatNutrients } from './nutrition.js'
```

- [ ] **Step 5: Run the tests + full core gate**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/nutrition/totals.test.ts src/format/nutrition.test.ts`
Expected: PASS.
Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl typecheck:src && pnpm all-of build`
Expected: all green; build prints `dist/ is bare-import free.`

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/nutrition/totals.ts packages/all-of-oyl/src/nutrition/totals.test.ts packages/all-of-oyl/src/format/nutrition.ts packages/all-of-oyl/src/format/nutrition.test.ts packages/all-of-oyl/src/index.ts packages/all-of-oyl/src/format/index.ts
git commit -m "feat(all-of-oyl): sumNutrients + formatNutrients for nutrition totals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Nutrition stores — `foods-store` + journal-store methods

**Files:**
- Create: `apps/vanilla-oyl/src/state/foods-store.js`, `apps/vanilla-oyl/src/state/foods-store.test.js`
- Modify: `apps/vanilla-oyl/src/state/journal-store.js` (imports + 2 methods + a local helper)
- Modify: `apps/vanilla-oyl/src/state/journal-store.test.js` (add a describe block)

**Interfaces:**
- Consumes: `sumNutrients` (Task 1), `Consumption`, `Food`, `InMemoryRepository` from `@oyl/all-of-oyl`.
- Produces: `createFoodsStore(foodsRepo)` → `{ revision, hydrate, add(f), remove(id), all() }`; journal-store `consumptionsOn(day): readonly Consumption[]`, `dailyNutrients(day): Nutrients`.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/state/foods-store.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Food } from '@oyl/all-of-oyl'
import { createFoodsStore } from './foods-store.js'

describe('foods-store', () => {
  it('adds, lists, and removes foods reactively', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const f = await store.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    expect(store.all().map((x) => x.name)).toEqual(['Oatmeal'])
    await store.remove(f.id)
    expect(store.all()).toEqual([])
  })
})
```

In `apps/vanilla-oyl/src/state/journal-store.test.js`, add `Consumption` and `Note` to the existing `@oyl/all-of-oyl` import, then add this describe block (sibling to the others):

```js
describe('consumptionsOn / dailyNutrients', () => {
  it('lists the day consumptions and sums their nutrients, ignoring other kinds', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    const today = DayKey.from(new Date(), 'UTC')
    await store.add(new Consumption({ occurredAt: noon(), nutrients: { calories: 150, protein: 5 }, servings: 2 }))
    await store.add(new Consumption({ occurredAt: noon(), nutrients: { calories: 550 } }))
    await store.add(new Note({ occurredAt: noon(), text: 'walk' }))
    expect(store.consumptionsOn(today)).toHaveLength(2)
    expect(store.dailyNutrients(today)).toEqual({ calories: 150 * 2 + 550, protein: 5 * 2 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/foods-store.test.js src/state/journal-store.test.js`
Expected: FAIL — `Cannot find module './foods-store.js'`; `store.consumptionsOn is not a function`.

- [ ] **Step 3: Create `foods-store.js`**

```js
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Food} Food */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Food>} FoodsRepo */

/**
 * App-level reactive wrapper over the foods Repository — the catalog of domain Foods.
 * Add/remove are persist-first; foods have no in-place mutation (no edit).
 * @param {FoodsRepo} foodsRepo
 */
export function createFoodsStore(foodsRepo) {
  /** @type {Food[]} */
  let foods = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    foods = [...(await foodsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Food} f @returns {Promise<Food>} */
    async add(f) {
      const saved = await foodsRepo.save(f)
      foods = [...foods, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await foodsRepo.delete(id)
      foods = foods.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Food[]} */
    all() {
      revision.get()
      return [...foods]
    },
  }
}
```

- [ ] **Step 4: Add the journal-store methods**

In `apps/vanilla-oyl/src/state/journal-store.js`:

1. Extend the value import on line 1 to:
   ```js
   import { Journal, Transaction, Consumption, sumNutrients } from '@oyl/all-of-oyl'
   ```
2. Add a typedef near the others:
   ```js
   /** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */
   ```
3. Inside `createJournalStore`, before the `return {`, add a local helper:
   ```js
   /** @param {DayKey} day @returns {Consumption[]} */
   const consumptionsOnDay = (day) => /** @type {Consumption[]} */ (journal.entriesOn(day).filter((e) => e instanceof Consumption))
   ```
4. Add these two methods to the returned object (next to `transactionsIn`):
   ```js
   /** The day's consumptions (auto-tracks revision). @param {DayKey} day @returns {readonly Consumption[]} */
   consumptionsOn(day) {
     revision.get()
     return consumptionsOnDay(day)
   },

   /** Summed nutrient totals for the day's consumptions (reactive). @param {DayKey} day @returns {Nutrients} */
   dailyNutrients(day) {
     revision.get()
     return sumNutrients(consumptionsOnDay(day))
   },
   ```

- [ ] **Step 5: Run the tests + app gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/foods-store.test.js src/state/journal-store.test.js`
Expected: PASS.
Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/foods-store.js apps/vanilla-oyl/src/state/foods-store.test.js apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): foods-store + journal-store consumptionsOn/dailyNutrients

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `oyl-food-form` component

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-food-form.js`, `apps/vanilla-oyl/src/components/oyl-food-form.test.js`

**Interfaces:**
- Consumes: `Food` from `@oyl/all-of-oyl`; a `FoodsStore` (Task 2) on `this.store`.
- Produces: `<oyl-food-form>` (`defineFoodForm()`), props `store` (FoodsStore), `onAdded: () => void`.

Pattern to mirror exactly (read it first): `apps/vanilla-oyl/src/components/oyl-account-form.js` and its test `oyl-account-form.test.js` — same structure (form + inputs + `[data-role="error"]` + submit → `new X()` → `store.add`), with nutrient number inputs instead of a currency select.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/oyl-food-form.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository } from '@oyl/all-of-oyl'
import { createFoodsStore } from '../state/foods-store.js'
import { defineFoodForm } from './oyl-food-form.js'

beforeAll(() => defineFoodForm())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} store */
function form(store) {
  const el = /** @type {any} */ (document.createElement('oyl-food-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-food-form>', () => {
  it('adds a food with the typed name and entered nutrients', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = 'Banana'
    q(el, 'input[name="calories"]').value = '105'
    q(el, 'input[name="carbs"]').value = '27'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const foods = store.all()
    expect(foods).toHaveLength(1)
    const first = /** @type {NonNullable<typeof foods[0]>} */ (foods[0])
    expect(first.name).toBe('Banana')
    expect(first.nutrients).toEqual({ calories: 105, carbs: 27 })
    el.remove()
  })

  it('shows an inline error and adds nothing for an empty name', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = form(store)
    q(el, 'input[name="name"]').value = '   '
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.all()).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-food-form.test.js`
Expected: FAIL — `Cannot find module './oyl-food-form.js'`.

- [ ] **Step 3: Create `oyl-food-form.js`**

```js
import { Food } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/foods-store.js').createFoodsStore>} FoodsStore */
/** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */

/** @type {ReadonlyArray<readonly [keyof Nutrients, string]>} */
const NUTRIENT_FIELDS = [
  ['calories', 'Calories'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['waterMl', 'Water (ml)'],
]

// Mirror oyl-account-form.js styles; the nutrient inputs sit in a wrap row.
const styles = sheet(`
  form { display: grid; gap: .5rem; }
  .nutrients { display: flex; flex-wrap: wrap; gap: .4rem; }
  .nutrients input { inline-size: 7rem; }
  input { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylFoodForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {FoodsStore} */
    this.store = /** @type {FoodsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const name = document.createElement('input')
    name.name = 'name'
    name.placeholder = 'Food name'
    name.setAttribute('aria-label', 'Food name')

    /** @type {Array<[keyof Nutrients, HTMLInputElement]>} */
    const inputs = []
    const fields = document.createElement('div')
    fields.className = 'nutrients'
    for (const [key, label] of NUTRIENT_FIELDS) {
      const i = document.createElement('input')
      i.type = 'number'
      i.min = '0'
      i.step = 'any'
      i.name = key
      i.placeholder = label
      i.setAttribute('aria-label', label)
      inputs.push([key, i])
      fields.append(i)
    }

    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add food'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(name, fields, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        /** @type {Nutrients} */
        const nutrients = {}
        for (const [key, input] of inputs) {
          const raw = input.value.trim()
          if (raw !== '') nutrients[key] = Number(raw)
        }
        const food = new Food({ name: name.value.trim(), nutrients })
        await this.store.add(food)
        name.value = ''
        for (const [, input] of inputs) input.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineFoodForm() {
  if (!customElements.get('oyl-food-form')) customElements.define('oyl-food-form', OylFoodForm)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-food-form.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm vanilla typecheck`
Expected: clean.

```bash
git add apps/vanilla-oyl/src/components/oyl-food-form.js apps/vanilla-oyl/src/components/oyl-food-form.test.js
git commit -m "feat(vanilla-oyl): oyl-food-form to add foods to the catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `oyl-nutrition-composer` component

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-nutrition-composer.js`, `apps/vanilla-oyl/src/components/oyl-nutrition-composer.test.js`

**Interfaces:**
- Consumes: `Consumption` from `@oyl/all-of-oyl`; `JournalStore` on `this.store`; `FoodsStore` on `this.foods`; `getDay: () => DayKey`; `tz`.
- Produces: `<oyl-nutrition-composer>` (`defineNutritionComposer()`), props `store`, `foods`, `getDay`, `tz`, `onLogged: () => void`.

The "When" handling mirrors `apps/vanilla-oyl/src/components/oyl-log-form.js`'s `_syncWhen` (read it: sets `whenInput.value = `${getDay().value}T${hh}:${mm}`` from `now()`), so logging targets the viewed day.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/oyl-nutrition-composer.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Food, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createFoodsStore } from '../state/foods-store.js'
import { defineNutritionComposer } from './oyl-nutrition-composer.js'

beforeAll(() => defineNutritionComposer())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

/** @param {any} store @param {any} foods */
function composer(store, foods) {
  const el = /** @type {any} */ (document.createElement('oyl-nutrition-composer'))
  el.store = store
  el.foods = foods
  el.tz = 'UTC'
  el.getDay = () => DayKey.from(new Date(), 'UTC')
  document.body.append(el)
  return el
}

describe('<oyl-nutrition-composer>', () => {
  it('logs a consumption from the selected food with servings', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const oatmeal = await foods.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5 } }))
    const el = composer(store, foods)
    await settle()
    q(el, 'select[name="food"]').value = oatmeal.id
    q(el, 'input[name="servings"]').value = '2'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const today = DayKey.from(new Date(), 'UTC')
    const logged = store.consumptionsOn(today)
    expect(logged).toHaveLength(1)
    const first = /** @type {NonNullable<typeof logged[0]>} */ (logged[0])
    expect(first.servings).toBe(2)
    expect(first.foodId).toBe(oatmeal.id)
    el.remove()
  })

  it('logs an ad-hoc consumption from entered nutrients', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer(store, foods)
    await settle()
    q(el, 'input[name="mode"][value="adhoc"]').checked = true
    q(el, 'input[name="mode"][value="adhoc"]').dispatchEvent(new Event('change', { bubbles: true }))
    q(el, 'input[name="note"]').value = 'Restaurant burger'
    q(el, 'input[name="calories"]').value = '800'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const today = DayKey.from(new Date(), 'UTC')
    const logged = store.consumptionsOn(today)
    expect(logged).toHaveLength(1)
    const first = /** @type {NonNullable<typeof logged[0]>} */ (logged[0])
    expect(first.nutrients).toEqual({ calories: 800 })
    expect(first.note).toBe('Restaurant burger')
    el.remove()
  })

  it('shows an error when food-mode is submitted with no food selected', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer(store, foods)
    await settle()
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.consumptionsOn(DayKey.from(new Date(), 'UTC'))).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition-composer.test.js`
Expected: FAIL — `Cannot find module './oyl-nutrition-composer.js'`.

- [ ] **Step 3: Create `oyl-nutrition-composer.js`**

```js
import { Consumption } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/foods-store.js').createFoodsStore>} FoodsStore */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Nutrients} Nutrients */

/** @type {ReadonlyArray<readonly [keyof Nutrients, string]>} */
const NUTRIENT_FIELDS = [
  ['calories', 'Calories'],
  ['protein', 'Protein (g)'],
  ['carbs', 'Carbs (g)'],
  ['fat', 'Fat (g)'],
  ['waterMl', 'Water (ml)'],
]

const styles = sheet(`
  form { display: grid; gap: .5rem; }
  .modes { display: flex; gap: 1rem; font-size: .9rem; }
  .modes label { display: inline-flex; gap: .3rem; align-items: center; }
  .nutrients { display: flex; flex-wrap: wrap; gap: .4rem; }
  .nutrients input { inline-size: 7rem; }
  .group[hidden] { display: none; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  label.field { display: grid; gap: .15rem; font-size: .8rem; color: var(--color-muted); }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; justify-self: start; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; }
`)

export class OylNutritionComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {FoodsStore} */
    this.foods = /** @type {FoodsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => DayKey} */
    this.getDay = /** @type {() => DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {() => void} */
    this.onLogged = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const modeFood = this._radio('mode', 'food', 'From food', true)
    const modeAdhoc = this._radio('mode', 'adhoc', 'Ad-hoc', false)
    const modes = document.createElement('div')
    modes.className = 'modes'
    modes.append(modeFood.label, modeAdhoc.label)

    const select = document.createElement('select')
    select.name = 'food'
    select.setAttribute('aria-label', 'Food')
    const foodGroup = document.createElement('div')
    foodGroup.className = 'group'
    foodGroup.append(select)
    // Keep the option list in sync with the catalog.
    this.track(() => {
      const cur = select.value
      select.replaceChildren()
      for (const f of this.foods.all()) {
        const o = document.createElement('option')
        o.value = f.id
        o.textContent = f.name
        select.append(o)
      }
      select.value = cur
    })

    const noteInput = document.createElement('input')
    noteInput.name = 'note'
    noteInput.placeholder = 'Meal name'
    noteInput.setAttribute('aria-label', 'Meal name')
    /** @type {Array<[keyof Nutrients, HTMLInputElement]>} */
    const nutrientInputs = []
    const adhocFields = document.createElement('div')
    adhocFields.className = 'nutrients'
    for (const [key, label] of NUTRIENT_FIELDS) {
      const i = document.createElement('input')
      i.type = 'number'
      i.min = '0'
      i.step = 'any'
      i.name = key
      i.placeholder = label
      i.setAttribute('aria-label', label)
      nutrientInputs.push([key, i])
      adhocFields.append(i)
    }
    const adhocGroup = document.createElement('div')
    adhocGroup.className = 'group'
    adhocGroup.hidden = true
    adhocGroup.append(noteInput, adhocFields)

    const servings = document.createElement('input')
    servings.type = 'number'
    servings.name = 'servings'
    servings.min = '0'
    servings.step = 'any'
    servings.value = '1'
    servings.setAttribute('aria-label', 'Servings')
    const servingsField = this._field('Servings', servings)

    const whenInput = document.createElement('input')
    whenInput.type = 'datetime-local'
    whenInput.name = 'when'
    whenInput.setAttribute('aria-label', 'When')
    this._syncWhen(whenInput)
    const whenField = this._field('When', whenInput)

    const log = document.createElement('button')
    log.type = 'submit'
    log.className = 'primary'
    log.textContent = 'Log it'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(modes, foodGroup, adhocGroup, servingsField, whenField, log, error)
    root.append(formEl)

    const onMode = () => {
      const adhoc = modeAdhoc.input.checked
      adhocGroup.hidden = !adhoc
      foodGroup.hidden = adhoc
    }
    modeFood.input.addEventListener('change', onMode, { signal: this.lifecycle })
    modeAdhoc.input.addEventListener('change', onMode, { signal: this.lifecycle })

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const occurredAt = new Date(whenInput.value)
        const s = Number(servings.value)
        let consumption
        if (modeAdhoc.input.checked) {
          /** @type {Nutrients} */
          const nutrients = {}
          for (const [key, input] of nutrientInputs) {
            const raw = input.value.trim()
            if (raw !== '') nutrients[key] = Number(raw)
          }
          const note = noteInput.value.trim()
          consumption = new Consumption({ occurredAt, nutrients, servings: s, ...(note !== '' ? { note } : {}) })
        } else {
          const food = this.foods.all().find((f) => f.id === select.value)
          if (!food) throw new Error('Pick a food to log')
          consumption = new Consumption({ occurredAt, food: { id: food.id, nutrients: food.nutrients }, servings: s })
        }
        await this.store.add(consumption)
        this._syncWhen(whenInput)
        servings.value = '1'
        noteInput.value = ''
        for (const [, input] of nutrientInputs) input.value = ''
        this.onLogged()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }

  /** @param {string} name @param {string} value @param {string} label @param {boolean} checked @returns {{ label: HTMLLabelElement, input: HTMLInputElement }} */
  _radio(name, value, label, checked) {
    const input = document.createElement('input')
    input.type = 'radio'
    input.name = name
    input.value = value
    input.checked = checked
    const el = document.createElement('label')
    el.append(input, document.createTextNode(label))
    return { label: el, input }
  }

  /** @param {string} label @param {HTMLElement} control @returns {HTMLLabelElement} */
  _field(label, control) {
    const el = document.createElement('label')
    el.className = 'field'
    el.append(document.createTextNode(label), control)
    return el
  }

  /** @param {HTMLInputElement} whenInput */
  _syncWhen(whenInput) {
    const day = this.getDay()
    const d = now()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    whenInput.value = `${day.value}T${hh}:${mm}`
  }
}

/** Register the element (idempotent). */
export function defineNutritionComposer() {
  if (!customElements.get('oyl-nutrition-composer')) customElements.define('oyl-nutrition-composer', OylNutritionComposer)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition-composer.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm vanilla typecheck`
Expected: clean.

```bash
git add apps/vanilla-oyl/src/components/oyl-nutrition-composer.js apps/vanilla-oyl/src/components/oyl-nutrition-composer.test.js
git commit -m "feat(vanilla-oyl): oyl-nutrition-composer (food + ad-hoc consumption logging)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `oyl-nutrition` screen

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-nutrition.js`, `apps/vanilla-oyl/src/components/oyl-nutrition.test.js`

**Interfaces:**
- Consumes: `DayKey` from `@oyl/all-of-oyl`; `formatNutrients` from `@oyl/all-of-oyl/format`; `JournalStore` (`consumptionsOn`/`dailyNutrients`/`add`/`remove`), `FoodsStore` (`all`/`add`/`remove`); the composer + food-form components.
- Produces: `<oyl-nutrition>` (`defineNutrition()`), props `store` (JournalStore), `foods` (FoodsStore), `tz`.

Mirror the day-nav from `apps/vanilla-oyl/src/components/oyl-journal.js` (`_day` signal with `(a,b)=>a.equals(b)`, `_go`, `_navButton`, ArrowLeft/Right keydown) and the catalog/section styling from `oyl-finance.js`.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/oyl-nutrition.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Food } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createFoodsStore } from '../state/foods-store.js'
import { defineNutrition } from './oyl-nutrition.js'

beforeAll(() => defineNutrition())
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
/** @param {any} el @param {string} sel */
const qa = (el, sel) => /** @type {any[]} */ ([...el.shadowRoot.querySelectorAll(sel)])

describe('<oyl-nutrition>', () => {
  it('shows the foods catalog and the day\'s totals', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    await foods.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    // Catalog lists the food
    expect(el.shadowRoot.textContent).toContain('Oatmeal')
    // Composer + food form are present
    expect(q(el, 'oyl-nutrition-composer')).toBeTruthy()
    expect(q(el, 'oyl-food-form')).toBeTruthy()
    el.remove()
  })

  it('renders an empty state when no meals are logged for the day', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const foods = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = /** @type {any} */ (document.createElement('oyl-nutrition'))
    el.store = store
    el.foods = foods
    el.tz = 'UTC'
    document.body.append(el)
    await settle()
    expect(q(el, '[data-role="empty"]').hidden).toBe(false)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition.test.js`
Expected: FAIL — `Cannot find module './oyl-nutrition.js'`.

- [ ] **Step 3: Create `oyl-nutrition.js`**

```js
import { DayKey } from '@oyl/all-of-oyl'
import { formatNutrients } from '@oyl/all-of-oyl/format'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { relativeDayLabel, formatDayHeading, formatClockTime } from '@oyl/all-of-oyl/format'
import { defineNutritionComposer } from './oyl-nutrition-composer.js'
import { defineFoodForm } from './oyl-food-form.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {ReturnType<typeof import('../state/foods-store.js').createFoodsStore>} FoodsStore */

const styles = sheet(`
  :host { display: block; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; }
  .rel { color: var(--color-muted); font-size: .85rem; }
  .totals { text-align: center; font-size: 1rem; margin: .4rem 0 1.4rem; color: var(--color-text); }
  .totals .cal { font-size: var(--step-2); font-weight: 700; }
  oyl-nutrition-composer { display: block; margin-block-end: 1.4rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .4rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; align-items: baseline; gap: .6rem; padding: .5rem 0; border-block-end: 1px solid var(--color-border); }
  .meta { color: var(--color-muted); font-size: .85rem; }
  button.del { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; }
  .empty { color: var(--color-muted); padding: 1.5rem 0; text-align: center; }
  oyl-food-form { display: block; margin-block-start: .4rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylNutrition extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {FoodsStore} */
    this.foods = /** @type {FoodsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    defineNutritionComposer()
    defineFoodForm()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('‹', 'Previous day')
    const next = this._navButton('›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    const totals = document.createElement('div')
    totals.className = 'totals'
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-nutrition-composer.js').OylNutritionComposer} */ (document.createElement('oyl-nutrition-composer'))
    composer.store = this.store
    composer.foods = this.foods
    composer.tz = this.tz
    composer.getDay = () => this._day.get()
    composer.onLogged = () => { live.textContent = 'Meal logged' }

    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.dataset.role = 'empty'

    const catLabel = document.createElement('div')
    catLabel.className = 'section-label'
    catLabel.textContent = 'Foods'
    const foodForm = /** @type {import('./oyl-food-form.js').OylFoodForm} */ (document.createElement('oyl-food-form'))
    foodForm.store = this.foods
    foodForm.onAdded = () => { live.textContent = 'Food added' }
    const foodList = document.createElement('ol')

    root.append(daynav, totals, live, composer, list, empty, catLabel, foodForm, foodList)

    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })
    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.composedPath()[0] ?? null)
      const tag = t ? t.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })

    // Day's consumptions + totals (reactive on the journal).
    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      h2.textContent = formatDayHeading(day)
      rel.textContent = relativeDayLabel(day, today)

      const totalSummary = formatNutrients(this.store.dailyNutrients(day))
      totals.textContent = totalSummary === '' ? 'Nothing logged yet' : totalSummary

      const consumptions = [...this.store.consumptionsOn(day)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      const byId = new Map(this.foods.all().map((f) => [f.id, f.name]))
      list.replaceChildren()
      for (const c of consumptions) {
        const li = document.createElement('li')
        const name = document.createElement('span')
        const label = (c.foodId !== undefined ? byId.get(c.foodId) : undefined) ?? c.note ?? 'Meal'
        name.textContent = c.servings === 1 ? label : `${label} ×${c.servings}`
        const meta = document.createElement('span')
        meta.className = 'meta'
        meta.textContent = `${formatNutrients(c.nutrients)} · ${formatClockTime(c.occurredAt)}`
        const del = document.createElement('button')
        del.className = 'del'
        del.type = 'button'
        del.textContent = 'Delete'
        del.setAttribute('aria-label', `Delete ${label}`)
        del.addEventListener('click', () => { void this.store.remove(c.id); live.textContent = 'Meal deleted' })
        li.append(name, meta, del)
        list.append(li)
      }
      empty.hidden = consumptions.length > 0
      empty.textContent = consumptions.length > 0 ? '' : `No meals logged for ${formatDayHeading(day)}. Log one above.`
    })

    // Foods catalog (reactive on the foods store).
    this.track(() => {
      const foods = this.foods.all()
      foodList.replaceChildren()
      for (const f of foods) {
        const li = document.createElement('li')
        const name = document.createElement('span')
        name.textContent = f.name
        const meta = document.createElement('span')
        meta.className = 'meta'
        meta.textContent = formatNutrients(f.nutrients)
        const del = document.createElement('button')
        del.className = 'del'
        del.type = 'button'
        del.textContent = 'Remove'
        del.setAttribute('aria-label', `Remove ${f.name}`)
        del.addEventListener('click', () => { void this.foods.remove(f.id); live.textContent = 'Food removed' })
        li.append(name, meta, del)
        foodList.append(li)
      }
    })
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(glyph, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function defineNutrition() {
  if (!customElements.get('oyl-nutrition')) customElements.define('oyl-nutrition', OylNutrition)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-nutrition.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm vanilla typecheck`
Expected: clean.

```bash
git add apps/vanilla-oyl/src/components/oyl-nutrition.js apps/vanilla-oyl/src/components/oyl-nutrition.test.js
git commit -m "feat(vanilla-oyl): oyl-nutrition screen (day totals, log, foods catalog)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wiring — route, nav, data, and remove consumptions from Journal

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js` (foods store: 3 edit points)
- Modify: `apps/vanilla-oyl/src/main.js` (define + route)
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.js` (ITEMS)
- Modify: `apps/vanilla-oyl/src/components/oyl-journal.js:90` (R3 filter)
- Modify: `apps/vanilla-oyl/src/components/oyl-journal.test.js` (consumption-exclusion case)

**Interfaces:**
- Consumes: `createFoodsStore` (Task 2), `<oyl-nutrition>` (Task 5).

- [ ] **Step 1: Write the failing test (Journal excludes consumptions)**

The existing `oyl-journal.test.js` imports `{ InMemoryRepository, Note, Transaction, Money }` from `@oyl/all-of-oyl` and provides helpers `screen(store)` (mounts `<oyl-journal>` at `TZ = 'America/New_York'`), `rows(el)` (counts `oyl-entry-row` elements), and `txt(el)` (shadow textContent). Add `Consumption` to that import, and add this test inside the existing `describe('<oyl-journal>', ...)` block (assert on row count — robust regardless of how a consumption would render):

```js
it('does not render consumptions in the day view (they live on /nutrition)', async () => {
  const store = createJournalStore(new InMemoryRepository(), TZ)
  const el = screen(store)
  await store.add(new Note({ occurredAt: new Date(), text: 'a note' }))
  await store.add(new Consumption({ occurredAt: new Date(), nutrients: { calories: 150 }, note: 'Oatmeal' }))
  await Promise.resolve()
  expect(rows(el)).toHaveLength(1) // only the Note; the Consumption is excluded
  expect(txt(el)).toContain('a note')
  el.remove()
})
```

- [ ] **Step 2: Run the journal test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-journal.test.js`
Expected: FAIL — the consumption ("Oatmeal") currently renders in the journal list.

- [ ] **Step 3: Exclude consumptions from the Journal list (R3)**

In `apps/vanilla-oyl/src/components/oyl-journal.js` line 90, change:

```js
const entries = [...this.store.entriesOn(day)].filter((e) => e.kind !== 'transaction').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
```
to:
```js
const entries = [...this.store.entriesOn(day)].filter((e) => e.kind !== 'transaction' && e.kind !== 'consumption').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
```

- [ ] **Step 4: Wire the foods store in `data.js`**

In `apps/vanilla-oyl/src/state/data.js`:
1. Add the import near the other store imports: `import { createFoodsStore } from './foods-store.js'`
2. After line 43 (`const accounts = createAccountsStore(repos.accounts)`), add:
   ```js
   const foods = createFoodsStore(repos.foods)
   ```
3. In the boot `Promise.all([...])` (line 88), add `foods.hydrate()` alongside the other `.hydrate()` calls.
4. In the returned object (line 154), add `foods` to the list (e.g. after `accounts`).

- [ ] **Step 5: Wire the route + nav**

In `apps/vanilla-oyl/src/main.js`:
1. Add the import: `import { defineNutrition } from './components/oyl-nutrition.js'`
2. Call `defineNutrition()` in the boot define block (next to `defineFinance()`).
3. Add a `nutrition` route factory next to the `finance` one:
   ```js
   nutrition: () => {
     const view = /** @type {import('./components/oyl-nutrition.js').OylNutrition} */ (document.createElement('oyl-nutrition'))
     view.store = dataState.journal
     view.foods = dataState.foods
     view.tz = defaultTimezone()
     return view
   },
   ```

In `apps/vanilla-oyl/src/components/oyl-nav.js`, add `['nutrition', 'Nutrition']` to `ITEMS` immediately after `['journal', 'Journal']`.

- [ ] **Step 6: Run the full gate + manual verify**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all green (journal exclusion test passes; everything else intact).

Manual: `pnpm vanilla dev`, open `http://localhost:8041/nutrition?seed`. Expect: a Nutrition nav tab; the day shows seeded consumptions with totals; logging from a food and ad-hoc both add a meal with updated totals; adding/removing a food works; the Journal screen (`/journal`) no longer lists meals. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/main.js apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/components/oyl-journal.js apps/vanilla-oyl/src/components/oyl-journal.test.js
git commit -m "feat(vanilla-oyl): wire /nutrition route + nav; remove meals from Journal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of Done (whole feature)

- `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green.
- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- `/nutrition` deep-loads with a nav tab; food + ad-hoc logging add a visible meal with updated daily totals; foods add/remove works; consumptions no longer appear in Journal.
- One nutrient formatter, in `@oyl/all-of-oyl/format`; aggregation (`sumNutrients`) in core.
