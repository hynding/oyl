# `apps/stencil-oyl` Finance screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/finance` placeholder in `apps/stencil-oyl` with the redesigned Finance screen (month tiles per currency, transaction composer, filterable ledger, Budgets and Accounts sections with collapsed forms), introducing the shared `oyl-item-row`. Same domain behavior as vanilla's finance; vanilla and ui-oyl untouched.

**Architecture:** `oyl-finance` owns one `effect` over the journal, budgets and accounts stores plus a `@State()` filter; forms submit through native `<form>`s on form-associated primitives; rows emit `remove`. Month math and labels live in `src/finance/format.ts` with unit tests.

**Tech Stack:** as sub-projects 2–5.

**Spec:** `docs/superpowers/specs/2026-10-08-stencil-oyl-finance-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-finance` (stacked on `feat/stencil-oyl-nutrition`; spec commit `ed6c616`). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's finance** (lists, filter, validation order, Transaction/Budget/Account construction, clears, announcements). New: the look, tiles, `oyl-item-row`, collapsed forms.
- **Selectors for e2e** (keep stable): `oyl-finance`, `oyl-finance h2`, `[data-role="totals"]`, `.tiles[data-currency]`, `oyl-transaction-form ui-segment [data-value="expense|income"]`, `ui-field[name="amount|date|note"] input`, `ui-select[name="currency|account|category|ledgerFilter"] select`, `ui-button[type="submit"] button`, `[data-role="error"]`, `oyl-finance ol.ledger oyl-item-row`, `[data-role="ledger-empty"]`, `oyl-finance section.budgets details summary`, `oyl-budget-form ui-select[name="category"] select`, `ui-field[name="limit"] input`, `oyl-budget-row`, `oyl-finance section.accounts details summary`, `oyl-account-form ui-field[name="name"] input`, `ol.accounts oyl-item-row`, `[data-act="delete"|"confirm-yes"|"confirm-no"]`.
- **Gates per task:** `pnpm stencil test|typecheck|build`; Task 6 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed first).
- Handlers on `ui-*` hosts never close over render state; `@Event()` names avoid native ones; rows whose props keep identity get keys that change.

---

## Task 1: `src/finance/format.ts` + `oyl-item-row`

**Files:** `apps/stencil-oyl/src/finance/format.ts` + `format.unit.ts`, `apps/stencil-oyl/src/components/oyl-item-row/{oyl-item-row.tsx,oyl-item-row.css,oyl-item-row.spec.tsx}`

- [x] **Step 1: failing tests** — `CURRENCIES`, `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES` (vanilla's lists); `budgetLabel` (ported test: under → "… · $400.00 left", over → "… · over by $100.00"); `accountSpendLabel` ("$65.00 this month"); `monthHeading(day)` ("October 2026"); `monthTotals(txs)` → `[{ currency, spent, income, net }]` per currency ordered by transaction count desc, empty → `[]`; `transactionValue(tx)` ("+$100.00" / "−$12.34"); `signedMoney(m)` ("+$5.00" / "−$5.00" / "$0.00" — never "−-"); `transactionLines(tx, nameById, tz)` (["Oct 8 · Checking", note] / ["Oct 8", undefined]). Row spec: label + lines (blank skipped) + `.value` with `tone` class; no `.value` without `value`; Delete `aria-label` defaults to "Delete {label}"; confirm flow → `remove` with `itemId`.
- [x] **Step 2: implement** both.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-item-row; finance format helpers`.

## Task 2: `oyl-budget-row`

**Files:** `apps/stencil-oyl/src/components/oyl-budget-row/{…}`

- [x] **Step 1: failing specs** — title = name ?? category; `.fill` inline-size = `round(ratio*100)%`; `.bar.over` + `.label.over` when `progress.met === false`; label = `budgetLabel(progress, spent, limit)`; confirm → `remove {id}`.
- [x] **Step 2: implement** (`@Prop() budget`, `@Prop() status`, `@Event() remove: Id`).
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-budget-row`.

## Task 3: `oyl-budget-form` + `oyl-account-form`

**Files:** `apps/stencil-oyl/src/components/oyl-budget-form/{…}`, `apps/stencil-oyl/src/components/oyl-account-form/{…}`

- [x] **Step 1: failing specs** — budget: category select (expense list), limit, currency; submit → `Budget` with `Money.fromMajor(limit, currency)`, clears limit, emits `added`; limit 0 → domain error inline. Account: name + currency; submit → `Account`, clears name, emits `added`; empty name → error inline + name invalid.
- [x] **Step 2: implement** both.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-budget-form, oyl-account-form`.

## Task 4: `oyl-transaction-form`

**Files:** `apps/stencil-oyl/src/components/oyl-transaction-form/{…}`

- [x] **Step 1: failing specs** — default expense: segment `expense`, categories = expense list, currency select present, account options = Cash + `{name} · {currency}` (mirrored; reacts to `accounts.add`), date prefilled today, submit text "Add expense"; choosing an account removes the currency select; back to Cash restores it WITH the previously chosen currency (EUR survives the round trip); an account removed from the store while chosen resets the composer to Cash (currency select back, submit uses the select's currency); income: categories = income list, submit text "Add income", a category still in both lists ("other") carries over while one that isn't ("groceries") becomes the first income category and the submitted Transaction carries THAT category; validation: amount 0 → "Amount must be positive" (+ amount invalid), empty date → "Pick a date" (+ date invalid), no `store.add`; expense submit → `Transaction` (`amount.minor` 1234 for "12.34", currency from the select, category, direction, no account), clears amount + note, emits `added` with `'expense'`; account submit → `accountId` set and currency = the account's; note passes through; income → direction `income`, `added` with `'income'`.
- [x] **Step 2: implement** — `@State() direction`, `accountId`, `currency`, `category`, `error`, `fieldError`, `accounts` (effect-mirrored; the effect resets `accountId` when its account vanishes); the direction handler re-derives `category`.
- [x] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-transaction-form composer`.

## Task 5: `oyl-finance` + route

**Files:** `apps/stencil-oyl/src/components/oyl-finance/{…}`, `apps/stencil-oyl/src/boot/routes.ts` + `routes.unit.ts`

- [x] **Step 1: failing specs** — fake journal (`transactionsIn`, `budgetStatus`, `accountBalance`, `accountSpend`, `add`, `remove`), budgets and accounts stores (`all`, `add`, `remove`), reactive through `core()`: h2 = month heading; tiles: dashes when empty, one row per currency with spent/income/net; ledger newest first with `transactionValue`/account names; filter select not rendered without accounts, lists All/Cash/accounts (label "Show"), narrows to an account and to cash, empty texts ("No transactions this month." vs "No transactions for this view."); `remove` from a ledger row → `store.remove(id)` + "Deleted"; budget rows get `status` from `budgetStatus` and `remove` → `budgets.remove`; account rows show balance + spend and `remove` → `accounts.remove`; `added` from each form announces ("Expense added"/"Income added"/"Budget added"/"Account added").
- [x] **Step 2: implement.**
- [x] **Step 3: route** — `finance` creates `oyl-finance` with journal/budgets/accounts + tz; remove from `NOT_YET`; unit test text; move `tests-stencil/routing.spec.ts`'s placeholder test to `/goals` in this commit.
- [x] **Step 4: gate + commit** — `feat(stencil-oyl): Finance screen replaces the placeholder`.

## Task 6: e2e

**Files:** `apps/e2e-oyl/tests-stencil/finance.spec.ts`, `tests-stencil/lib.ts` (`addExpense`, `addAccount`, `addBudget` — the latter two open their section's details, scoped `section.accounts details` / `section.budgets details`)

- [x] **Step 1:** port vanilla's six finance tests + tiles + inline delete.
- [x] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [x] **Step 3: commit** — `test(e2e): stencil finance spec`.

## Task 7: Visual check + docs

- [x] Headless screenshots desktop + Pixel 7; fix anything off.
- [x] CLAUDE.md (stencil-oyl row: Finance + `oyl-item-row`; placeholders list), spec statuses (finance implemented; program table row 6), tick this plan.
- [x] Final gates; commit `docs: stencil-oyl Finance`.

## Deferred

- Month navigation; editing; transfers; migrating `oyl-meal-row`/`oyl-entry-row` onto `oyl-item-row` (they have kind-specific bodies — leave them).
