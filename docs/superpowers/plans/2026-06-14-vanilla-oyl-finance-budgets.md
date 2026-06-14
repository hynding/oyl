# vanilla-oyl Finance Slice 2 (Budgets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Budgets** section on `#/finance` — set a monthly cap per category, see this month's spending against it (bar + spent/limit, over→amber), add/delete.

**Architecture:** `Budget` wraps a `Goal` (`finance.spend.<cat>`, atMost/month), so progress tracks the transactions Slice 1 records. New `BudgetsStore` (GoalsStore minus pause), `journalStore.budgetStatus(budget, today) → {progress, spent}`, a `budgetLabel` helper, a compact inline budget add, per-budget progress rows, wired into the existing finance screen.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Budget`/`Money`/`GoalProgress`/`DayKey`).

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-budgets-design.md`.

---

## Conventions

- `.js` + JSDoc strict + checkJs. **No `innerHTML`**. STATIC imports. Idempotent `defineX()`. Double-cast defaults.
- Bar width via `style.setProperty('inline-size', …)` (round-trips in happy-dom). Reuse the shared `inlineConfirm` (`confirm-yes`/`confirm-no`) + `formatMoney` from `vault/format.js`.
- Assert child content via the child's `shadowRoot`/props; screen tests use **real** stores + `settle = () => new Promise(r => setTimeout(r, 0))`.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `budget/format.js`, `state/budgets-store.js`, `components/oyl-budget-form.js`, `components/oyl-budget-row.js` (+ tests).
**Modified:** `state/journal-store.js`, `components/oyl-finance.js`, `state/data.js`, `main.js` (+ extend journal-store / oyl-finance / data tests).

---

## Task 1: `budget/format.js` — `budgetLabel`

**Files:** Create `apps/vanilla-oyl/src/budget/format.js`; test `apps/vanilla-oyl/src/budget/format.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/budget/format.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { Money } from '@oyl/all-of-oyl'
import { budgetLabel } from './format.js'

/** @param {boolean} met @returns {any} */
const prog = (met) => ({ current: 0, target: 0, ratio: met ? 0.5 : 1, met, paused: false, empty: false })

describe('budgetLabel', () => {
  it('shows spent/limit and remaining when under budget', () => {
    expect(budgetLabel(prog(true), Money.of(180000, 'USD', 2), Money.of(220000, 'USD', 2))).toBe('$1800.00 of $2200.00 · $400.00 left')
  })
  it('shows over-by when over budget', () => {
    expect(budgetLabel(prog(false), Money.of(230000, 'USD', 2), Money.of(220000, 'USD', 2))).toBe('$2300.00 of $2200.00 · over by $100.00')
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/budget/format.test.js`

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/budget/format.js`:
```js
import { formatMoney } from '../vault/format.js'

/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$1800.00 of $2200.00 · $400.00 left" (under) / "… · over by $100.00" (over). @param {GoalProgress} progress @param {Money} spent @param {Money} limit @returns {string} */
export function budgetLabel(progress, spent, limit) {
  const base = `${formatMoney(spent)} of ${formatMoney(limit)}`
  return progress.met === false
    ? `${base} · over by ${formatMoney(spent.subtract(limit))}`
    : `${base} · ${formatMoney(limit.subtract(spent))} left`
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/budget/format.js apps/vanilla-oyl/src/budget/format.test.js
git commit -m "feat(vanilla-oyl): budgetLabel (spent/limit + remaining/over)"
```

---

## Task 2: `state/budgets-store.js` — `createBudgetsStore`

**Files:** Create `apps/vanilla-oyl/src/state/budgets-store.js`; test `apps/vanilla-oyl/src/state/budgets-store.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/state/budgets-store.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Budget, Money } from '@oyl/all-of-oyl'
import { createBudgetsStore } from './budgets-store.js'

/** @param {string} [cat] @returns {Budget} */
const budget = (cat = 'groceries') => new Budget({ category: cat, limit: Money.of(220000, 'USD', 2) })

describe('createBudgetsStore', () => {
  it('add persists and reflects in all(); remove deletes', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createBudgetsStore(repo)
    const saved = await store.add(budget())
    expect(store.all()).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await store.remove(saved.id)
    expect(store.all()).toHaveLength(0)
  })

  it('hydrate rebuilds from the repo', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    await repo.save(budget('dining'))
    const store = createBudgetsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/state/budgets-store.js`:
```js
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Budget>} BudgetsRepo */

/**
 * App-level reactive wrapper over the budgets Repository — the list of domain Budgets.
 * Add/remove are persist-first; budgets have no in-place mutation (no pause), so no
 * stateful methods. Progress is read via journalStore.budgetStatus (needs the Journal),
 * so this store stays journal-agnostic.
 * @param {BudgetsRepo} budgetsRepo
 */
export function createBudgetsStore(budgetsRepo) {
  /** @type {Budget[]} */
  let budgets = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    budgets = [...(await budgetsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Budget} b @returns {Promise<Budget>} */
    async add(b) {
      const saved = await budgetsRepo.save(b)
      budgets = [...budgets, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await budgetsRepo.delete(id)
      budgets = budgets.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Budget[]} */
    all() {
      revision.get()
      return [...budgets]
    },
  }
}
```

- [ ] **Step 4: Run → PASS** (2 tests). **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/budgets-store.js apps/vanilla-oyl/src/state/budgets-store.test.js
git commit -m "feat(vanilla-oyl): BudgetsStore (add/remove/all, journal-agnostic)"
```

---

## Task 3: `journalStore.budgetStatus(budget, day)`

**Files:** Modify `apps/vanilla-oyl/src/state/journal-store.js`; test `apps/vanilla-oyl/src/state/journal-store.test.js`.

- [ ] **Step 1: Add the failing test.** In `journal-store.test.js`, add `Budget` to the import (`Money` already imported from Slice 1):
```js
import { InMemoryRepository, Note, Measurement, Goal, Transaction, Budget, Money, DayKey, DayRange } from '@oyl/all-of-oyl'
```
Append inside `describe('createJournalStore', …)`:
```js
  it('budgetStatus reports spent + progress, reflecting transactions', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    const budget = new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) }) // $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const under = store.budgetStatus(budget, dayOf())
    expect(under.spent.minor).toBe(6000)
    expect(under.progress.met).toBe(true)            // $60 ≤ $100
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(5000, 'USD', 2), category: 'groceries', direction: 'expense' }))
    expect(store.budgetStatus(budget, dayOf()).progress.met).toBe(false) // $110 > $100
  })
```

- [ ] **Step 2: Run → FAIL** (`store.budgetStatus is not a function`).

- [ ] **Step 3: Implement** in `apps/vanilla-oyl/src/state/journal-store.js`.
Add typedefs near the others:
```js
/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */
```
Add this method to the returned object, right after the `transactionsIn` method's closing `},`:
```js
    /** Budget progress + spent (Money) for the month containing `day` (reactive). @param {Budget} budget @param {DayKey} day @returns {{ progress: GoalProgress, spent: Money }} */
    budgetStatus(budget, day) {
      revision.get()
      return { progress: budget.progressOn(journal, day), spent: budget.spent(journal, day) }
    },
```

- [ ] **Step 4: Run → PASS** (existing + 1 new). **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): journalStore.budgetStatus (progress + spent for a budget)"
```

---

## Task 4: `components/oyl-budget-form.js` — compact inline add

**Files:** Create `apps/vanilla-oyl/src/components/oyl-budget-form.js`; test `apps/vanilla-oyl/src/components/oyl-budget-form.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-budget-form.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { Budget } from '@oyl/all-of-oyl'
import { defineBudgetForm } from './oyl-budget-form.js'

beforeAll(() => defineBudgetForm())
/** @param {{ add?: (b: any) => Promise<any> }} store */
function form(store) {
  const el = /** @type {import('./oyl-budget-form.js').OylBudgetForm} */ (document.createElement('oyl-budget-form'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-budget-form>', () => {
  it('adds a budget with category + limit', async () => {
    const added = /** @type {any[]} */ ([])
    const el = form({ add: async (b) => { added.push(b); return b } })
    q(el, 'select[name="category"]').value = 'groceries'
    q(el, 'input[name="limit"]').value = '500'
    q(el, 'select[name="currency"]').value = 'USD'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Budget)
    expect(added[0].category).toBe('groceries')
    expect(added[0].limit.minor).toBe(50000)
    el.remove()
  })

  it('rejects a non-positive limit with an inline error', async () => {
    const added = /** @type {any[]} */ ([])
    const el = form({ add: async (b) => { added.push(b); return b } })
    q(el, 'input[name="limit"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-budget-form.js`:
```js
import { Budget, Money } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/budgets-store.js').createBudgetsStore>} BudgetsStore */

const CATEGORIES = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']
const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr 6rem auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylBudgetForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {BudgetsStore} */
    this.store = /** @type {BudgetsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const category = document.createElement('select')
    category.name = 'category'
    category.setAttribute('aria-label', 'Category')
    for (const c of CATEGORIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      category.append(o)
    }
    const limit = document.createElement('input')
    limit.name = 'limit'
    limit.type = 'number'
    limit.min = '0'
    limit.step = 'any'
    limit.placeholder = 'Limit'
    const currency = document.createElement('select')
    currency.name = 'currency'
    currency.setAttribute('aria-label', 'Currency')
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add budget'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(category, limit, currency, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const budget = new Budget({ category: category.value, limit: Money.fromMajor(Number(limit.value), currency.value) })
        await this.store.add(budget)
        limit.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineBudgetForm() {
  if (!customElements.get('oyl-budget-form')) customElements.define('oyl-budget-form', OylBudgetForm)
}
```
(No manual amount guard: `Money.fromMajor(0,…)` → `new Budget` throws "limit must be positive", caught inline.)

- [ ] **Step 4: Run → PASS** (2 tests). **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-budget-form.js apps/vanilla-oyl/src/components/oyl-budget-form.test.js
git commit -m "feat(vanilla-oyl): oyl-budget-form (compact category+limit add)"
```

---

## Task 5: `components/oyl-budget-row.js` — per-budget progress row

**Files:** Create `apps/vanilla-oyl/src/components/oyl-budget-row.js`; test `apps/vanilla-oyl/src/components/oyl-budget-row.test.js`. Like the goal row (bar + label + inline-confirm delete) minus pause/resume.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-budget-row.test.js`:
```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Budget, Money } from '@oyl/all-of-oyl'
import { defineBudgetRow } from './oyl-budget-row.js'

beforeAll(() => defineBudgetRow())
const limit = Money.of(220000, 'USD', 2) // $2200
const mkBudget = () => new Budget({ category: 'groceries', limit })
/** @param {boolean} met @param {number} spentMinor @param {number} ratio @returns {any} */
const status = (met, spentMinor, ratio) => ({ progress: { current: 0, target: 0, ratio, met, paused: false, empty: false }, spent: Money.of(spentMinor, 'USD', 2) })

/** @param {any} budget @param {any} st @param {{ onDelete?: any }} [h] */
function row(budget, st, h = {}) {
  const el = /** @type {import('./oyl-budget-row.js').OylBudgetRow} */ (document.createElement('oyl-budget-row'))
  el.budget = budget
  el.status = st
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-budget-row>', () => {
  it('under budget: bar sized to ratio, "left" label, no .over', () => {
    const el = row(mkBudget(), status(true, 180000, 180000 / 220000))
    const r = root(el)
    expect(r.textContent).toContain('groceries')
    expect(r.textContent).toContain('$400.00 left')
    expect(r.querySelector('.bar.over')).toBeNull()
    const fill = /** @type {HTMLElement} */ (r.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).not.toContain('NaN')
    el.remove()
  })

  it('over budget: .over styling + "over by" label', () => {
    const el = row(mkBudget(), status(false, 230000, 1))
    const r = root(el)
    expect(r.querySelector('.bar.over')).toBeTruthy()
    expect(r.textContent).toContain('over by $100.00')
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const b = mkBudget()
    const el = row(b, status(true, 0, 0), { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(b.id)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-budget-row.js`:
```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { budgetLabel } from '../budget/format.js'

/** @typedef {import('@oyl/all-of-oyl').Budget} Budget */
/** @typedef {{ progress: import('@oyl/all-of-oyl').GoalProgress, spent: import('@oyl/all-of-oyl').Money }} BudgetStatus */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .3rem 1rem; align-items: center; padding: .85rem 0; }
  .title { grid-column: 1; grid-row: 1; color: var(--color-text); text-transform: capitalize; }
  .actions { grid-column: 2; grid-row: 1; align-self: center; display: inline-flex; }
  .bar { grid-column: 1 / -1; grid-row: 2; block-size: .5rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
  .bar.over .fill { background: var(--color-warn); }
  .label { grid-column: 1 / -1; grid-row: 3; color: var(--color-muted); font-size: var(--step--1); }
  .label.over { color: var(--color-warn); }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylBudgetRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Budget} */
    this.budget = /** @type {Budget} */ (/** @type {unknown} */ (undefined))
    /** @type {BudgetStatus} */
    this.status = /** @type {BudgetStatus} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const { progress, spent } = this.status
    const over = progress.met === false
    const row = document.createElement('div')
    row.className = 'row'

    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.budget.name ?? this.budget.category

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderDelete(actions)

    const bar = document.createElement('div')
    bar.className = over ? 'bar over' : 'bar'
    const fill = document.createElement('div')
    fill.className = 'fill'
    fill.style.setProperty('inline-size', `${Math.round(progress.ratio * 100)}%`)
    bar.append(fill)

    const label = document.createElement('div')
    label.className = over ? 'label over' : 'label'
    label.textContent = budgetLabel(progress, spent, this.budget.limit)

    row.append(title, actions, bar, label)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderDelete(mount) {
    mount.replaceChildren()
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.budget.id),
        restore: () => this._renderDelete(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(del)
  }
}

/** Register the element (idempotent). */
export function defineBudgetRow() {
  if (!customElements.get('oyl-budget-row')) customElements.define('oyl-budget-row', OylBudgetRow)
}
```

- [ ] **Step 4: Run → PASS** (3 tests). **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-budget-row.js apps/vanilla-oyl/src/components/oyl-budget-row.test.js
git commit -m "feat(vanilla-oyl): oyl-budget-row (progress bar, over→warn, inline-confirm delete)"
```

---

## Task 6: `components/oyl-finance.js` — Budgets section

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-finance.js`; test `apps/vanilla-oyl/src/components/oyl-finance.test.js`.

- [ ] **Step 1: Extend the test.** In `oyl-finance.test.js`:
Add imports:
```js
import { InMemoryRepository, Transaction, Budget, Money } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { createBudgetsStore } from '../state/budgets-store.js'
```
Update the `screen()` helper to also wire a budgets store (default empty so existing tests pass):
```js
/** @param {any} store @param {any} [budgets] */
function screen(store, budgets = createBudgetsStore(new InMemoryRepository())) {
  const el = /** @type {import('./oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
  el.store = store
  el.budgets = budgets
  el.tz = TZ
  document.body.append(el)
  return el
}
```
Append a new test inside `describe('<oyl-finance>', …)`:
```js
  it('renders a Budgets section with per-budget progress', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6000, at(10)))         // $60 spent this month
    const budgets = createBudgetsStore(/** @type {any} */ (new InMemoryRepository()))
    await budgets.add(new Budget({ category: 'groceries', limit: Money.of(10000, 'USD', 2) })) // $100
    const el = screen(store, budgets)
    await Promise.resolve()
    const rowsList = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-budget-row')])
    expect(rowsList).toHaveLength(1)
    expect(rowsList[0].shadowRoot.textContent).toContain('groceries')
    expect(rowsList[0].shadowRoot.textContent).toContain('$40.00 left')   // 100 - 60
    el.remove()
  })
```

- [ ] **Step 2: Run → FAIL** (no `oyl-budget-row` / `this.budgets` undefined): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`

- [ ] **Step 3: Implement** — edits to `apps/vanilla-oyl/src/components/oyl-finance.js`:

**3a.** After the `defineVaultItem` import, add:
```js
import { defineBudgetForm } from './oyl-budget-form.js'
import { defineBudgetRow } from './oyl-budget-row.js'
```
**3b.** Add a typedef near the `JournalStore` one:
```js
/** @typedef {ReturnType<typeof import('../state/budgets-store.js').createBudgetsStore>} BudgetsStore */
```
**3c.** In the constructor, after `this.tz = 'UTC'`, add:
```js
    /** @type {BudgetsStore} */
    this.budgets = /** @type {BudgetsStore} */ (/** @type {unknown} */ (undefined))
```
**3d.** In the `sheet(...)` template, after the `oyl-finance-composer { … }` rule, add:
```js
  oyl-budget-form { display: block; margin: .4rem 0 .8rem; }
```
**3e.** Replace `defineFinanceComposer()` + `defineVaultItem()` (the two define calls in `render()`) with:
```js
    defineFinanceComposer()
    defineVaultItem()
    defineBudgetForm()
    defineBudgetRow()
```
**3f.** After the ledger's `const empty = document.createElement('div'); empty.className = 'empty'` block, add the Budgets-section nodes:
```js
    const budgetLabelEl = document.createElement('div')
    budgetLabelEl.className = 'section-label'
    budgetLabelEl.textContent = 'Budgets'
    const budgetForm = /** @type {import('./oyl-budget-form.js').OylBudgetForm} */ (document.createElement('oyl-budget-form'))
    budgetForm.store = this.budgets
    budgetForm.onAdded = () => { live.textContent = 'Budget added' }
    const budgetList = document.createElement('ol')
    const budgetEmpty = document.createElement('div')
    budgetEmpty.className = 'empty'
```
**3g.** Replace the `root.append(...)` line (ledger nodes) with the same plus the budgets nodes:
```js
    root.append(h2, live, composer, label, list, empty, budgetLabelEl, budgetForm, budgetList, budgetEmpty)
```
**3h.** At the END of the `this.track(() => { … })` callback — after the ledger's `empty.textContent = …` line and before the callback's closing `})` — insert (reuse the `today` already computed at the top of the callback):
```js

      const budgets = this.budgets.all()
      budgetList.replaceChildren()
      for (const b of budgets) {
        const row = /** @type {import('./oyl-budget-row.js').OylBudgetRow} */ (document.createElement('oyl-budget-row'))
        row.budget = b
        row.status = this.store.budgetStatus(b, today)
        row.onDelete = (id) => { void this.budgets.remove(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(row)
        budgetList.append(li)
      }
      budgetEmpty.hidden = budgets.length > 0
      budgetEmpty.textContent = budgets.length > 0 ? '' : 'No budgets yet.'
```

- [ ] **Step 4: Run → PASS** (existing finance tests + 1 new). **Step 5: Typecheck → clean.** **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): oyl-finance Budgets section (inline add + progress rows)"
```

---

## Task 7: Wire-up — data state + finance route

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`, `apps/vanilla-oyl/src/main.js`; test `apps/vanilla-oyl/src/state/data.test.js`.

- [ ] **Step 1: Wire `data.js`.**
1. Import after the goals-store import:
```js
import { createBudgetsStore } from './budgets-store.js'
```
2. After `const goals = createGoalsStore(repos.goals)`:
```js
  const budgets = createBudgetsStore(repos.budgets)
```
3. Inside `refresh()`, after `await goals.hydrate()`:
```js
    await budgets.hydrate()
```
4. Add `budgets` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets }
```

- [ ] **Step 2: `data.test.js` assertion.** Inside `describe('data state', …)`:
```js
  it('exposes a budgets store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.budgets.all).toBe('function')
  })
```

- [ ] **Step 3: `main.js`.** In the `finance:` route, set the budgets store on the view (alongside `view.store`/`view.tz`):
```js
    finance: () => {
      const view = /** @type {import('./components/oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
      view.store = dataState.journal
      view.budgets = dataState.budgets
      view.tz = defaultTimezone()
      return view
    },
```

- [ ] **Step 4: Full suite + typecheck.**
Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run` — expect all green (193 prior + ~11 new ≈ 204). Report the total.
Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` — clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire budgets store into data state + finance route"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload**), open `#/finance`, Load demo data:
  - A **Budgets** section (below the ledger) shows the seeded grocery budget with a bar + "spent $X of $Y · $Z left".
  - Add a budget (category + limit) via the inline form → appears; add matching expenses in the ledger → the budget bar/label update; push spending over the limit → bar + label turn **amber** with "over by $…".
  - Delete a budget via the inline confirm; `$0` limit rejected; no budgets → "No budgets yet."
- [ ] **Final code review** of the branch, then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** `budgetLabel` (T1); `BudgetsStore` (T2); `journalStore.budgetStatus` (T3); compact `oyl-budget-form` with domain-validated limit (T4); `oyl-budget-row` bar/over-warn/delete (T5); finance Budgets section + `budgets` prop (T6); data/main wiring + assertion (T7). Over→`--color-warn`, add/delete only, no name field — all honored.
- **Type consistency:** `budgetStatus → { progress: GoalProgress, spent: Money }` used by row's `status`; `BudgetsStore.all/add/remove`; `budgetLabel(progress, spent, limit)`; `Money.fromMajor`/`Money.subtract` (same-currency, safe).
- **No regressions:** the `oyl-finance` `screen()` helper now defaults a budgets store, so the Slice-1 ledger tests keep passing (new section shows "No budgets yet"). The finance route gains `view.budgets`.
- **Test robustness:** budget row bar via `setProperty`/`getPropertyValue` (+ no-`NaN` guard); finance budget test anchors the transaction to today (`at(10)`) so it's in the current month; asserts via the row's shadow root.
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
