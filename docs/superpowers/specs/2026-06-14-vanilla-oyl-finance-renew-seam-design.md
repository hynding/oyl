# Vanilla-OYL Finance Slice 3 (Subscription→Transaction seam) — Design

**Status:** approved (seam only; accounts deferred)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessors:** Vault Slice 2 (subscriptions + `renew`), Finance Slices 1–2 (transactions + budgets), all merged.

---

## What this is

Closes the deferred finance loop: **renewing a subscription on #/vault records the expense.** `vaultStore.renew(id, on)` already returns a `SubscriptionCharge` (the finance seam the domain documents) — but the vault screen discards it. This slice posts that charge as an expense `Transaction` to the journal, so it flows into the #/finance ledger, budgets, and Insights spending.

**Scope: the seam only.** Accounts (a catalog + composer picker) are deferred — a `SubscriptionCharge` already carries an optional `accountId`, and accounts add little *displayed* value until per-account balances/filtering exist (revisit then).

### Decisions

1. **Orchestrate in `data.renewSubscription(id, on)`** (data-layer): `await vault.renew(id, on)` → if a charge, `await journal.add(new Transaction(...))`. Keeps `vaultStore` journal-agnostic and `journalStore` vault-agnostic — the data layer composes them (like `reviewOn`).
2. **Posted `occurredAt` = the renewal day at local noon** (`new Date(`${on.value}T12:00:00`)`, R-B from Slice 1) so the expense lands in the correct month.
3. **`<oyl-vault>` gains a `renew` prop** (bound `data.renewSubscription`); the subscription row's `onRenew` calls `this.renew(id, today)` instead of `this.store.renew`. The vault store keeps its `renew` (used by `data.renewSubscription`).
4. **Announce "Renewed — expense recorded"** on the vault live region (the cross-screen effect shouldn't be silent).
5. Accounts deferred (a future slice).

### Out of scope

- Accounts catalog, account picker on the transaction composer, showing account on ledger rows.
- Un-posting on a failed renew (renew + add are sequential; a journal-add failure after a successful renew leaves the cursor advanced without a transaction — acceptable, same best-effort posture as elsewhere; the user can add the expense manually).

---

## Domain API this consumes (verified)

- `vaultStore.renew(id, on): Promise<SubscriptionCharge | undefined>` — advances the cursor (persist + re-hydrate) and returns the charge (or `undefined` if the subscription isn't found).
- `SubscriptionCharge = { amount: Money, category: string (slug), direction: 'expense', accountId?: Id, on: DayKey }`.
- `new Transaction({ occurredAt: Date, amount: Money, category: string (slug), direction: 'expense'|'income', accountId? })` — `extends Entry`; `journalStore.add` persists it to `entries` and into the aggregate (flows into ledger/budgets/insights). `charge.category` is already a valid slug (subscriptions validate it), so the posted `Transaction` is valid.
- `@oyl/all-of-oyl` exports `Transaction`, `Subscription`, `Cadence`, `Money`, `DayKey`, `periodWindowOf`.

---

## Architecture

### 1. `src/state/data.js` — `renewSubscription(id, on)`

Add `Transaction` to the imports (the file already imports `review`). Add inside `createDataState` (after `reviewOn`, before `return`):
```js
  /**
   * Renew a subscription AND post the resulting charge as an expense Transaction to the
   * journal — closing the finance loop (the charge then shows in the ledger, budgets, and
   * Insights). Orchestration lives here so vaultStore/journalStore stay decoupled.
   * @param {import('@oyl/all-of-oyl').Id} id @param {import('@oyl/all-of-oyl').DayKey} on
   * @returns {Promise<import('@oyl/all-of-oyl').SubscriptionCharge | undefined>}
   */
  async function renewSubscription(id, on) {
    const charge = await vault.renew(id, on)
    if (charge) {
      await journal.add(new Transaction({
        occurredAt: new Date(`${on.value}T12:00:00`),
        amount: charge.amount,
        category: charge.category,
        direction: 'expense',
        ...(charge.accountId !== undefined ? { accountId: charge.accountId } : {}),
      }))
    }
    return charge
  }
```
Add `renewSubscription` to the returned object.

### 2. `src/components/oyl-vault.js` — use the injected `renew`

- Add a `renew` property (default no-op so an unset prop can't crash on click):
```js
    /** @type {(id: import('@oyl/all-of-oyl').Id, on: import('@oyl/all-of-oyl').DayKey) => Promise<unknown>} */
    this.renew = async () => undefined
```
- Change the subscription row's `onRenew` (currently `srow.onRenew = (id) => { void this.store.renew(id, today); live.textContent = 'Renewed' }`) to:
```js
        srow.onRenew = (id) => { void this.renew(id, today); live.textContent = 'Renewed — expense recorded' }
```

### 3. `src/main.js` — wire the bound function

In the `vault:` route, after `view.store = dataState.vault`:
```js
      view.renew = dataState.renewSubscription
```

---

## Data flow

```
Renew (vault subscription row) → this.renew(id, today) = data.renewSubscription
  → vault.renew(id, today) → advances cursor (re-hydrate; vault revision bumps → row's "Renews …" moves forward)
  → journal.add(new Transaction({ expense from the charge })) → entries repo + aggregate (journal revision bumps)
  → #/finance ledger shows the expense; budgets for that category recompute; Insights spending rises
```

## Error handling

- `vault.renew` returns `undefined` for an unknown id → no transaction posted.
- `vault.renew` already rolls back on its own save failure (re-hydrate). If `vault.renew` succeeds but the subsequent `journal.add` rejects, the cursor is advanced without a transaction (best-effort, out-of-scope to make atomic across two aggregates; consistent with the app's other multi-step flows).

## Testing (Vitest + happy-dom)

- **`data.test.js`** (extend): `renewSubscription` posts an expense — save a `Subscription` (`category: 'entertainment'`, `amount: Money.of(1599,'USD',2)`, anchor today) to `repos.subscriptions`, `refresh()`, `await ds.renewSubscription(sub.id, today)`; assert `ds.journal.transactionsIn(periodWindowOf('month', today))` has length 1 with `category 'entertainment'`, `amount.minor 1599`, `direction 'expense'`. (Import `Subscription`, `Cadence`, `Money`; `periodWindowOf`/`DayKey` already imported.)
- **`oyl-vault.test.js`** (extend): update the `screen()` helper to set `el.renew = (id, on) => store.renew(id, on)` (delegates to the store) so the existing "renew advances a subscription" test (which spies on `store.renew`) still passes; add a focused test that clicking a subscription row's **Renew** invokes `el.renew` with the subscription id (set `el.renew = vi.fn()` and assert).

## File structure

```
apps/vanilla-oyl/src/
  state/data.js          (modify: add renewSubscription + Transaction import)
  components/oyl-vault.js (modify: renew prop + onRenew uses it)
  main.js                (modify: vault route sets view.renew)
  + extend data.test + oyl-vault.test
```
No new files, stores, components, nav, or routes.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/vault`:
- Click **Renew** on Netflix → its "Renews …" advances (as before) and the live region says "Renewed — expense recorded".
- Open `#/finance` → an **entertainment** expense for Netflix's amount now appears in this month's ledger; an `entertainment` budget (if any) reflects it; **#/insights** Spending/top-spending rises.
- Renewing the lapsed **Gym** likewise posts a fitness expense.
