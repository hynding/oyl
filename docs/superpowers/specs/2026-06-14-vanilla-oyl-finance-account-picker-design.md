# Vanilla-OYL Finance Slice 4b (composer account picker + ledger label) — Design

**Status:** approved (forks settled in the Accounts brainstorm; micro-decisions confirmed)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessors:** Finance Slices 1–3 + 4a (transactions, budgets, renew seam, accounts catalog), all merged. This is **Slice 4b — the last Finance piece**; it makes Finance feature-complete.

---

## What this is

Lets the user **attribute an expense to an account** at entry time, and **shows the account on ledger rows**. The accounts catalog and `accounts` store already exist (4a); 4b adds the composer picker (the deferred, risky reactive-select half) and the ledger label. No new store, component, route, or `main.js`/`data.js` change — the screen already has `this.accounts` and passes it to the composer.

### Decisions (settled)

1. **Account `<select>` after the Amount field** — `"Cash (no account)"` (value `""`, default) + one option per account labelled `Checking · USD` (value = account id). Cash default preserves today's behavior.
2. **Currency coupling = account drives currency (fork B).** Pick an account → submit posts `account: { id, currency }` (the domain enforces `amount.currency === account.currency`) and the standalone **currency select is hidden**. Cash → currency select visible, post with no account. A `syncCurrencyVisibility()` (`currency.hidden = accountSelect.value !== ''`) runs on the select's `change` and after each options refresh.
3. **Reactive options with state preservation (R-A).** The composer gains a `track()` that *only* repopulates the account select's options from `this.accounts.all()`, preserving the typed amount/category/date/note and the current selection — the `oyl-gift-idea-form` pattern (build the form once; the track touches just the option list).
4. **R-K — deleted selection falls back to Cash.** If the previously-selected account is gone after a refresh, reset the select to `""` and re-show the currency select.
5. **Ledger account label (fork C).** Append the resolved account name to the existing meta line (`2026-06-14 · Checking`). Cash (no `accountId`) or an orphaned id (deleted account) → no label.

### Out of scope

- Account editing/balances; income/direction; per-account budgets; filtering the ledger by account.
- Changing an existing transaction's account.

---

## Domain API this consumes (verified)

- `new Transaction({ occurredAt, amount, category, direction, account?: { id: Id, currency: string }, note? })` — when `account` is given, the ctor throws `CURRENCY_MISMATCH` unless `account.currency === amount.currency`; `provenance = account.id` is stored as `accountId` (transaction.ts:43, 52). We only ever pass `account` (never bare `accountId`), and we set `amount`'s currency to `account.currency`, so the match always holds.
- `Account` has `.id` (Id, a branded string — compares to a `<select>`'s string value at runtime), `.name`, `.currency`.
- The screen's `accountSpend` (4a) already recomputes per-account totals reactively, so a picker-attributed expense raises the right account's total with no extra wiring.

---

## Architecture

### 1. `src/components/oyl-finance-composer.js` — account picker

The composer gains an **`accounts`** prop (AccountsStore) alongside `store` (JournalStore).

**(a) Account field** — built once in `render()`, placed after the Amount field:
```js
const account = document.createElement('select')
account.name = 'account'
// options populated by the track() below
```
Insert `this._labeled('account', 'Account', account)` between the amount and category fields in the `formEl.append(...)`.

**(b) Currency visibility helper** + change listener:
```js
const syncCurrencyVisibility = () => { currency.hidden = account.value !== '' }
account.addEventListener('change', syncCurrencyVisibility, { signal: this.lifecycle })
```

**(c) Reactive options + R-K** — a `track()` at the end of `render()`:
```js
this.track(() => {
  const list = this.accounts.all()
  const prev = account.value
  account.replaceChildren()
  const cash = document.createElement('option')
  cash.value = ''
  cash.textContent = 'Cash (no account)'
  account.append(cash)
  for (const a of list) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = `${a.name} · ${a.currency}`
    account.append(o)
  }
  account.value = list.some((a) => a.id === prev) ? prev : ''   // R-K: deleted selection → Cash
  syncCurrencyVisibility()
})
```
This touches only the account select; the amount/category/date/note inputs are never rebuilt, so in-progress input survives an accounts add/delete.

**(d) Submit posts account provenance** — in `_submit`, derive the account + currency from the selection (pass `account` into the ctx; read `this.accounts.all()`):
```js
const selectedId = ctx.account.value
const acc = selectedId ? this.accounts.all().find((a) => a.id === selectedId) : undefined
const currency = acc ? acc.currency : ctx.currency.value
const props = /** @type {{ occurredAt: Date, amount: Money, category: string, direction: 'expense', note?: string, account?: { id: import('@oyl/all-of-oyl').Id, currency: string } }} */ ({
  occurredAt: new Date(`${ctx.date.value}T12:00:00`),
  amount: Money.fromMajor(amt, currency),
  category: ctx.category.value,
  direction: 'expense',
})
if (acc) props.account = { id: acc.id, currency: acc.currency }
if (ctx.note.value) props.note = ctx.note.value
await this.store.add(new Transaction(props))
```
On success, reset amount/note (as today); leave the account selection as-is (so consecutive expenses to the same account are easy).

### 2. `src/components/oyl-finance.js` — wire the composer + ledger label

- In `render()` where the composer is created, add `composer.accounts = this.accounts` **in the same pre-`root.append(...)` block as `composer.store`** (R-1) — the composer's new `track()` reads `this.accounts` when it renders on append, so it must be set first or the composer throws.
- In the ledger loop inside `track()`, build an id→name Map (the track already reads `this.accounts` for the 4a section) and append the name to the date line:
```js
const nameById = new Map(this.accounts.all().map((a) => [a.id, a.name]))
// …in the ledger loop:
const acctName = tx.accountId ? nameById.get(tx.accountId) : undefined
item.lines = [`${DayKey.from(tx.occurredAt, this.tz).value}${acctName ? ` · ${acctName}` : ''}`, tx.note]
```
Reading `this.accounts.all()` makes the ledger reactive to account changes (delete an account → its rows drop the label).

---

## Data flow

```
pick account (composer) → change → currency select hides
add expense → new Transaction({ account:{id,currency}, amount in account currency }) → journal.add
  → ledger row shows "date · AccountName"; that account's 4a spend total rises
add/delete an account (Accounts section) → composer options refresh (typed input preserved); deleted selection → Cash
```

## Error handling

- `account` + matching currency ⇒ no `CURRENCY_MISMATCH` (currency is taken from the account).
- Empty amount/date guards unchanged. With no accounts, the picker is just "Cash" and the composer behaves exactly as before.

## Testing (Vitest + happy-dom)

- **`oyl-finance-composer.test.js`** (extend — **update the shared `composer(store)` helper to also default `el.accounts = createAccountsStore(new InMemoryRepository())` before it appends the element (R-2)**, or every existing composer test crashes on the new `track()` reading `this.accounts.all()`; new tests pass a specific accounts store):
  - selecting an account posts a `Transaction` whose `accountId` is that account's id and whose `amount.currency` is the account's currency;
  - the currency `<select>` is `hidden` when an account is selected and visible for "Cash";
  - "Cash" posts a transaction with `accountId === undefined`;
  - **reactive (R-A):** type an amount, then add an account to the store + `await` a microtask → the new option appears and the typed amount is still there; the prior selection is preserved;
  - **R-K:** select an account, then remove it from the store → the select resets to `""` (Cash) and the currency select is visible again.
- **`oyl-finance.test.js`** (extend): a ledger transaction with an `accountId` whose account is in the store renders a row whose `oyl-vault-item.lines` include the account name; a cash transaction (no accountId) and a transaction with an unknown accountId render no name.

## File structure

```
apps/vanilla-oyl/src/components/
  oyl-finance-composer.js   (modify: accounts prop, Account field, currency coupling, reactive options, submit provenance)
  oyl-finance.js            (modify: composer.accounts wiring + ledger account label)
  + extend oyl-finance-composer.test.js + oyl-finance.test.js
```
No new files, stores, components, routes; no `data.js`/`main.js` changes (accounts already wired in 4a).

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/finance`:
- The composer has an **Account** field defaulting to "Cash (no account)" with the currency select visible.
- Select **Checking** → the currency select hides; add an expense → the ledger row reads "`date · Checking`" and Checking's Accounts-section total rises by that amount.
- Switch back to **Cash** → currency select reappears; add → ledger row has no account label.
- Add a new account in the Accounts section → it appears in the composer picker immediately (no reload); delete the account currently selected in the composer → the picker resets to "Cash".
