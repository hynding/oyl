# Vanilla-OYL Finance Slice A (income / direction) — Design

**Status:** approved (forks: segmented toggle, income `+$X`, `salary/freelance/gift/refund/other`)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** First of three deferred Finance niceties. **Slice A = income/direction** (foundation), then **Slice B = per-account balance** (combines income+expense), then **Slice C = ledger filtering by account**.

---

## What this is

Lets the user record **income** as well as expenses, and see it in the ledger. The domain already routes by direction — `direction: 'income'` emits `finance.income.<category>` instead of `finance.spend.<category>` (transaction.ts:58) — so income is **automatically excluded** from budgets (`finance.spend.<cat>`), Insights spending (`totalsByPrefix('finance.spend')`), and `journalStore.accountSpend` (filters `direction === 'expense'`). No changes needed in any of those; this slice is confined to the composer + the ledger row.

### Decisions (settled)

1. **Segmented `Expense | Income` toggle** in the composer (the `.seg` + `_segButton` + `signal` pattern from `oyl-plan-composer`/`oyl-vault-composer`), defaulting to **Expense** (preserves today's behavior). `_submit` passes `direction` through; the `Transaction` ctor routes the metric.
2. **Category set switches with direction.** Expense keeps `groceries/dining/transport/utilities/entertainment/other`; income uses `salary/freelance/gift/refund/other`. The composer's existing `track()` rebuilds the category `<select>` options on direction change, preserving the current selection when it's still valid (same preserve pattern as the account options).
3. **Ledger shows income with a `+` sign** — income rows render `category · +$X`, expenses stay `category · $X` (sign convention, theme-agnostic; no positive-color token exists).
4. **Reactive submit-button text + announce.** The submit button reads "Add income" / "Add expense" by direction; `onAdded(direction)` lets the screen announce "Income added" / "Expense added".

### Out of scope (later slices / deferred)

- Surfacing income in **Insights** (a net or income figure) — income is cleanly ignored by `finance.spend`; an Insights-income view can be its own slice.
- **Per-account balance** (Slice B) and **ledger filtering** (Slice C).
- Negative amounts / refunds via the UI (the domain supports negative expense = refund, but the composer keeps `amount > 0`).

---

## Domain API this consumes (verified)

- `new Transaction({ ..., direction: 'expense' | 'income' })` — `direction` is required; `metrics()` emits `finance.${direction === 'expense' ? 'spend' : 'income'}.${category}` (transaction.ts:57-59). Category is a slug; the income preset values are valid slugs.
- Budgets (`goal/budget.ts:42` → `finance.spend.${cat}`), Insights (`review.ts:40,78` → `finance.spend`), and `journalStore.accountSpend` (filters `direction === 'expense'`) all read **spend only**, so income never leaks into them.

---

## Architecture

### `src/components/oyl-finance-composer.js`

- **Imports:** add `signal` from `../lib/reactive/signal.js`.
- **Constants:** rename `CATEGORIES` → `EXPENSE_CATEGORIES`; add `const INCOME_CATEGORIES = ['salary', 'freelance', 'gift', 'refund', 'other']`.
- **Styles:** add the `.seg` rules (copy the three rules from `oyl-plan-composer`: `.seg`, `.seg button`, `.seg button[aria-pressed="true"]`).
- **Constructor:** `this._direction = signal('expense')`.
- **`render()`:**
  - Build a segmented control: a `div.seg` with `role="group"`, `aria-label="Direction"`, containing `this._segButton('expense', 'Expense')` and `this._segButton('income', 'Income')`. Prepend it to `formEl` (first child, before the Amount field).
  - The `category` select stays built with `EXPENSE_CATEGORIES` options initially (so a synchronous test that sets a category before the effect flushes still works); the `track()` rebuilds it.
  - **Extend the existing `track()`** (after the account-options block) with:
    ```js
    const dir = this._direction.get()
    const cats = dir === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    const prevCat = category.value
    category.replaceChildren()
    for (const c of cats) { const o = document.createElement('option'); o.value = c; o.textContent = c; category.append(o) }
    category.value = cats.includes(prevCat) ? prevCat : cats[0]
    expenseBtn.setAttribute('aria-pressed', String(dir === 'expense'))
    incomeBtn.setAttribute('aria-pressed', String(dir === 'income'))
    submit.textContent = dir === 'income' ? 'Add income' : 'Add expense'
    ```
    (`expenseBtn`/`incomeBtn`/`submit`/`category` are all consts already in `render()` scope; capture the seg buttons in named consts.)
- **`_segButton(value, label)`** method (mirror `oyl-plan-composer`): a `button` with `textContent = label`, click → `this._direction.set(value)` (scoped to `this.lifecycle`); returns the button.
- **`_submit`:** change `direction: 'expense'` to `direction: this._direction.get()`, widen the props typedef's `direction` to `'expense' | 'income'`, and call `this.onAdded(this._direction.get())` instead of `this.onAdded()`.

### `src/components/oyl-finance.js`

- **Ledger row sign:** in the ledger loop, change
  ```js
  item.label = `${tx.category} · ${formatMoney(tx.amount)}`
  ```
  to
  ```js
  const sign = tx.direction === 'income' ? '+' : ''
  item.label = `${tx.category} · ${sign}${formatMoney(tx.amount)}`
  ```
- **Announce:** change `composer.onAdded = () => { live.textContent = 'Expense added' }` to `composer.onAdded = (dir) => { live.textContent = dir === 'income' ? 'Income added' : 'Expense added' }`.

No other files change. Budgets/Insights/`accountSpend` already exclude income by reading `finance.spend`.

---

## Data flow

```
toggle Income → _direction.set('income') → track: category options = INCOME_CATEGORIES, seg aria-pressed, submit text
add → new Transaction({ direction: 'income', category, amount, account? }) → finance.income.<cat> metric
  → ledger shows "category · +$X"; budgets/insights/accountSpend unchanged (they read finance.spend)
```

## Error handling / risk

- Additive. Default direction is expense, so existing behavior and tests are preserved (the category select is still populated with expense options synchronously at render).
- Switching direction resets the category to the new set's first option (expected); switching back preserves nothing typed in category (categories are presets, not free text — fine).

## Testing (Vitest + happy-dom)

- **`oyl-finance-composer.test.js`** (extend; helper `composer(store, accounts)`, `q`, `submit`):
  - default is Expense: the category options are the expense set, the Expense seg button is `aria-pressed="true"`.
  - toggling Income (click the Income seg button, `await` a microtask) replaces the category options with the income set and sets `aria-pressed` accordingly.
  - posting after selecting Income + an income category yields an added `Transaction` with `direction === 'income'` and that category (assert `added[0].direction` and `added[0].category`); the existing expense test still passes unchanged.
- **`oyl-finance.test.js`** (extend): an **income** transaction (`direction: 'income'`) renders a ledger `oyl-vault-item` whose `label` contains `+` before the amount; an expense row's label has no `+`.

## File structure

```
apps/vanilla-oyl/src/components/
  oyl-finance-composer.js   (modify: direction signal + seg toggle + income categories + submit direction + onAdded(dir))
  oyl-finance.js            (modify: ledger income sign + onAdded(dir) announce)
  + extend oyl-finance-composer.test.js + oyl-finance.test.js
```
No new files, stores, routes; no budgets/insights/data/main changes.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: on `#/finance`, the composer shows an **Expense | Income** toggle (Expense active). Switch to **Income** → the category options become `salary/freelance/…` and the button reads "Add income"; record a `salary +$2000` → it appears in the ledger as "salary · +$2000.00", Budgets/Insights spending and the account's "this month" spend are **unchanged** (income excluded). Switch back to Expense → an expense records and totals as before.
