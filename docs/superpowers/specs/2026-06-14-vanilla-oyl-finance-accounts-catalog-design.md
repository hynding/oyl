# Vanilla-OYL Finance Slice 4a (Accounts catalog + per-account spend) — Design

**Status:** approved (split from Accounts; recommendations folded in)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessors:** Finance Slices 1–3 (transactions, budgets, renew→transaction seam), all merged. This is **Slice 4a**; **Slice 4b** (composer account picker + currency coupling + ledger account label) follows.

---

## What this is

An **Accounts section at the bottom of `#/finance`**: a money-account catalog ("Checking", "Visa") with inline add, delete, and — the payoff — each account's **this-month spend**. `Account` is a domain entity already registered in `COLLECTIONS`, and transactions already carry an optional `accountId` (the seed stamps Checking onto its transactions; the Slice-3 renew seam stamps a subscription's account onto the posted expense). So the catalog shows a real monthly total on day one, with **zero new composer work** — the risky picker is deferred to 4b.

### Decisions (settled)

1. **Accounts section at the bottom of `#/finance`** (composer → ledger → Budgets → Accounts — catalog last). No 8th nav item. (R-G)
2. **`createAccountsStore(accountsRepo)`** mirrors `BudgetsStore` exactly (persist-first `add`/`remove`/`all`/`hydrate`; no in-place edit).
3. **`journalStore.accountSpend(account, day)` → `Money`** (R-B): the this-month expense total for that account, reactive. Takes the `Account` (not just an id) so it returns a typed zero in the account's currency when there are no transactions. Sums `Transaction`s with `direction === 'expense'` and `accountId === account.id` in the month window (net of refunds by construction — negative expenses subtract).
4. **No account editing** (rename/currency) in v1 — deliberate: editing an account's *currency* after transactions reference it would create `CURRENCY_MISMATCH`; not supporting edit sidesteps it (same posture as budgets/goals). (R-D/E)
5. **Add form uses the shared currency `<select>`** (USD/EUR/GBP), never free text, so the currency is always ISO-valid. Name is a text input — `Account` throws on empty name, caught inline. (R-H)
6. **Reuse `oyl-vault-item`** for account rows (label + lines + inline-confirm delete) — no new row component (same as gift-idea rows). The screen's `track()` recomputes each account's spend and rebuilds the items, so the totals stay reactive.
7. **Deleting an account is allowed and never cascades to transactions** (fork C) — transactions are financial history; a deleted account's past transactions keep their (now-dangling) `accountId`. Surfacing that is a 4b concern (the ledger label); 4a only removes the catalog entry.

### Out of scope (→ Slice 4b or later)

- The **composer account picker**, currency coupling (account drives currency), and the **ledger account label** — all Slice 4b.
- Account editing; account balances (the domain has none); income/direction; multi-currency account totals (an account has one currency).
- No synthetic "Cash" row — cash (no-account) transactions aren't an account and don't appear here. (R-I)

---

## Domain API this consumes (verified)

- `new Account({ id?, name, currency })` — throws `INVALID_QUANTITY` on empty name or non-`^[A-Z]{3}$` currency. `.id`, `.name`, `.currency`. Registered in `COLLECTIONS` → `repos.accounts` exists (made generically by `makeRepositories`). Seed ships one: **Checking / USD** (`fixtureId(32)`), referenced by seed transactions + the Netflix subscription.
- `Money.fromMajor(0, currency)` → typed zero (exponent 2). `money.add(other)` requires same currency **and** exponent — all app flows are exponent-2, so the per-account sum is safe. `Transaction.amount` (Money), `.direction`, `.accountId`.
- `periodWindowOf('month', day): DayRange`; `Journal.entriesIn(range)`. `@oyl/all-of-oyl` exports `Account`, `Money`, `periodWindowOf`, `Transaction`.

---

## Architecture

### 1. `src/state/accounts-store.js` — `createAccountsStore(accountsRepo)`

Mirrors `BudgetsStore`:
```js
import { signal } from '../lib/reactive/signal.js'
/** @typedef {import('@oyl/all-of-oyl').Account} Account */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

/** @param {{ list(): Promise<Account[]>, save(a: Account): Promise<Account>, delete(id: Id): Promise<void> }} accountsRepo */
export function createAccountsStore(accountsRepo) {
  /** @type {Account[]} */ let accounts = []
  let n = 0
  const revision = signal(0)
  async function hydrate() { accounts = [...(await accountsRepo.list())]; revision.set((n += 1)) }
  return {
    revision, hydrate,
    /** @param {Account} a @returns {Promise<Account>} */
    async add(a) { const saved = await accountsRepo.save(a); accounts = [...accounts, saved]; revision.set((n += 1)); return saved },
    /** @param {Id} id */
    async remove(id) { await accountsRepo.delete(id); accounts = accounts.filter((x) => x.id !== id); revision.set((n += 1)) },
    /** @returns {readonly Account[]} */
    all() { revision.get(); return [...accounts] },
  }
}
```

### 2. `src/state/journal-store.js` — `accountSpend(account, day)`

Change line 1 import to add `Money` + `periodWindowOf` at runtime (drop the `@typedef Money` line on ~11 — the imported class serves as the type), add an `Account` typedef:
```js
import { Journal, Transaction, Money, periodWindowOf } from '@oyl/all-of-oyl'
```
Add (after `budgetStatus`):
```js
    /** This-month expense total for `account` (Money in the account's currency; reactive). @param {Account} account @param {DayKey} day @returns {Money} */
    accountSpend(account, day) {
      revision.get()
      const range = periodWindowOf('month', day)
      return journal.entriesIn(range).reduce(
        (sum, e) => (e instanceof Transaction && e.direction === 'expense' && e.accountId === account.id ? sum.add(e.amount) : sum),
        Money.fromMajor(0, account.currency),
      )
    },
```
Add `/** @typedef {import('@oyl/all-of-oyl').Account} Account */` (DayKey/GoalProgress typedefs already present from earlier slices).

### 3. `src/account/format.js` — `accountSpendLabel`

```js
import { formatMoney } from '../vault/format.js'
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$65.00 this month". @param {Money} spent @returns {string} */
export function accountSpendLabel(spent) {
  return `${formatMoney(spent)} this month`
}
```

### 4. `src/components/oyl-account-form.js` — compact inline add

Like `oyl-budget-form`. Properties `store` (AccountsStore), `onAdded`. A grid `form`: a name `<input name="name" placeholder="Account name" aria-label="Account name">`, a currency `<select name="currency" aria-label="Currency">` (USD/EUR/GBP), an "Add account" submit, and `[data-role="error"]`. Submit (async):
```js
try {
  const account = new Account({ name: name.value.trim(), currency: currency.value })
  await this.store.add(account)
  name.value = ''
  this.onAdded()
} catch (err) { error.textContent = err instanceof Error ? err.message : String(err) }
```
No manual name guard — `new Account` throws "name must be non-empty" for empty, caught inline. STATIC import `{ Account }`. `defineAccountForm()` idempotent.

### 5. `src/components/oyl-finance.js` — add the Accounts section

The screen gains an **`accounts`** property (AccountsStore) alongside `store` (JournalStore), `budgets`, `tz`. Call `defineAccountForm()` in `render()`. After the Budgets nodes, build: a `section-label` "Accounts", an `<oyl-account-form>` (`store = this.accounts`, `onAdded → live`), an account `<ol>`, and an empty state. In the existing `track()` (reuse the `today` already computed):
```js
const accounts = this.accounts.all()
accountList.replaceChildren()
for (const a of accounts) {
  const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
  item.label = a.name
  item.lines = [`${a.currency} · ${accountSpendLabel(this.store.accountSpend(a, today))}`]   // journal store → reactive to transactions
  item.onDelete = () => { void this.accounts.remove(a.id); live.textContent = 'Deleted' }
  const li = document.createElement('li'); li.append(item); accountList.append(li)
}
accountEmpty.hidden = accounts.length > 0
accountEmpty.textContent = accounts.length > 0 ? '' : 'No accounts yet.'
```
The track now also reads `this.accounts` (accounts revision) and `this.store.accountSpend` (journal revision), so totals recompute when accounts OR transactions change. Import `accountSpendLabel` from `../account/format.js`. (`oyl-vault-item` is already imported/defined in this screen for ledger rows.)

### 6. Wiring

- `src/state/data.js`: `import { createAccountsStore }`; `const accounts = createAccountsStore(repos.accounts)`; `await accounts.hydrate()` in `refresh()`; add `accounts` to the returned object.
- `src/main.js`: in the `finance:` route, also set `view.accounts = dataState.accounts`.

---

## Data flow

```
add account (inline form) → new Account({name, currency}) → accounts.add → persist-first → list repaints
log/delete/renew an expense → journal revision bumps → each account's accountSpend recomputes → totals update
delete account → accounts.remove(id) → soft-delete → list repaints (transactions untouched)
```

## Error handling

- Empty name → `new Account` throws → inline error (no manual guard). Currency select is always a valid ISO code.
- `accountSpend` sums only same-currency (the account's) exponent-2 amounts → no `add` mismatch; empty → typed zero.

## Testing (Vitest + happy-dom)

- **`account/format.test.js`** (new): `accountSpendLabel(Money.of(6500, 'USD'))` → `"$65.00 this month"`.
- **`accounts-store.test.js`** (new): `add`/`all`/`remove` persist-first; `hydrate` rebuilds (mirror `budgets-store.test.js`).
- **`journal-store.test.js`** (extend): `accountSpend` — add two `Transaction`s with `accountId: acc.id` in the current month (assert sum), one with a different `accountId` and one in a prior month (both excluded), and assert a fresh account returns `minor 0` in its currency. (Build accounts with `new Account({ name, currency })`.)
- **`oyl-account-form.test.js`** (new): adds an `Account` with the typed name + selected currency; empty name → inline error + no add.
- **`oyl-finance.test.js`** (extend): **update the `screen()` helper to also set `el.accounts = createAccountsStore(new InMemoryRepository())`** (so existing ledger/budget tests keep passing; the new section shows "No accounts yet"). New test: with a seeded account + a matching current-month transaction (real stores), the Accounts section renders an `oyl-vault-item` whose `.shadowRoot` shows the name + "… this month"; adding via the inline form makes one appear; deleting removes it.

## File structure

```
apps/vanilla-oyl/src/
  state/accounts-store.js          (new)
  state/journal-store.js           (modify: add accountSpend)
  account/format.js                (new)
  components/oyl-account-form.js    (new)
  components/oyl-finance.js         (modify: Accounts section + accounts prop)
  state/data.js                    (modify: wire accounts store)
  main.js                          (modify: finance route sets view.accounts)
  + new tests (account/format, accounts-store, oyl-account-form); extend journal-store + oyl-finance tests
```
No new row component (reuses `oyl-vault-item`); no nav/route additions.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/finance`:
- An **Accounts** section (bottom) shows the seeded **Checking** account as `Checking` / "USD · $0.00 this month" (seed transactions are in a prior month).
- On `#/vault` renew **Netflix** (Slice-3 seam posts a June expense to Checking) → back on `#/finance`, Checking now reads "USD · $15.99 this month" (live cross-feature reactivity).
- Add an account (name + currency) via the inline form → it appears with "$0.00 this month"; delete it via the inline confirm; no accounts → "No accounts yet."
