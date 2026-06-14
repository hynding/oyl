# Vanilla-OYL Finance Screen — Slice 2 (Budgets) — Design

**Status:** approved (recommendations accepted)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessor:** Finance Slice 1 (transactions ledger), merged. Adds a **Budgets** section to the existing `#/finance` screen. Slice 3 = accounts + the subscription→transaction seam.

---

## What this is

A **Budgets** section on `#/finance` (below the month ledger): set a monthly spending cap per category and see this month's spending against it. `Budget` wraps a `Goal` engine (`finance.spend.<category>`, atMost, month, empty='met'), so progress recomputes automatically from the transactions Slice 1 records — they're the same `finance.spend.<category>` metrics.

### Decisions (settled)

1. **Budgets section on `#/finance`** (below the ledger), with a **compact inline add** (category + limit + currency + Add — like `oyl-gift-idea-form`), distinct from the prominent expense composer. Money in one place; no 8th nav item.
2. **`journalStore.budgetStatus(budget, today)`** → `{ progress, spent }` (reactive passthrough): `progress = budget.progressOn(journal, today)` (ratio/met), `spent = budget.spent(journal, today)` (Money, currency-correct).
3. **`budgetLabel(progress, spent, limit)`**: under → `"$1800 of $2200 · $400 left"`; over → `"$2300 of $2200 · over by $100"`.
4. **Over budget → `--color-warn`** (bar fill + label), not danger — over is "needs attention," consistent with overdue. Under → accent fill.
5. **Add/delete only** (Budget has no pause). **No manual amount guard** — `Budget`'s constructor throws on `limit ≤ 0` (`Money.fromMajor(0,…)` → non-positive → throws), caught inline. **No name field** in v1 (category is the title).
6. **`BudgetsStore`** mirrors `GoalsStore` minus pause/resume.

### Out of scope

- Editing budgets; budget name; per-budget period other than month; income.
- Accounts + the subscription→transaction seam (Slice 3).

---

## Domain API this consumes (verified)

- `new Budget({ id?, name?, category: string (slug), limit: Money (positive) })` — throws `INVALID_QUANTITY` on empty name / `limit.minor ≤ 0`. `.category`, `.limit` (Money), `.name?`, `.id`.
- `budget.progressOn(journal, day): GoalProgress` (atMost/month engine — `met` false ⇒ over budget; empty month ⇒ met true). `budget.spent(journal, month): Money`; `budget.remaining(journal, month): Money`.
- `@oyl/all-of-oyl` exports `Budget`, `Money`, `GoalProgress`, `DayKey`. The `budgets` codec is in `COLLECTIONS` → `repos.budgets` exists (seed has a grocery budget).

---

## Architecture

### 1. `src/state/budgets-store.js` — `createBudgetsStore(budgetsRepo)`

Mirrors `GoalsStore` minus pause/resume (budgets have no in-place mutation):
```js
export function createBudgetsStore(budgetsRepo) {
  /** @type {Budget[]} */ let budgets = []
  let n = 0
  const revision = signal(0)
  async function hydrate() { budgets = [...(await budgetsRepo.list())]; revision.set((n += 1)) }
  return {
    revision, hydrate,
    /** @param {Budget} b @returns {Promise<Budget>} */
    async add(b) { const saved = await budgetsRepo.save(b); budgets = [...budgets, saved]; revision.set((n += 1)); return saved },
    /** @param {Id} id */
    async remove(id) { await budgetsRepo.delete(id); budgets = budgets.filter((x) => x.id !== id); revision.set((n += 1)) },
    /** @returns {readonly Budget[]} */
    all() { revision.get(); return [...budgets] },
  }
}
```

### 2. `src/state/journal-store.js` — `budgetStatus(budget, day)`

```js
    /** Budget progress + spent (Money) for the month containing `day` (reactive). @param {Budget} budget @param {DayKey} day @returns {{ progress: GoalProgress, spent: Money }} */
    budgetStatus(budget, day) {
      revision.get()
      return { progress: budget.progressOn(journal, day), spent: budget.spent(journal, day) }
    },
```
Add `Budget`/`Money` typedefs (GoalProgress/DayKey already present).

### 3. `src/budget/format.js` — `budgetLabel`

```js
import { formatMoney } from '../vault/format.js'
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$1800 of $2200 · $400 left" (under) / "… · over by $100" (over). @param {GoalProgress} progress @param {Money} spent @param {Money} limit @returns {string} */
export function budgetLabel(progress, spent, limit) {
  const base = `${formatMoney(spent)} of ${formatMoney(limit)}`
  return progress.met === false
    ? `${base} · over by ${formatMoney(spent.subtract(limit))}`
    : `${base} · ${formatMoney(limit.subtract(spent))} left`
}
```
(`spent` and `limit` share a currency — `budget.spent` uses `limit.currency` — so `subtract` is safe.)

### 4. `src/components/oyl-budget-form.js` — compact inline add

Like `oyl-gift-idea-form`. Properties `store` (BudgetsStore), `onAdded`. A grid `form` with: category `<select name="category" aria-label="Category">` (preset slugs `groceries`/`dining`/`transport`/`utilities`/`entertainment`/`other` — same set as the expense composer), an amount `<input name="limit" type="number" min="0" step="any" placeholder="Limit">`, a currency `<select name="currency">` (USD/EUR/GBP), and an "Add budget" submit + `[data-role="error"]`. Submit (async):
```js
try {
  const budget = new Budget({ category: category.value, limit: Money.fromMajor(Number(amount.value), currency.value) })
  await this.store.add(budget)
  amount.value = ''
  this.onAdded()
} catch (err) { error.textContent = err instanceof Error ? err.message : String(err) }
```
No manual amount guard — `new Budget` throws "limit must be positive" for `0`/empty (`Number('')=0`), caught inline. STATIC import `{ Budget, Money }`. `defineBudgetForm()` idempotent.

### 5. `src/components/oyl-budget-row.js` — per-budget progress row

Like the goal row (bar + label + inline-confirm delete) minus pause/resume. Properties: `budget` (Budget), `status` (`{ progress, spent }`), `onDelete` (`(id) => void`).
- **title** = `budget.name ?? budget.category` (`text-transform: capitalize`).
- **bar**: `.bar` track + `.fill` (`style.setProperty('inline-size', `${Math.round(progress.ratio*100)}%`)`); `over = progress.met === false` → `.bar.over .fill { background: var(--color-warn) }`, else accent (R4).
- **label**: `budgetLabel(progress, spent, budget.limit)`; `.label.over { color: var(--color-warn) }` when over.
- **Delete** via shared `inlineConfirm`.

`defineBudgetRow()` idempotent.

### 6. `src/components/oyl-finance.js` — add the Budgets section

The screen gains a **`budgets`** property (BudgetsStore) alongside `store` (JournalStore) and `tz`. Call `defineBudgetForm()` + `defineBudgetRow()` in `render()`. After the ledger nodes, build: a `section-label` "Budgets", an `<oyl-budget-form>` (`store = this.budgets`, `onAdded → live`), a budget `<ol>`, and an empty state. In the existing `track()` (after the ledger loop; reuse the `today` already computed):
```js
const budgets = this.budgets.all()
budgetList.replaceChildren()
for (const b of budgets) {
  const row = /** @type {import('./oyl-budget-row.js').OylBudgetRow} */ (document.createElement('oyl-budget-row'))
  row.budget = b
  row.status = this.store.budgetStatus(b, today)        // journal store
  row.onDelete = (id) => { void this.budgets.remove(id); live.textContent = 'Deleted' }
  const li = document.createElement('li'); li.append(row); budgetList.append(li)
}
budgetEmpty.hidden = budgets.length > 0
budgetEmpty.textContent = budgets.length > 0 ? '' : 'No budgets yet.'
```
The track now reads `this.store` (journal revision — ledger + `budgetStatus`) **and** `this.budgets` (budgets revision), so budgets recompute when transactions OR budgets change.

### 7. Wiring

- `src/state/data.js`: `import { createBudgetsStore }`; `const budgets = createBudgetsStore(repos.budgets)`; `await budgets.hydrate()` in `refresh()`; add `budgets` to the returned object.
- `src/main.js`: in the `finance:` route, also set `view.budgets = dataState.budgets`.

---

## Data flow

```
add budget (inline form) → new Budget({category, limit}) → budgets.add → persist-first → list repaints
log/delete an expense (ledger) → journal revision bumps → each budget's budgetStatus recomputes → bars/labels update (spent changed)
delete budget → budgets.remove(id) → soft-delete → list repaints
```

## Error handling

- `limit ≤ 0`/empty → `new Budget` throws → inline error (no manual guard). Preset category is always a valid slug.
- `budget.spent`/`subtract` share the limit's currency (no `CURRENCY_MISMATCH`).

## Testing (Vitest + happy-dom)

- **`budget/format.test.js`** (new): `budgetLabel` under (`Money.of(180000,'USD')` spent vs `Money.of(220000,'USD')` limit → "$1800.00 of $2200.00 · $400.00 left") and over (spent 230000 → "… · over by $100.00"), using a `{met:true|false}` progress stub.
- **`budgets-store.test.js`** (new): `add`/`all`/`remove` persist-first; `hydrate` rebuilds.
- **`journal-store.test.js`** (extend): `budgetStatus(budget, day)` returns `{progress, spent}` reflecting transactions — add a `Transaction` in `groceries`, a grocery `Budget`, assert `spent.minor`/`progress.met` (under) and that exceeding the limit flips `progress.met` to false.
- **`oyl-budget-form.test.js`** (new): adds a `Budget` with the selected category + `Money.fromMajor` limit; `limit = 0` → inline error + no add.
- **`oyl-budget-row.test.js`** (new): under-budget renders the bar + "$… left", no `.over`; over-budget (`met:false`) adds `.over` to the bar/label + "over by …"; Delete → confirm-yes calls `onDelete(id)`, confirm-no reverts; `.fill` `inline-size` has no `NaN`.
- **`oyl-finance.test.js`** (extend): **update the `screen()` helper to also set `el.budgets = createBudgetsStore(new InMemoryRepository())`** (so the existing ledger tests keep passing — the new section shows "No budgets yet"). New test: with a seeded budget + a matching transaction (real stores), the Budgets section renders an `oyl-budget-row` whose `.shadowRoot` shows the spent/limit label; adding via the inline form makes one appear; deleting removes it.

## File structure

```
apps/vanilla-oyl/src/
  state/budgets-store.js          (new)
  state/journal-store.js          (modify: add budgetStatus)
  budget/format.js                (new)
  components/oyl-budget-form.js    (new)
  components/oyl-budget-row.js     (new)
  components/oyl-finance.js        (modify: Budgets section + budgets prop)
  state/data.js                   (modify: wire budgets store)
  main.js                         (modify: finance route sets view.budgets)
  + new tests (budget/format, budgets-store, oyl-budget-form, oyl-budget-row); extend journal-store + oyl-finance tests
```
No nav/route additions — budgets live on the existing `#/finance`.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/finance`:
- A **Budgets** section (below the ledger) shows the seeded grocery budget with its bar + "spent $X of $Y · $Z left" for the current month.
- Add a budget (category + limit) via the inline form → it appears; add a matching expense in the ledger → that budget's bar/label updates (spending rose); push spending over the limit → the bar/label turn **amber** with "over by $…".
- Delete a budget via the inline confirm; `$0` limit is rejected; no budgets → "No budgets yet."
