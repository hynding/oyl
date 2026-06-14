# Vanilla-OYL Finance Slice B (per-account balance) — Design

**Status:** approved (forks: `span()`-based, "Balance" label, balance headline, fix negative formatMoney)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** Second of the deferred Finance niceties (after Slice A income/direction). Now that income exists, a per-account **balance** is meaningful. **Slice C = ledger filter by account** still remains.

---

## What this is

Each Accounts-section row gains its **balance** — all-time income minus expense for that account — as the headline, with the existing "this month" spend kept as a secondary line. Because income (Slice A) and expense both carry an `accountId`, the balance is just their net.

### Decisions (settled)

1. **`journalStore.accountBalance(account) → Money`** (reactive, mirrors `accountSpend`): sum over **all** recorded transactions for the account (income adds, expense subtracts), using `journal.span()` for the all-time window. No domain change — `span()` is already public and returns the min→max `DayRange` (or `undefined` when the journal is empty). (Fork A)
2. **"Balance" = net of recorded transactions.** `Account` has no opening-balance field, so a freshly-seeded account with only expenses shows a negative balance until income is recorded; the user sets a starting point by recording an opening income. Labelled **"Balance"** (intuitive). (Fork B)
3. **Balance is the row headline; spend stays as a second line.** (Fork C)
   - line 1: `${currency} · ${formatMoney(balance)}` → e.g. `USD · $1,800.00`
   - line 2: `${accountSpendLabel(spend)}` → e.g. `$200.00 this month`
4. **Fix `formatMoney` negatives**: render `-$200.00` (sign before the symbol), not the current `$-200.00`. A balance can be negative; no current caller passes a negative `Money`, so this is a safe correctness fix.

### Out of scope

- Opening-balance / starting-balance field on `Account` (a domain change; the user can record an opening income instead).
- Ledger filter by account (Slice C); multi-currency accounts; transfers between accounts.

---

## Domain API this consumes (verified)

- `journal.span(): DayRange | undefined` (core/journal.ts) — the min→max range over all entries, `undefined` when empty. `journal.entriesIn(range)` filters by `range.contains(...)`.
- `Money.add`/`Money.subtract` (same currency + exponent required — all an account's transactions share its currency, enforced by the composer's `account:{id,currency}` posting). `Money.fromMajor(0, currency)` → typed zero.
- `Transaction.accountId`, `.direction`, `.amount`. (`Money`, `Transaction` are already imported in `journal-store.js`; the `Account` typedef is present from Slice 4a.)

---

## Architecture

### 1. `src/state/journal-store.js` — `accountBalance(account)`

Add after `accountSpend`:
```js
    /** All-time balance for `account`: income minus expense over every recorded transaction (Money in the account's currency; reactive). No opening-balance field exists, so this is net-of-recorded. @param {Account} account @returns {Money} */
    accountBalance(account) {
      revision.get()
      const zero = Money.fromMajor(0, account.currency)
      const span = journal.span()
      if (!span) return zero
      return journal.entriesIn(span).reduce(
        (bal, e) =>
          e instanceof Transaction && e.accountId === account.id
            ? (e.direction === 'income' ? bal.add(e.amount) : bal.subtract(e.amount))
            : bal,
        zero,
      )
    },
```

### 2. `src/vault/format.js` — `formatMoney` negative sign

```js
export function formatMoney(m) {
  const neg = m.minor < 0
  const amount = (Math.abs(m.minor) / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  const body = sym ? `${sym}${amount}` : `${amount} ${m.currency}`
  return neg ? `-${body}` : body
}
```

### 3. `src/components/oyl-finance.js` — balance headline on the account row

In the Accounts-section loop, change the row's `lines` (currently `[`${a.currency} · ${accountSpendLabel(this.store.accountSpend(a, today))}`]`) to two lines — balance headline + spend:
```js
        item.lines = [
          `${a.currency} · ${formatMoney(this.store.accountBalance(a))}`,
          accountSpendLabel(this.store.accountSpend(a, today)),
        ]
```
`formatMoney` is already imported in this file; `accountBalance` is reactive (reads the journal `revision`), and the loop already runs inside the reactive `track()`, so balances update live when transactions change.

---

## Data flow

```
record income/expense with an account → journal revision bumps
  → each account row recomputes accountBalance (income − expense, all-time) → headline updates
  → spend line (this-month expense) updates as before
```

## Error handling / risk

- Additive. `accountBalance` returns a typed zero for an empty journal or an account with no transactions. Same-currency sum (account's currency) → no `Money` mismatch. The `formatMoney` change only affects negative inputs, of which there are currently none in the app.

## Testing (Vitest + happy-dom)

- **`journal-store.test.js`** (extend): `accountBalance` — for an account with income `2000` and expense `500` → `minor 150000`; an account with only an expense → negative `minor`; an account with no transactions → `minor 0` in its currency; transactions for a *different* account are ignored.
- **`vault/format.test.js`** (extend): `formatMoney(Money.of(-20000, 'USD', 2))` → `'-$200.00'`; positive unchanged (`'$200.00'`); non-symbol currency negative → `'-200.00 XYZ'` (or the existing no-symbol format with a leading `-`).
- **`oyl-finance.test.js`** (extend): an account with an income and an expense (both via `account:{id,currency}`) renders a row whose `lines` include the net balance (e.g. `$1500.00`) **and** still include "this month" (spend line preserved, so the 4a assertions hold).

## File structure

```
apps/vanilla-oyl/src/
  state/journal-store.js     (modify: add accountBalance)
  vault/format.js            (modify: formatMoney negative sign)
  components/oyl-finance.js   (modify: balance headline on account rows)
  + extend journal-store.test.js, vault/format.test.js, oyl-finance.test.js
```
No new files, stores, components, routes; no data/main changes.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: on `#/finance`, each Accounts row shows a **balance headline** + the "this month" spend line. The seeded **Checking** (expenses only) shows a negative balance (e.g. `USD · -$…`); record a `salary` income to that account → its balance rises by that amount (and goes positive once income exceeds recorded expenses); the "this month" spend line is unchanged by income.
