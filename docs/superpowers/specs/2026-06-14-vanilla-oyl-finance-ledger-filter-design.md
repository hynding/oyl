# Vanilla-OYL Finance Slice C (ledger filter by account) — Design

**Status:** approved (forks: `'' / 'cash' / id` model, derived-effective R-K, include Cash)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** Last of the deferred Finance niceties (after A income/direction, B per-account balance). Smallest slice — one file.

---

## What this is

A filter `<select>` above the "This month" ledger that scopes it to **one account**, **Cash** (no-account transactions), or **All** (default). Pure client-side filter over the `txs` array the ledger already builds — no new store/method.

### Decisions (settled)

1. **Filter `<select>`** right after the "This month" section label, `aria-label="Filter by account"` (a11y-consistent). Options: `All accounts` (value `''`, default), `Cash` (value `'cash'`), one per account (value = id, text = name). Sentinels can't collide — account ids are UUIDs.
2. **`_filter` signal** (default `''`); the select's `change` sets it; the ledger `track()` reads it (reactive).
3. **Filter logic:** `'' → all`, `'cash' → !tx.accountId`, else `tx.accountId === filter`. Month scope unchanged.
4. **Reactive options + R-K, loop-safe (derived-effective):** rebuild the select's options from `this.accounts.all()` each track run (composer-picker pattern). Compute an **effective** filter = `valid ? raw : ''` (where `raw = this._filter.get()`), and set `filterSel.value` to it — **without** mutating the signal inside the track (a read-then-write of the same signal would loop). A deleted selected account therefore resolves to "All".
5. **Empty state:** filtered-empty → "No transactions for this view."; unfiltered-empty → the current "No transactions this month."

### Out of scope

- Filtering by income/expense or category; persisting the filter; changing the month scope.

---

## Architecture — `src/components/oyl-finance.js`

- **Import:** add `import { signal } from '../lib/reactive/signal.js'`.
- **Constructor:** `this._filter = signal('')`.
- **`render()`:** build the filter select and give the ledger `<ol>` a class for test-scoping:
  ```js
    const filterSel = document.createElement('select')
    filterSel.className = 'ledger-filter'
    filterSel.setAttribute('aria-label', 'Filter by account')
    filterSel.addEventListener('change', () => this._filter.set(filterSel.value), { signal: this.lifecycle })
  ```
  Give the ledger list a class: `list.className = 'ledger'` (lets tests target ledger rows vs account-section rows, which are also `oyl-vault-item`). Insert `filterSel` into `root.append(...)` between `label` and `list`:
  ```js
    root.append(h2, live, composer, label, filterSel, list, empty, budgetLabelEl, ...)
  ```
  Optionally add a small style rule to the screen sheet: `select.ledger-filter { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .35rem .5rem; margin-block-end: .6rem; }`.
- **`track()` — replace the ledger head.** Currently it starts:
  ```js
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const txs = [...this.store.transactionsIn(range)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      const nameById = new Map(this.accounts.all().map((a) => [a.id, a.name]))
      for (const tx of txs) { ... }
      empty.hidden = txs.length > 0
      empty.textContent = empty.hidden ? '' : 'No transactions this month.'
  ```
  Change to compute filter options + effective filter, then filter `txs`:
  ```js
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const accts = this.accounts.all()

      // filter options + effective value (R-K: deleted selection → All), no signal mutation here
      const raw = this._filter.get()
      const filter = raw === '' || raw === 'cash' || accts.some((a) => a.id === raw) ? raw : ''
      const mk = (/** @type {string} */ value, /** @type {string} */ text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o }
      filterSel.replaceChildren(mk('', 'All accounts'), mk('cash', 'Cash'))
      for (const a of accts) filterSel.append(mk(a.id, a.name))
      filterSel.value = filter
      filterSel.hidden = accts.length === 0   // R-A: with no accounts every tx is cash → the filter is pointless

      const nameById = new Map(accts.map((a) => [a.id, a.name]))
      const txs = [...this.store.transactionsIn(range)]
        .filter((tx) => (filter === '' ? true : filter === 'cash' ? !tx.accountId : tx.accountId === filter))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const tx of txs) { /* unchanged row-building loop */ }
      empty.hidden = txs.length > 0
      empty.textContent = txs.length > 0 ? '' : filter === '' ? 'No transactions this month.' : 'No transactions for this view.'
  ```
  The track now also depends on `this._filter` (re-renders on filter change) and `this.accounts` (already read for `nameById`/options).

No other files change. The Accounts-section loop later in the same `track()` is untouched.

---

## Data flow

```
pick a filter → _filter.set(value) → track re-runs → ledger shows only matching txs; select reflects effective value
delete the selected account → accts no longer has it → effective filter = '' → ledger shows All, select snaps to "All accounts"
```

## Error handling / risk

- Additive + client-side. The effective-filter derivation means a stale/deleted selection can never produce a broken (empty-because-gone) view. No signal write inside the reactive read → no effect loop.

## Testing (Vitest + happy-dom)

Extend `oyl-finance.test.js` (helpers `at`, `root`, `screen(store, budgets, accounts)`, `TZ`; `Account`, `Transaction`, `Money`, `createJournalStore`, `createAccountsStore`, `InMemoryRepository` imported). Use `root(el).querySelectorAll('.ledger oyl-vault-item')` to count ledger rows.
- **defaults to All:** with one account-tagged + one cash transaction this month, both ledger rows render.
- **filter to an account:** set `select.ledger-filter` value to the account id + dispatch `change`, `await` → only that account's row renders.
- **filter to Cash:** value `'cash'` → only the no-account row renders.
- **R-K:** select the account, then `accounts.remove(id)` + a journal change (or just `await`) → the select value snaps back to `''` and all rows render again. (Removing an account bumps the accounts revision → track re-runs.)
- **empty message:** filter to an account with no transactions → the empty div reads "No transactions for this view."
- **R-A hidden when no accounts:** with an empty accounts store, `select.ledger-filter` is `hidden`; after adding an account it becomes visible.

## File structure

```
apps/vanilla-oyl/src/components/oyl-finance.js   (modify: _filter signal + filter select + derived filtering in track)
  + extend oyl-finance.test.js
```
No new files, stores, routes; no data/main changes.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: on `#/finance`, a **Filter by account** select sits above the ledger (default "All accounts"). Record expenses under different accounts (and a Cash one); pick **Checking** → the ledger shows only Checking's transactions; pick **Cash** → only no-account ones; pick **All accounts** → everything. Delete the account currently selected in the filter (Accounts section) → the filter snaps to "All accounts" and the full ledger returns.
