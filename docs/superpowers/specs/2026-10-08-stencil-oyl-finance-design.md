# `apps/stencil-oyl` Finance screen — Design

**Date:** 2026-10-08
**Status:** draft (branch `feat/stencil-oyl-finance`, stacked on `feat/stencil-oyl-nutrition`)
**Program:** Stencil front-end — sub-project 6 (fourth redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 5 (`ui-select`, the
collapsed-form section pattern, `readNutrients`-style field reading).

## Purpose

Replace the `/finance` placeholder: the month's ledger of expenses and income (filterable by
account), a composer, budgets tracked against the month's spending, and accounts with balance
and monthly spend. Same domain behavior as vanilla's `oyl-finance` (journal, budgets and
accounts stores unchanged); new look, month summary tiles, and one shared row component.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | **One page** (mockup A): month heading, summary tiles, composer, ledger with the account filter, then **Budgets** and **Accounts** sections each with a collapsed "New …" `<details>` above its list (Nutrition's catalog pattern). |
| Tiles | **Spent / income / net, per currency** present in the month's transactions (one row of three tiles per currency, usually one; dashes when the month is empty). |
| Rows | **Shared `oyl-item-row`**: label + lines + optional right-aligned mono `value` (with a `tone`) + inline Delete → Yes/No. Used by ledger rows and account rows; Vault reuses it later. Budgets keep their own `oyl-budget-row` (progress bar). |
| Month nav | **Current month only**, as vanilla. Prev/next month is a later polish. |

## Screen anatomy

```
<oyl-finance store budgets accounts tz>
  h2[tabindex=-1] "{Month YYYY}"        sr-only aria-live region
  .totals[data-role=totals]  per currency: <div class="tiles" data-currency> 3 × .tile (spent / income / net)
  <oyl-transaction-form store accounts onAdded>            — ui-card
  .section-head  "This month" · <ui-select name="ledgerFilter" label="Show"> (All accounts / Cash / each account; not rendered when there are no accounts)
  <ol class="ledger"> <li><oyl-item-row label lines value tone onRemove></li> …   newest first
  .empty[data-role=ledger-empty]  "No transactions this month." | "No transactions for this view."
  section.budgets   .section-label "Budgets" · <details><summary>New budget</summary><oyl-budget-form store onAdded></details>
           <ol class="budgets"> <li><oyl-budget-row budget status onRemove></li> …  · .empty "No budgets yet."
  section.accounts  .section-label "Accounts" · <details><summary>New account</summary><oyl-account-form store onAdded></details>
           <ol class="accounts"> <li><oyl-item-row label lines value onRemove></li> …  · .empty "No accounts yet."
```

- Lists and math are vanilla's: `range = periodWindowOf('month', today)`; ledger =
  `store.transactionsIn(range)` filtered by the account filter (`''` all, `'cash'` = no account,
  else `accountId`) sorted newest first; `store.budgetStatus(b, today)`;
  `store.accountBalance(a)` + `store.accountSpend(a, today)`. One `effect` tracks the journal,
  budgets and accounts revisions. The filter is `@State()`; an unknown value (its account was
  deleted) falls back to `''`.
- Ledger row: `label = category`, `lines = [ "{Mon D} · {account name}", note ]`, `value =
  (income ? '+' : '−') + formatMoney(amount)`, `tone = income ? 'ok' : undefined`. (Deliberate
  new-look choices: vanilla showed the ISO day and left expenses unsigned; the e2e asserts
  — category, amount, `+` on income — still hold.) Account row:
  `label = name`, `lines = [ "{currency} · {formatMoney(spend)} this month" ]`, `value =
  formatMoney(balance)`.
- Announcements (live region on the screen): "Expense added" / "Income added", "Budget added",
  "Account added", "Deleted".

### Month tiles

`monthTotals(txs)` (app-side, `src/finance/format.ts`) groups by `amount.currency` and sums
`expense` and `income` with `Money.add`; `net = income − spent`. One `.tiles` row per currency
(`data-currency`), tiles captioned `spent` / `income` / `net` ("{CUR} net" when more than one
currency); net is rendered as its own sign (`+`/`−`, from `net.minor`) + `formatMoney(|net|)` —
`formatMoney` already emits `-` for negatives, so the helper never double-signs. With no
transactions: one row of dashes. `monthHeading(day)` ("October 2026") is app-side with its own
month-name table; `/format` has no full-month formatter.

### `oyl-transaction-form` (composer)

- `ui-segment name="direction"` Expense / Income (`data-value`), default expense; the submit
  reads "Add expense" / "Add income".
- `.row2`: `ui-field name="amount" type="number" label="Amount"` and
  `ui-select name="currency"` (USD/EUR/GBP) — the currency select is **not rendered** while an
  account is chosen (the account's currency wins). The chosen currency is `@State()` and is
  passed back as `value` when the select re-mounts, so EUR → account → Cash still posts EUR
  (vanilla kept the hidden select's value).
- `ui-select name="account" label="Account"`: "Cash (no account)" (value `''`) + `{name} ·
  {currency}` per account, mirrored from `accounts.all()` through an `effect` that also resets
  `accountId` to `''` when its account is gone (`ui-select` syncs its own value silently and
  emits nothing, so the composer must not trust a stale id — `oyl-meal-form` does the same).
- `ui-select name="category" label="Category"`: expense list
  (groceries/dining/transport/utilities/entertainment/other) or income list
  (salary/freelance/gift/refund/other) by direction; on a direction change the composer
  re-derives `category = cats.includes(category) ? category : cats[0]` itself (vanilla's rule) —
  it cannot rely on `ui-select`'s silent sync, which emits no event.
- `ui-field name="date" type="date"` prefilled today (`now()` ISO date); `ui-field name="note"
  label="Note (optional)"`.
- Validation first (vanilla's): empty date → "Pick a date"; amount not > 0 → "Amount must be
  positive"; both in `[data-role=error]` (aria-live) and the field marked invalid. Then
  `new Transaction({ occurredAt: `${date}T12:00:00`, amount: Money.fromMajor(amt, currency),
  category, direction, note?, account? })`, `await store.add`, clear amount + note, emit
  `added` with the direction.

### `oyl-budget-form` / `oyl-account-form`

- Budget: `ui-select name="category"` (expense categories), `ui-field name="limit" type="number"`,
  `ui-select name="currency"`; `new Budget({ category, limit: Money.fromMajor(limit, currency)
  })` → `budgets.add` → clear → `added`. Domain errors (non-positive limit) inline.
- Account: `ui-field name="name"`, `ui-select name="currency"`; `new Account({ name, currency })`
  → `accounts.add` → clear → `added`. Empty name → inline error.
- `CURRENCIES`, `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES` live in `src/finance/format.ts`
  together with `budgetLabel` and `accountSpendLabel` (ported from vanilla with their tests).

### `oyl-item-row` (shared)

Props `itemId` (the domain id), `label`, `lines: readonly (string | null | undefined)[]` (blank
lines skipped), `value?` (mono, right-aligned), `tone?: 'ok' | 'warn' | 'danger'` (value
color), `removeLabel?` (aria-label for Delete, default "Delete {label}"). Event `remove:
EventEmitter<string>` carrying `itemId`, so screens keep one stable handler per list, as every
other row does. The confirm cluster is the shared one (`data-act="delete" |
"confirm-yes" | "confirm-no"`, `role=group`, No focused).

### `oyl-budget-row`

Props `budget`, `status: { progress, spent }`; event `remove: Id`. Title (name ?? category),
a progress bar (`inline-size: ratio%`, warn tone when `progress.met === false`), the
`budgetLabel` line, and the inline Delete. Rows are keyed by budget id; `status` is a fresh
object each render so the row re-renders on spending changes.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `Transaction`, `Budget`, `Account`, `Money`,
  `periodWindowOf`, `formatMoney`, `monthDayLabel`, and the three stores exist.
- `boot/routes.ts`: `finance` creates `oyl-finance` with `store = app.dataState.journal`,
  `budgets = app.dataState.budgets`, `accounts = app.dataState.accounts`, `tz = app.tz`;
  `finance` leaves `NOT_YET`.
- Transactions, budgets and accounts are all **backed**, so the e2e asserts persistence.

## Verification

- **Unit:** `monthTotals` (per-currency sums, net sign, empty), `budgetLabel`,
  `accountSpendLabel`, `transactionLines`/`transactionValue` helpers, the category/currency lists.
- **Specs (stencil-oyl):** `oyl-item-row` (label/lines/value/tone, blank lines skipped, confirm
  flow → `remove`); `oyl-budget-row` (title, bar width, over tone, label, confirm → `remove`);
  `oyl-transaction-form` (default expense with the expense categories, currency select shown,
  account options mirrored; choosing an account hides the currency select; income flips the
  categories and the submit text; validation errors for amount and date; expense submit →
  `Transaction` with `Money.fromMajor`, category, direction, `account` when chosen (currency from
  the account); note optional; clears amount + note; emits `added` with the direction);
  `oyl-budget-form` and `oyl-account-form` (build the domain object, clear, emit `added`,
  inline errors); `oyl-finance` (fake stores: month heading, tiles per currency + dashes, ledger
  newest first with account names and signs, filter narrows to an account / cash, empty texts,
  `remove` on each kind calls the right store + "Deleted", `added` announces by direction,
  budget rows carry `status` from `budgetStatus`, account rows show balance + spend).
- **e2e:** `tests-stencil/finance.spec.ts` = vanilla's six finance tests with stencil selectors
  (`oyl-transaction-form ui-segment [data-value=expense|income]`, `ui-field[name=amount] input`,
  `ui-select[name=category] select`, `ui-select[name=account] select`, `ui-select[name=currency]`
  presence, `ui-field[name=date] input`, `oyl-finance ol.ledger oyl-item-row`,
  `ui-select[name=ledgerFilter] select`, the Budgets/Accounts `details summary`, `oyl-budget-row`,
  `[data-role=totals]` via `deepText`) plus one for the tiles and one for inline delete.
  `tests-stencil/lib.ts` gains `addExpense`, `addAccount`, `addBudget`; the latter two open
  their section's `<details>` first (scoped `oyl-finance section.accounts details` /
  `section.budgets details` — two details exist, so never the bare `oyl-finance details`).
  The routing spec's placeholder test moves from `/finance` to `/goals` in the same commit
  that removes `finance` from `NOT_YET`, so the suite never sits red between tasks.
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl untouched unless a gap appears; vanilla untouched.

## Out of scope

- Month navigation; editing transactions/budgets/accounts; transfers between accounts; budget
  periods other than the month; renewals/subscriptions (Vault); charts.

## Risks

| Risk | Mitigation |
|---|---|
| Multi-currency months | Tiles are grouped per currency, never summed across; the first row is the most-used currency. |
| Account filter after an account is deleted | The filter state falls back to `''` when its id is gone; `ui-select` syncs its own value silently. |
| `oyl-budget-row` not re-rendering on spend | `status` is a new object per screen render (prop identity changes), unlike the Planner's in-place plans. |
