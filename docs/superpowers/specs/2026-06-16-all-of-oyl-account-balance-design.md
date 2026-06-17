# Account balance/spend → core (`Account.balanceIn`/`spentIn`)

**Date:** 2026-06-16
**Status:** Approved — ready for planning
**Packages:** `@oyl/all-of-oyl` (Account aggregate), `apps/vanilla-oyl` (store delegates)

> Sub-project #2 of a 3-part program (formatters → **account balance/spend** → Nutrition screen).

## Goal

Move the two finance calculations that currently live in the app's reactive
store (`apps/vanilla-oyl/src/state/journal-store.js` — `accountBalance`,
`accountSpend`) onto the `Account` aggregate in the domain core, so the
backend, future apps, and framework-free domain tests can reuse them. The app
store keeps only its reactive wrapper and delegates.

## Why they leaked into the app

The domain's metric-aggregation path (`journal.totalOf`, used by
`Budget.spent`) is **category-keyed** (`finance.spend.<category>`), not
account-keyed — accounts fall outside it. So per-account balance must iterate
`Transaction` entries directly. That transaction-iterating query is what the
app implemented inline; this sub-project gives it a proper home in the finance
domain. (Adding an account-keyed metric was considered and rejected as
over-engineering — see Out of scope.)

## Decision (locked)

Methods on the `Account` aggregate, mirroring the nearest precedent
`Budget.spent(journal, month)` / `Goal.progressOn(journal, day)`. This changes
`Account` from a pure data-holder (id/name/currency, zero behavior) into a
behavioral aggregate that queries the `Journal` — the same tradeoff `Budget`
already made (R2).

## Design

### `packages/all-of-oyl/src/finance/account.ts`

Add a private helper + two public methods:

```ts
/** This account's transactions within `range`, own currency only. */
private postingsIn(journal: Journal, range: DayRange): Transaction[]

/** All-time balance: income − expense over every recorded transaction in this
 *  account's currency. Net-of-recorded — no opening-balance field exists. */
balanceIn(journal: Journal): Money

/** This-month expense total for this account (Money in the account's currency). */
spentIn(journal: Journal, day: DayKey): Money
```

Behavior (preserved exactly from the current store):
- `postingsIn` filters `e instanceof Transaction && e.accountId === this.id &&
  e.amount.currency === this.currency` (a type-guard returning `Transaction[]`).
  **The currency filter is not redundant (R1):** `Transaction`'s constructor
  only enforces currency match when given the full `account` object; a
  transaction built with a bare `accountId` skips that check, so the guard is
  real. Document this on `postingsIn`.
- `balanceIn`: `zero = Money.fromMajor(0, this.currency)`; if `journal.span()`
  is undefined return `zero`; else reduce `postingsIn(journal, span)` netting
  `income → add`, otherwise `subtract`.
- `spentIn`: build the month window with **core** primitives —
  `DayRange.of(day.startOfMonth(), day.endOfMonth())` (semantically identical
  to `periodWindowOf('month', day)` but **without coupling finance→goal**);
  sum the `expense` postings.

Imports added to `account.ts` (all relative, acyclic — `Journal`/`Transaction`
do not import `Account`; DOM-free, `Intl`-free → passes `pnpm all-of build`):
- type-only: `Journal` (`../core/journal.js`), `DayKey` (`../core/day-key.js`)
- runtime: `DayRange` (`../core/day-range.js`), `Money` (`../core/money.js`),
  `Transaction` (`./transaction.js`)

`Account` is **not** registered anywhere new — it is already in `COLLECTIONS`
and the barrel; only its method surface grows. No barrel change needed (the
class is already exported).

### App store delegation (`apps/vanilla-oyl/src/state/journal-store.js`)

`accountBalance`/`accountSpend` become thin reactive delegations:

```js
accountSpend(account, day) { revision.get(); return account.spentIn(journal, day) }
accountBalance(account)    { revision.get(); return account.balanceIn(journal) }
```

**Import surgery (R5 — required or `noUnusedLocals`/checkJs fails):**
- Prune `periodWindowOf` (only used in the moved `accountSpend`).
- Convert `Money` from a value import to a typedef — after the move its only
  remaining reference is `budgetStatus`'s JSDoc `@returns {{ spent: Money }}`;
  a value import used solely in JSDoc can trip `noUnusedLocals`. Add
  `/** @typedef {import('@oyl/all-of-oyl').Money} Money */` (matching the
  store's existing typedef style) and drop `Money` from the value import.
- Keep `Journal`, `Transaction` (still used as values: `new Journal(tz)`;
  `transactionsIn`'s `instanceof Transaction`). Resulting value import:
  `import { Journal, Transaction } from '@oyl/all-of-oyl'`.

The store's `accountSpend`/`accountBalance` JSDoc (`@param`/`@returns`) is kept,
trimmed to the delegating one-liners.

**Unchanged public API (A4):** the store methods keep their signatures
(`accountBalance(account)` / `accountSpend(account, day)`) and `Money` return
types — only the internals delegate. So **no component or other call site
changes** (`oyl-finance.js:151-152` untouched). Blast radius: `account.ts` +
`journal-store.js` + the two test files.

## Testing

- **Core — extend the EXISTING `packages/all-of-oyl/src/finance/account.test.ts`
  (A1 — the file already exists; add `describe('balanceIn')` / `describe('spentIn')`
  blocks):** exhaustive domain cases built against a plain `Journal` (no store):
  multi-account / multi-currency filtering, income−expense netting,
  empty-journal → zero in the account currency, currency-mismatch ignored.
  **Port the exact assertion values from the current `journal-store.test.js`
  (R4)** — `spentIn`: `8000`, `9999`, and the EUR-account → `0`; `balanceIn`:
  `150000`, `-5000`, `10000` (USD). The currency-skip case
  (`10000 USD + 5000 EUR → 10000 USD`) ports directly and is the exact test that
  validates the R1 guard.
  - **Use fixed dates, not `new Date()` (A2):** the store fixtures are
    clock-relative; core tests must be deterministic. Build against a
    `Journal('UTC')` with a fixed `day` (e.g. `DayKey.of('2026-06-15')`) and
    transactions whose `occurredAt` falls in June 2026 (current month) vs.
    April 2026 (prior month), at noon to avoid tz day-bucketing edges. Amounts
    port verbatim; only the date construction changes.
- **App — `apps/vanilla-oyl/src/state/journal-store.test.js`:** trim the
  `accountBalance`/`accountSpend` blocks to one representative
  reactive-delegation case each (e.g. add a transaction via the store, assert
  the value reflects it) — proving the store still delegates + tracks
  `revision`, without re-testing every scenario now covered in core.

## Out of scope

- An opening-balance field — the documented "net-of-recorded" limitation stays.
- An account-keyed metric (`finance.account.<id>`) so balance could use the
  metric path — rejected as over-engineering; iterating transactions is simpler
  and correct.
- The DRY private helper is included (`postingsIn`); no other refactor of
  `Account`.

## Definition of Done

- `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green.
- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- `grep -rn "instanceof Transaction" apps/vanilla-oyl/src/state/journal-store.js`
  shows only `transactionsIn` (the balance/spend reduces are gone from the app).
