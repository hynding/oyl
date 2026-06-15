# Vanilla-OYL Finance Slice B (per-account balance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each account's all-time balance (income − expense) as the headline on its Accounts-section row, with the existing "this month" spend kept below.

**Architecture:** `formatMoney` learns to render negatives (`-$X`); `journalStore.accountBalance(account)` sums income−expense over `journal.span()` with a currency-match guard (also added to `accountSpend`); the account row shows balance headline + spend line. No domain/store/route changes beyond the journal store.

**Tech Stack:** Vanilla JS + JSDoc, `@oyl/all-of-oyl` (`Money`, `Transaction`, `journal.span()`), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-account-balance-design.md`

**Branch:** `feat/vanilla-oyl-account-balance` (off `master` HEAD). Baseline: `pnpm vanilla test` green (239 tests).

---

## File structure

- **Modify** `src/vault/format.js` — `formatMoney` negative sign (T1).
- **Modify** `src/state/journal-store.js` — `accountBalance` + currency guard on `accountSpend` (T2).
- **Modify** `src/components/oyl-finance.js` — balance headline on account rows (T3).
- **Tests:** extend `vault/format.test.js` (T1), `journal-store.test.js` (T2), `oyl-finance.test.js` (T3).

Order matters: T1 (formatMoney) and T2 (accountBalance) are prerequisites for T3's display.

---

### Task 1: `formatMoney` renders negatives

**Files:**
- Modify: `apps/vanilla-oyl/src/vault/format.js`
- Test: `apps/vanilla-oyl/src/vault/format.test.js`

- [ ] **Step 1: Write the failing test**

Add to the `describe('formatMoney', ...)` block in `vault/format.test.js`:
```js
  it('renders negatives with the sign before the symbol', () => {
    expect(formatMoney(Money.of(-20000, 'USD', 2))).toBe('-$200.00')
    expect(formatMoney(Money.of(-1000, 'JPY', 0))).toBe('-1000 JPY')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: FAIL — the **USD** assertion drives the red (current output is `$-200.00`, not `-$200.00`). (The no-symbol JPY case already renders `-1000 JPY` today, so that line alone wouldn't fail; the USD one does.)

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/vault/format.js`, replace `formatMoney`:
```js
/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>"; negatives as "-$200.00". @param {Money} m @returns {string} */
export function formatMoney(m) {
  const neg = m.minor < 0
  const amount = (Math.abs(m.minor) / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  const body = sym ? `${sym}${amount}` : `${amount} ${m.currency}`
  return neg ? `-${body}` : body
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: PASS (new + existing formatMoney/other tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/vault/format.js apps/vanilla-oyl/src/vault/format.test.js
git commit -m "fix(vanilla-oyl): formatMoney renders negatives as -\$X"
```

---

### Task 2: `journalStore.accountBalance` + currency guard

**Files:**
- Modify: `apps/vanilla-oyl/src/state/journal-store.js`
- Test: `apps/vanilla-oyl/src/state/journal-store.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `journal-store.test.js` (`Account`, `Money`, `Transaction`, `createJournalStore`, `InMemoryRepository` already imported from the accountSpend tests):
```js
describe('accountBalance', () => {
  const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
  /** @param {any} store @param {'income'|'expense'} dir @param {number} minor @param {any} acc @param {string} [cur] */
  const post = (store, dir, minor, acc, cur = 'USD') => store.add(new Transaction({ occurredAt: noon(), amount: Money.of(minor, cur, 2), category: dir === 'income' ? 'salary' : 'groceries', direction: dir, accountId: acc.id }))

  it('is income minus expense over all recorded transactions for the account', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    await post(store, 'income', 200000, checking)
    await post(store, 'expense', 50000, checking)
    await post(store, 'expense', 9999, visa)
    expect(store.accountBalance(checking).minor).toBe(150000)
  })

  it('is negative when expenses exceed income', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const acc = new Account({ name: 'Cash', currency: 'USD' })
    await post(store, 'expense', 5000, acc)
    expect(store.accountBalance(acc).minor).toBe(-5000)
  })

  it('returns a typed zero for an account with no transactions', () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const z = store.accountBalance(new Account({ name: 'Savings', currency: 'EUR' }))
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })

  it('skips a transaction tagged to the account but in a different currency (no throw)', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    await post(store, 'income', 10000, checking, 'USD')
    await post(store, 'income', 5000, checking, 'EUR')
    expect(store.accountBalance(checking).minor).toBe(10000)
    expect(store.accountBalance(checking).currency).toBe('USD')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`
Expected: FAIL — `store.accountBalance is not a function`.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/journal-store.js`:

(a) Add the currency guard to `accountSpend` — change its reducer predicate (line ~85) to:
```js
        (sum, e) => (e instanceof Transaction && e.direction === 'expense' && e.accountId === account.id && e.amount.currency === account.currency ? sum.add(e.amount) : sum),
```
(b) Add `accountBalance` immediately after `accountSpend`:
```js
    /** All-time balance for `account`: income minus expense over every recorded transaction (Money in the account's currency; reactive). No opening-balance field exists, so this is net-of-recorded. @param {Account} account @returns {Money} */
    accountBalance(account) {
      revision.get()
      const zero = Money.fromMajor(0, account.currency)
      const span = journal.span()
      if (!span) return zero
      return journal.entriesIn(span).reduce(
        (bal, e) =>
          e instanceof Transaction && e.accountId === account.id && e.amount.currency === account.currency
            ? (e.direction === 'income' ? bal.add(e.amount) : bal.subtract(e.amount))
            : bal,
        zero,
      )
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`
Expected: PASS (new + existing, incl. the accountSpend tests — the added guard doesn't change their USD-matched cases).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): journalStore.accountBalance (all-time income - expense, currency-guarded)"
```

---

### Task 3: Balance headline on the account row

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance.test.js`

- [ ] **Step 1: Write the failing test**

Add to the `describe('<oyl-finance> accounts', ...)` block in `oyl-finance.test.js` (`Account`, `createAccountsStore`, `Transaction`, `Money`, `at`, `root`, `screen` already available):
```js
  it('shows the account balance (income minus expense) as the headline, with spend below', async () => {
    const accounts = createAccountsStore(/** @type {any} */ (new InMemoryRepository()))
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income', account: { id: acc.id, currency: 'USD' } }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(50000, 'USD', 2), category: 'groceries', direction: 'expense', account: { id: acc.id, currency: 'USD' } }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const item = /** @type {any} */ ([...root(el).querySelectorAll('oyl-vault-item')].find((i) => i.label === 'Checking'))
    expect(item.lines[0]).toContain('$1500.00')
    expect(item.lines.join(' ')).toContain('this month')
    el.remove()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: FAIL — `item.lines[0]` is the spend line ("USD · $500.00 this month"), not the `$1500.00` balance.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-finance.js`, in the Accounts-section loop, change:
```js
        item.lines = [`${a.currency} · ${accountSpendLabel(this.store.accountSpend(a, today))}`]
```
to:
```js
        item.lines = [
          `${a.currency} · ${formatMoney(this.store.accountBalance(a))}`,
          accountSpendLabel(this.store.accountSpend(a, today)),
        ]
```
(`formatMoney` is already imported in this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: PASS (new + existing — the 4a "renders an account with its this-month spend" test still passes: its spend line is `lines[1]`, and `lines.join(' ')` still contains the spend amount + "this month").

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): account rows show balance headline + this-month spend"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller, after all tasks): `pnpm vanilla build:lib`, http-server on 8041, seed, hard-reload. On `#/finance`, each Accounts row shows a **balance headline** (`USD · $…`) + the "this month" spend line. Seeded **Checking** (expenses only) shows a **negative** balance (`USD · -$…`); switch the composer to **Income**, record a `salary` to Checking → its balance rises (goes positive once income exceeds recorded expenses), while the "this month" spend line is unchanged.
