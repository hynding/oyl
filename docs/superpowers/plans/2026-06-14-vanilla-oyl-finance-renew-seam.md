# Vanilla-OYL Finance Slice 3 (Subscription→Transaction seam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renewing a subscription on #/vault records the expense — `data.renewSubscription` posts the `SubscriptionCharge` (currently discarded) to the journal as an expense `Transaction`, so it flows into the #/finance ledger, budgets, and Insights.

**Architecture:** Data-layer orchestration. A new `data.renewSubscription(id, on)` composes the two existing aggregate stores — `vault.renew()` (returns the charge) then `journal.add(new Transaction(...))` — keeping `vaultStore`/`journalStore` mutually unaware. `<oyl-vault>` gains an injected `renew` prop (one-line `onRenew` swap), wired in `main.js`.

**Tech Stack:** Vanilla JS + JSDoc, `@oyl/all-of-oyl` domain (`Transaction`, `Subscription`, `Cadence`, `Money`), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-renew-seam-design.md`

**Branch:** `feat/vanilla-oyl-renew-seam` (off `master` HEAD). Baseline: `pnpm vanilla test` green.

---

## File structure

- **Modify** `apps/vanilla-oyl/src/state/data.js` — add `Transaction` import + `renewSubscription(id, on)`; add it to the returned object.
- **Modify** `apps/vanilla-oyl/src/state/data.test.js` — two tests (posts an expense; unknown id posts nothing).
- **Modify** `apps/vanilla-oyl/src/components/oyl-vault.js` — add a `renew` prop (no-op default); `onRenew` calls `this.renew`.
- **Modify** `apps/vanilla-oyl/src/components/oyl-vault.test.js` — `screen()` helper wires `el.renew` (delegating to `store.renew`) so the existing renew test passes.
- **Modify** `apps/vanilla-oyl/src/main.js` — `vault:` route sets `view.renew = dataState.renewSubscription`.

No new files, stores, components, nav, or routes.

---

### Task 1: `data.renewSubscription(id, on)`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js:1` (import) and `:75-87` (function + return)
- Test: `apps/vanilla-oyl/src/state/data.test.js`

- [ ] **Step 1: Write the failing tests**

Add these imports to the top of `data.test.js` (line 2 — extend the existing `@oyl/all-of-oyl` import):
```js
import { Note, Measurement, Goal, DayKey, Task, periodWindowOf, Subscription, Cadence, Money } from '@oyl/all-of-oyl'
```

Add a new `describe` block at the end of the file (before the final closing of the file — it's a top-level `describe` sibling):
```js
describe('renewSubscription (subscription→transaction seam)', () => {
  it('posts the charge as an expense transaction in the current month', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const today = DayKey.from(new Date(), defaultTimezone())
    const sub = new Subscription({
      name: 'Netflix',
      amount: Money.of(1599, 'USD', 2),
      cadence: Cadence.of(1, 'months'),
      anchor: today,
      category: 'entertainment',
    })
    await ds.repos.subscriptions.save(sub)
    await ds.refresh()

    const charge = await ds.renewSubscription(sub.id, today)

    expect(charge?.category).toBe('entertainment')
    const txs = ds.journal.transactionsIn(periodWindowOf('month', today))
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('entertainment')
    expect(txs[0]?.amount.minor).toBe(1599)
    expect(txs[0]?.direction).toBe('expense')
  })

  it('does nothing for an unknown subscription id', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const today = DayKey.from(new Date(), defaultTimezone())
    await ds.refresh()

    const charge = await ds.renewSubscription('nope', today)

    expect(charge).toBeUndefined()
    expect(ds.journal.transactionsIn(periodWindowOf('month', today))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`
Expected: FAIL — `ds.renewSubscription is not a function`.

- [ ] **Step 3: Implement `renewSubscription`**

In `data.js`, extend the import on line 1:
```js
import { review, Transaction } from '@oyl/all-of-oyl'
```

Add this function inside `createDataState`, immediately after `reviewOn` (after line 85, before `return`):
```js
  /**
   * Renew a subscription AND post the resulting charge as an expense Transaction to the
   * journal — closing the finance loop (the charge then shows in the ledger, budgets, and
   * Insights). Orchestration lives here so vaultStore/journalStore stay decoupled. The
   * Transaction is mapped purely from the charge (charge.on is the day paid, not the past
   * due date — overdue renewals post dated today).
   * @param {import('@oyl/all-of-oyl').Id} id
   * @param {import('@oyl/all-of-oyl').DayKey} on
   * @returns {Promise<import('@oyl/all-of-oyl').SubscriptionCharge | undefined>}
   */
  async function renewSubscription(id, on) {
    const charge = await vault.renew(id, on)
    if (charge) {
      await journal.add(new Transaction({
        occurredAt: new Date(`${charge.on.value}T12:00:00`),
        amount: charge.amount,
        category: charge.category,
        direction: charge.direction,
        ...(charge.accountId !== undefined ? { accountId: charge.accountId } : {}),
      }))
    }
    return charge
  }
```

Add `renewSubscription` to the returned object (line 87):
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`
Expected: PASS (both new tests + the existing data-state tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean (no errors).

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): data.renewSubscription posts the charge as an expense"
```

---

### Task 2: `<oyl-vault>` uses the injected `renew` + wiring

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-vault.js:42-50` (constructor) and `:176` (onRenew)
- Modify: `apps/vanilla-oyl/src/components/oyl-vault.test.js:49-55` (screen helper)
- Modify: `apps/vanilla-oyl/src/main.js` (vault route)

- [ ] **Step 1: Update the vault test `screen()` helper + add a focused injection test**

In `oyl-vault.test.js`, replace the `screen()` helper (lines 49-55) with one that wires `el.renew` to delegate to the store's `renew` — so the *existing* "renew advances a subscription" test (which spies on `store.renew`) still observes the call after the component switches to `this.renew`:
```js
function screen(store) {
  const el = /** @type {import('./oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
  el.store = store
  el.tz = TZ
  el.renew = (id, on) => store.renew(id, on)
  document.body.append(el)
  return el
}
```

Then add a new test (next to the existing "renew advances a subscription" test) that asserts the Renew button goes through the **injected** `renew` (the data-layer seam), not `store.renew` directly. This is the red test — it overrides `el.renew` with a spy, so before the component change (which still calls `this.store.renew`) the spy never fires:
```js
  it('renew goes through the injected renew prop (the data-layer seam)', async () => {
    const store = await seededStore()
    const el = screen(store)
    await Promise.resolve()
    const renewFn = vi.fn(async () => undefined)
    el.renew = renewFn
    const row1 = /** @type {any} */ (root(el).querySelector('oyl-subscription-row'))
    const renewBtn = /** @type {HTMLButtonElement} */ (row1.shadowRoot.querySelector('button[data-act="renew"]'))
    renewBtn.click()
    await Promise.resolve(); await Promise.resolve()
    expect(renewFn).toHaveBeenCalled()
    el.remove()
  })
```

- [ ] **Step 2: Run the vault test to verify the new test FAILS**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: FAIL on "renew goes through the injected renew prop" — `oyl-vault` still calls `this.store.renew`, so the `renewFn` spy is never invoked. (The existing "renew advances a subscription" test still passes — it spies `store.renew`, which the unchanged component still calls.)

- [ ] **Step 3: Add the `renew` prop to `<oyl-vault>`**

In `oyl-vault.js`, in the constructor (after the `tz` assignment, around line 47), add:
```js
    /** @type {(id: import('@oyl/all-of-oyl').Id, on: import('@oyl/all-of-oyl').DayKey) => Promise<unknown>} */
    this.renew = async () => undefined
```

- [ ] **Step 4: Use the injected `renew` in `onRenew`**

In `oyl-vault.js`, change line 176 from:
```js
        srow.onRenew = (id) => { void this.store.renew(id, today); live.textContent = 'Renewed' }
```
to:
```js
        srow.onRenew = (id) => { void this.renew(id, today); live.textContent = 'Renewed — expense recorded' }
```

- [ ] **Step 5: Run the vault test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: PASS — the new test's `renewFn` spy fires (component now calls `this.renew`); the existing "renew advances a subscription" test still passes (its `store.renew` spy fires via the helper's delegate); all other vault tests unaffected.

- [ ] **Step 6: Wire the bound function in `main.js`**

In `main.js`, find the `vault:` route (sets `view.store = dataState.vault`) and add, after that line:
```js
      view.renew = dataState.renewSubscription
```

- [ ] **Step 7: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-vault.js apps/vanilla-oyl/src/components/oyl-vault.test.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire vault Renew through data.renewSubscription (records the expense)"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller, after all tasks): `pnpm vanilla build:lib`, http-server on 8041, seed demo data, hard-reload. On #/vault click **Renew** on Netflix → "Renewed — expense recorded" + its "Renews …" advances. On #/finance → an entertainment expense for Netflix's amount appears in this month's ledger; #/insights spending rises. Renew the lapsed **Gym** → an expense dated today appears too.
