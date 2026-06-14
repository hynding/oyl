# Vanilla-OYL Finance Slice 4b (composer account picker + ledger label) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user attribute an expense to an account in the composer (with the account driving the currency), and show the account name on ledger rows — completing Finance.

**Architecture:** Two files. `oyl-finance-composer.js` gains an `accounts` prop, an Account `<select>` (reactive options, "Cash (no account)" default), currency coupling (pick an account → post `account:{id,currency}` + hide the currency select), and R-K (deleted selection → Cash). `oyl-finance.js` wires `composer.accounts` and appends the resolved account name to ledger rows. No new store/component/route; no `data.js`/`main.js` change (accounts wired in 4a).

**Tech Stack:** Vanilla JS + JSDoc, `@oyl/all-of-oyl` (`Transaction`, `Account`, `Money`), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-account-picker-design.md`

**Branch:** `feat/vanilla-oyl-account-picker` (off `master` HEAD). Baseline: `pnpm vanilla test` green (221 tests).

---

## File structure

- **Modify** `apps/vanilla-oyl/src/components/oyl-finance-composer.js` — `accounts` prop, Account field, reactive options `track()`, currency coupling, R-K (T1); submit posts account provenance (T2).
- **Modify** `apps/vanilla-oyl/src/components/oyl-finance.js` — wire `composer.accounts` + ledger account label (T3).
- **Tests:** extend `oyl-finance-composer.test.js` (T1, T2), `oyl-finance.test.js` (T3).

---

### Task 1: Composer Account field + reactive options + currency coupling + R-K

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance-composer.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`

- [ ] **Step 1: Update the test helper (R-2) and write the failing tests**

In `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`:

(a) Add imports below the existing ones:
```js
import { InMemoryRepository, Account } from '@oyl/all-of-oyl'
import { createAccountsStore } from '../state/accounts-store.js'
```
(b) Replace the `composer(store)` helper so every instance also gets an accounts store (default empty; tests can pass their own):
```js
/** @param {{ add?: (e: any) => Promise<any> }} store @param {any} [accounts] */
function composer(store, accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))) {
  const el = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
  el.store = /** @type {any} */ (store)
  el.accounts = /** @type {any} */ (accounts)
  document.body.append(el)
  return el
}
```
(c) Add a new `describe` block at the end of the file:
```js
describe('<oyl-finance-composer> account picker', () => {
  it('defaults to Cash with the currency select visible', async () => {
    const el = composer({ add: async (e) => e })
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    expect(acct).toBeTruthy()
    expect(acct.value).toBe('')
    expect([...acct.options].map((o) => o.textContent)).toContain('Cash (no account)')
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })

  it('hides the currency select when an account is selected, shows it for Cash', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    acct.value = acc.id
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(true)
    acct.value = ''
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })

  it('refreshes account options reactively without clobbering a typed amount (R-A)', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    q(el, 'input[name="amount"]').value = '42'
    await accts.add(new Account({ name: 'Visa', currency: 'EUR' }))
    await Promise.resolve()
    const opts = [...q(el, 'select[name="account"]').options].map((o) => o.textContent)
    expect(opts).toContain('Visa · EUR')
    expect(q(el, 'input[name="amount"]').value).toBe('42')
    el.remove()
  })

  it('resets the selection to Cash when the selected account is deleted (R-K)', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const el = composer({ add: async (e) => e }, accts)
    await Promise.resolve()
    const acct = q(el, 'select[name="account"]')
    acct.value = acc.id
    acct.dispatchEvent(new Event('change'))
    expect(q(el, 'select[name="currency"]').hidden).toBe(true)
    await accts.remove(acc.id)
    await Promise.resolve()
    expect(acct.value).toBe('')
    expect(q(el, 'select[name="currency"]').hidden).toBe(false)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: the 4 new tests FAIL (no `select[name="account"]`). The 2 existing tests still PASS (the helper now sets `el.accounts`, but the component doesn't read it yet — no crash). If an existing test fails, STOP and report.

- [ ] **Step 3: Implement the Account field + track + coupling**

In `apps/vanilla-oyl/src/components/oyl-finance-composer.js`:

(a) Add the AccountsStore typedef after the JournalStore typedef (line ~6):
```js
/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */
```
(b) Add the `accounts` prop in the constructor after `this.onAdded = () => {}`:
```js
    /** @type {AccountsStore} */
    this.accounts = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
```
(c) In `render()`, after the `category` select is built (before the `date` field), create the account select:
```js
    const account = document.createElement('select')
    account.name = 'account'
    const syncCurrencyVisibility = () => { currency.hidden = account.value !== '' }
    account.addEventListener('change', syncCurrencyVisibility, { signal: this.lifecycle })
```
(d) Insert the account field into the `formEl.append(...)` call, right after the Amount field:
```js
    formEl.append(
      this._labeled('amount', 'Amount', priceWrap),
      this._labeled('account', 'Account', account),
      this._labeled('category', 'Category', category),
      this._labeled('date', 'Date', date),
      this._labeled('note', 'Note (optional)', note),
      error, actions,
    )
```
(e) Add a `track()` at the END of `render()` (after the submit listener) that repopulates options + R-K:
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
      account.value = list.some((a) => a.id === prev) ? prev : ''
      syncCurrencyVisibility()
    })
```
Leave `_submit` and its listener unchanged in this task (the account selection does not affect posting yet — that is Task 2). The `account` const stays in scope for Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: PASS (2 existing + 4 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean. Fix NEW errors from your changes; report (don't fix) pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance-composer.js apps/vanilla-oyl/src/components/oyl-finance-composer.test.js
git commit -m "feat(vanilla-oyl): composer account picker (reactive options, currency coupling, R-K)"
```

---

### Task 2: Composer submit posts account provenance

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance-composer.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests to the `account picker` describe block in `oyl-finance-composer.test.js`:
```js
  it('stamps the selected account as provenance and uses its currency', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } }, accts)
    await Promise.resolve()
    q(el, 'input[name="amount"]').value = '20'
    const acct = q(el, 'select[name="account"]')
    acct.value = acc.id
    acct.dispatchEvent(new Event('change'))
    q(el, 'input[name="date"]').value = '2026-06-10'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0].accountId).toBe(acc.id)
    expect(added[0].amount.currency).toBe('USD')
    el.remove()
  })

  it('posts no account for Cash and uses the currency select', async () => {
    const accts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    await accts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } }, accts)
    await Promise.resolve()
    q(el, 'input[name="amount"]').value = '20'
    q(el, 'select[name="currency"]').value = 'EUR'
    q(el, 'input[name="date"]').value = '2026-06-10'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0].accountId).toBeUndefined()
    expect(added[0].amount.currency).toBe('EUR')
    el.remove()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: the 2 new tests FAIL — `added[0].accountId` is `undefined` for the selected-account case (submit ignores the picker), and the account case's currency would be whatever the hidden currency select holds, not USD.

- [ ] **Step 3: Implement submit provenance**

In `apps/vanilla-oyl/src/components/oyl-finance-composer.js`:

(a) The submit listener already exists in `render()` (it sits just before the Task-1 `track()` block, with `account` already in scope). Edit it in place to add `account` to the ctx object — change `this._submit({ error, amount, currency, category, date, note })` to:
```js
      void this._submit({ error, amount, currency, category, date, note, account })
```

(b) Replace `_submit` with the account-aware version:
```js
  /** @param {{ error: HTMLElement, amount: HTMLInputElement, currency: HTMLSelectElement, category: HTMLSelectElement, date: HTMLInputElement, note: HTMLInputElement, account: HTMLSelectElement }} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    if (!ctx.date.value) { ctx.error.textContent = 'Pick a date'; return }
    const amt = Number(ctx.amount.value)
    if (!(amt > 0)) { ctx.error.textContent = 'Amount must be positive'; return }
    try {
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
      ctx.amount.value = ''
      ctx.note.value = ''
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: PASS (all composer tests, incl. the original "adds an expense" test which leaves the account as Cash → uses the currency select as before).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance-composer.js apps/vanilla-oyl/src/components/oyl-finance-composer.test.js
git commit -m "feat(vanilla-oyl): composer posts account provenance (account drives currency)"
```

---

### Task 3: Screen wiring + ledger account label

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance.test.js`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('<oyl-finance> accounts', ...)` block (or a new block) in `oyl-finance.test.js` (`Account`, `createAccountsStore`, `Transaction`, `Money`, `at`, `root`, `screen` already imported/defined from 4a):
```js
  it('shows the account name on a ledger row, and nothing for cash/unknown', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const groceries = items.find((i) => i.label.includes('groceries'))
    const dining = items.find((i) => i.label.includes('dining'))
    expect(groceries.lines.join(' ')).toContain('Checking')
    expect(dining.lines.join(' ')).not.toContain('Checking')
    el.remove()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: FAIL — the groceries ledger row's lines do not contain "Checking" (no label yet).

- [ ] **Step 3: Implement wiring + ledger label**

In `apps/vanilla-oyl/src/components/oyl-finance.js`:

(a) Where the composer is created and configured (the block setting `composer.store` / `composer.onAdded`, before `root.append(...)`), add (R-1):
```js
    composer.accounts = this.accounts
```
(b) In the `track()`, in the ledger section, build an id→name Map before the ledger loop:
```js
      const nameById = new Map(this.accounts.all().map((a) => [a.id, a.name]))
```
(place it just after `today`/`range` are computed and before the `for (const tx of txs)` loop).
(c) In the ledger loop, change the `item.lines = [...]` line from:
```js
        item.lines = [DayKey.from(tx.occurredAt, this.tz).value, tx.note]
```
to:
```js
        const acctName = tx.accountId ? nameById.get(tx.accountId) : undefined
        item.lines = [`${DayKey.from(tx.occurredAt, this.tz).value}${acctName ? ` · ${acctName}` : ''}`, tx.note]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: PASS (new + existing).

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): wire composer.accounts + ledger account label"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller, after all tasks): `pnpm vanilla build:lib`, http-server on 8041, seed, hard-reload. On `#/finance`: the composer has an **Account** field defaulting to "Cash (no account)" with the currency select visible. Select **Checking** → currency select hides; add an expense → the ledger row reads "`date · Checking`" and Checking's Accounts-section total rises. Switch to **Cash** → currency select returns; add → no account label. Add a new account in the Accounts section → it appears in the picker immediately; delete the selected account → the picker resets to "Cash".
