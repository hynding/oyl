# Vanilla-OYL Finance Slice C (ledger filter by account) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Filter by account" select above the ledger that scopes it to one account, Cash, or All — a client-side filter over the existing ledger `txs`.

**Architecture:** One file (`oyl-finance.js`) + its test. A `_filter` signal drives a reactive filter in the ledger `track()`; options rebuild from `this.accounts.all()` each run; an effective-filter derivation handles a deleted selection without mutating the signal (no effect loop); the filter hides when there are no accounts.

**Tech Stack:** Vanilla JS + JSDoc, signals + shadow DOM, Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-ledger-filter-design.md`

**Branch:** `feat/vanilla-oyl-ledger-filter` (off `master` HEAD). Baseline: `pnpm vanilla test` green (245 tests).

---

### Task 1: Ledger filter by account

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance.test.js`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `oyl-finance.test.js` (helpers `at`, `root`, `screen(store, budgets, accounts)`, `TZ`, and imports `Account`/`Transaction`/`Money`/`createJournalStore`/`createAccountsStore`/`InMemoryRepository` all already present):
```js
describe('<oyl-finance> ledger filter', () => {
  /** @param {any} el */
  const ledgerRows = (el) => [...root(el).querySelectorAll('.ledger oyl-vault-item')]
  /** @param {any} el @param {string} value */
  const setFilter = async (el, value) => {
    const f = /** @type {any} */ (root(el).querySelector('select.ledger-filter'))
    f.value = value
    f.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  }

  async function seeded() {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    return { accounts, acc, store }
  }

  it('shows all ledger rows by default', async () => {
    const { accounts, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    expect(ledgerRows(el)).toHaveLength(2)
    el.remove()
  })

  it('filters to a single account', async () => {
    const { accounts, acc, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    const rows = ledgerRows(el)
    expect(rows).toHaveLength(1)
    expect(/** @type {any} */ (rows[0]).label).toContain('groceries')
    el.remove()
  })

  it('filters to Cash (no-account transactions)', async () => {
    const { accounts, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, 'cash')
    const rows = ledgerRows(el)
    expect(rows).toHaveLength(1)
    expect(/** @type {any} */ (rows[0]).label).toContain('dining')
    el.remove()
  })

  it('reverts to All when the selected account is deleted (R-K)', async () => {
    const { accounts, acc, store } = await seeded()
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    expect(ledgerRows(el)).toHaveLength(1)
    await accounts.remove(acc.id)
    await Promise.resolve()
    expect(/** @type {any} */ (root(el).querySelector('select.ledger-filter')).value).toBe('')
    expect(ledgerRows(el)).toHaveLength(2)
    el.remove()
  })

  it('shows an empty message when the filter yields nothing', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Visa', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    await setFilter(el, acc.id)
    expect(ledgerRows(el)).toHaveLength(0)
    expect(root(el).textContent).toContain('No transactions for this view.')
    el.remove()
  })

  it('hides the filter when there are no accounts (R-A)', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    const noAccts = screen(store)
    await Promise.resolve()
    expect(/** @type {any} */ (root(noAccts).querySelector('select.ledger-filter')).hidden).toBe(true)
    noAccts.remove()

    const { accounts, store: s2 } = await seeded()
    const withAccts = screen(s2, undefined, accounts)
    await Promise.resolve()
    expect(/** @type {any} */ (root(withAccts).querySelector('select.ledger-filter')).hidden).toBe(false)
    withAccts.remove()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: the new tests FAIL (`select.ledger-filter` doesn't exist; `.ledger` class absent). Existing tests still pass. If an existing test fails, STOP and report.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-finance.js`:

(a) Add the signal import (after line 4):
```js
import { signal } from '../lib/reactive/signal.js'
```
(b) In the constructor, after `this.accounts = ...`, add:
```js
    this._filter = signal('')
```
(c) In the `styles` sheet, add a rule for the filter select (next to the other rules):
```css
  select.ledger-filter { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .35rem .5rem; margin-block-end: .6rem; }
```
(d) In `render()`, where the ledger nodes are built (the `const list = document.createElement('ol')` block, ~line 64), give the list a class and build the filter select:
```js
    const list = document.createElement('ol')
    list.className = 'ledger'
    const filterSel = document.createElement('select')
    filterSel.className = 'ledger-filter'
    filterSel.setAttribute('aria-label', 'Filter by account')
    filterSel.addEventListener('change', () => this._filter.set(filterSel.value), { signal: this.lifecycle })
```
(e) In the `root.append(...)` call, insert `filterSel` between `label` and `list`:
```js
    root.append(h2, live, composer, label, filterSel, list, empty, budgetLabelEl, budgetForm, budgetList, budgetEmpty, accountLabelEl, accountForm, accountList, accountEmpty)
```
(f) Replace the ledger head of the `track()` (current lines 92-96) — from:
```js
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const txs = [...this.store.transactionsIn(range)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      const nameById = new Map(this.accounts.all().map((a) => [a.id, a.name]))
```
to:
```js
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const accts = this.accounts.all()

      const raw = this._filter.get()
      const filter = raw === '' || raw === 'cash' || accts.some((a) => a.id === raw) ? raw : ''
      const mk = (/** @type {string} */ value, /** @type {string} */ text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o }
      filterSel.replaceChildren(mk('', 'All accounts'), mk('cash', 'Cash'))
      for (const a of accts) filterSel.append(mk(a.id, a.name))
      filterSel.value = filter
      filterSel.hidden = accts.length === 0

      const nameById = new Map(accts.map((a) => [a.id, a.name]))
      const txs = [...this.store.transactionsIn(range)]
        .filter((tx) => (filter === '' ? true : filter === 'cash' ? !tx.accountId : tx.accountId === filter))
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
```
(g) Replace the empty-state lines (current lines 108-109) — from:
```js
      empty.hidden = txs.length > 0
      empty.textContent = empty.hidden ? '' : 'No transactions this month.'
```
to:
```js
      empty.hidden = txs.length > 0
      empty.textContent = txs.length > 0 ? '' : filter === '' ? 'No transactions this month.' : 'No transactions for this view.'
```
Leave the `for (const tx of txs) { ... }` row-building loop and the Budgets/Accounts sections unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: PASS (new + existing — existing ledger tests use empty-accounts screens, so the filter is hidden and `filter` defaults to `''`, leaving their behavior unchanged).

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean. (`this._filter` holds a `string` from `signal('')`; if tsc narrows it too tightly, annotate `this._filter = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (signal(''))`.) Fix NEW errors; report pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): ledger filter by account (All / Cash / per-account)"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller): `pnpm vanilla build:lib`, http-server on 8041, seed, hard-reload. On `#/finance`, a **Filter by account** select sits above the ledger (default "All accounts"). Record a Cash expense and a Checking expense; pick **Checking** → only Checking's rows; pick **Cash** → only the no-account row; pick **All accounts** → everything. Delete the filtered account in the Accounts section → the filter snaps to "All accounts" and the full ledger returns. (With a fresh store that has no accounts, the filter is hidden.)
