# Account balance/spend → core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the two finance calculations (`accountBalance`, `accountSpend`) off the app's reactive store onto the `Account` aggregate as `balanceIn`/`spentIn`, so the domain owns them and the store only delegates.

**Architecture:** Task 1 adds a private `postingsIn` helper + `balanceIn`/`spentIn` to `Account` (mirroring `Budget.spent(journal, month)`), with framework-free domain tests extending the existing `account.test.ts`. Task 2 makes the app store delegate and prunes its now-unused imports.

**Tech Stack:** TypeScript (NodeNext, no-DOM build), Vitest; vanilla JS + JSDoc app (checkJs, `noUnusedLocals`).

Spec: `docs/superpowers/specs/2026-06-16-all-of-oyl-account-balance-design.md`

## Global Constraints

- Methods live on `Account`; **behavior is preserved exactly** from the current store. The `e.amount.currency === this.currency` filter is a real guard (a `Transaction` built with a bare `accountId` skips the constructor's currency check) — keep it, document why (R1).
- `account.ts` imports: type-only `Journal`/`DayKey`; runtime `DayRange`/`Money`/`Transaction`. All relative, acyclic, DOM-free / `Intl`-free → `pnpm all-of build` stays green.
- Month window built from core: `DayRange.of(day.startOfMonth(), day.endOfMonth())` — NOT `periodWindowOf` (no finance→goal coupling).
- Store import surgery: prune `periodWindowOf`; convert `Money` from a value import to a `@typedef`; keep `Journal`/`Transaction` (required or `noUnusedLocals`/checkJs fails).
- Core tests use **fixed dates** (deterministic) and **extend the existing** `account.test.ts`.
- The store's public API (`accountBalance(account)`/`accountSpend(account, day)`) is unchanged — no component edits.
- Git: end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch already isolated by the executor.

---

### Task 1: `Account.balanceIn` / `spentIn` (+ `postingsIn`) in core

**Files:**
- Modify: `packages/all-of-oyl/src/finance/account.ts` (imports + 3 methods)
- Modify: `packages/all-of-oyl/src/finance/account.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `Journal` (`../core/journal.js`, `.entriesIn(range)`, `.span()`), `Transaction` (`./transaction.js`, fields `direction`/`accountId`/`amount`), `Money` (`../core/money.js`), `DayKey`/`DayRange` (`../core/*.js`).
- Produces (on `Account`): `balanceIn(journal: Journal): Money`, `spentIn(journal: Journal, day: DayKey): Money`. (`postingsIn` is private.)

- [ ] **Step 1: Write the failing tests**

In `packages/all-of-oyl/src/finance/account.test.ts`, add these imports after the existing import lines (lines 1–4):

```ts
import { Journal } from '../core/journal.js'
import { Transaction } from './transaction.js'
import { Money } from '../core/money.js'
import { DayKey } from '../core/day-key.js'
```

Then add this `describe` block inside the file (after the existing `describe('Account', ...)` block — i.e. before the final closing of the file, as a sibling top-level `describe`):

```ts
describe('Account.balanceIn / spentIn', () => {
  const day = DayKey.of('2026-06-15')
  const tx = (
    minor: number,
    dir: 'income' | 'expense',
    acc: Account,
    cur = 'USD',
    when = '2026-06-10T12:00:00Z',
  ): Transaction =>
    new Transaction({
      occurredAt: new Date(when),
      amount: Money.of(minor, cur, 2),
      category: dir === 'income' ? 'salary' : 'groceries',
      direction: dir,
      accountId: acc.id,
    })

  it('spentIn sums this-month expenses for the account, ignoring others and prior months', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    journal.add(tx(6500, 'expense', checking))
    journal.add(tx(1500, 'expense', checking))
    journal.add(tx(9999, 'expense', visa))
    journal.add(tx(5000, 'expense', checking, 'USD', '2026-04-10T12:00:00Z')) // prior month
    expect(checking.spentIn(journal, day).minor).toBe(8000)
    expect(visa.spentIn(journal, day).minor).toBe(9999)
  })

  it('spentIn returns a typed zero in the account currency when there are no transactions', () => {
    const journal = new Journal('UTC')
    const z = new Account({ name: 'Savings', currency: 'EUR' }).spentIn(journal, day)
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })

  it('balanceIn is income minus expense over all recorded transactions for the account', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    journal.add(tx(200000, 'income', checking))
    journal.add(tx(50000, 'expense', checking))
    journal.add(tx(9999, 'expense', visa))
    expect(checking.balanceIn(journal).minor).toBe(150000)
  })

  it('balanceIn is negative when expenses exceed income', () => {
    const journal = new Journal('UTC')
    const acc = new Account({ name: 'Cash', currency: 'USD' })
    journal.add(tx(5000, 'expense', acc))
    expect(acc.balanceIn(journal).minor).toBe(-5000)
  })

  it('balanceIn returns a typed zero for an account with no transactions', () => {
    const journal = new Journal('UTC')
    const z = new Account({ name: 'Savings', currency: 'EUR' }).balanceIn(journal)
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })

  it('balanceIn skips a transaction tagged to the account but in a different currency (R1 guard)', () => {
    const journal = new Journal('UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    journal.add(tx(10000, 'income', checking, 'USD'))
    journal.add(tx(5000, 'income', checking, 'EUR'))
    expect(checking.balanceIn(journal).minor).toBe(10000)
    expect(checking.balanceIn(journal).currency).toBe('USD')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/finance/account.test.ts`
Expected: FAIL — `checking.spentIn is not a function` / `balanceIn is not a function`.

- [ ] **Step 3: Add the imports and methods to `account.ts`**

In `packages/all-of-oyl/src/finance/account.ts`, add these imports after the existing import block (after line 3, the `persisted-meta` import):

```ts
import type { DayKey } from '../core/day-key.js'
import type { Journal } from '../core/journal.js'
import { DayRange } from '../core/day-range.js'
import { Money } from '../core/money.js'
import { Transaction } from './transaction.js'
```

Then insert these three methods into the `Account` class, immediately after the constructor's closing brace and before `toJSON()`:

```ts
  /**
   * This account's transactions within `range`, in this account's currency.
   * The currency filter is NOT redundant: `Transaction` only enforces a
   * currency match when constructed with the full `account` object; a bare
   * `accountId` skips that check — so this guard keeps mismatched postings out.
   */
  private postingsIn(journal: Journal, range: DayRange): Transaction[] {
    return journal
      .entriesIn(range)
      .filter(
        (e): e is Transaction =>
          e instanceof Transaction && e.accountId === this.id && e.amount.currency === this.currency,
      )
  }

  /**
   * All-time balance: income minus expense over every recorded transaction in
   * this account's currency. Net-of-recorded — no opening-balance field exists.
   */
  balanceIn(journal: Journal): Money {
    const zero = Money.fromMajor(0, this.currency)
    const span = journal.span()
    if (!span) return zero
    return this.postingsIn(journal, span).reduce(
      (bal, t) => (t.direction === 'income' ? bal.add(t.amount) : bal.subtract(t.amount)),
      zero,
    )
  }

  /** This-month expense total for this account (Money in the account's currency). */
  spentIn(journal: Journal, day: DayKey): Money {
    const range = DayRange.of(day.startOfMonth(), day.endOfMonth())
    return this.postingsIn(journal, range)
      .filter((t) => t.direction === 'expense')
      .reduce((sum, t) => sum.add(t.amount), Money.fromMajor(0, this.currency))
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/finance/account.test.ts`
Expected: PASS (existing Account cases + the 6 new ones).

- [ ] **Step 5: Run the full core gate**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl typecheck:src && pnpm all-of build`
Expected: all tests PASS; strict `src/` typecheck clean (the `import type` for `Journal`/`DayKey` keeps the build DOM-safe); `pnpm all-of build` prints `dist/ is bare-import free.`

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/finance/account.ts packages/all-of-oyl/src/finance/account.test.ts
git commit -m "feat(all-of-oyl): Account.balanceIn/spentIn — finance balance in the domain

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: App store delegates + import surgery

**Files:**
- Modify: `apps/vanilla-oyl/src/state/journal-store.js` (imports + the two methods)
- Modify: `apps/vanilla-oyl/src/state/journal-store.test.js` (trim two `describe` blocks)

**Interfaces:**
- Consumes: `Account.balanceIn(journal)` / `Account.spentIn(journal, day)` (Task 1).
- Produces: store methods `accountBalance(account)` / `accountSpend(account, day)` — same signatures as before, now delegating.

- [ ] **Step 1: Trim the store tests to representative delegation cases**

In `apps/vanilla-oyl/src/state/journal-store.test.js`, replace the entire `describe('accountSpend', ...)` block and the entire `describe('accountBalance', ...)` block with these two blocks (the exhaustive scenarios now live in core `account.test.ts`):

```js
describe('accountSpend (delegates to Account.spentIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountSpend(checking, DayKey.from(new Date(), 'UTC')).minor).toBe(6500)
  })
})

describe('accountBalance (delegates to Account.balanceIn)', () => {
  it('reflects store writes through the reactive wrapper', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income', accountId: checking.id }))
    await store.add(new Transaction({ occurredAt: noon(), amount: Money.of(50000, 'USD', 2), category: 'groceries', direction: 'expense', accountId: checking.id }))
    expect(store.accountBalance(checking).minor).toBe(150000)
  })
})
```

(The test file's existing top-of-file imports — `Account`, `Transaction`, `Money`, `DayKey`, `InMemoryRepository`, `createJournalStore` — stay; they are still used by these blocks and the other describes.)

- [ ] **Step 2: Run the trimmed store tests (regression guard)**

Task 2 is a behavior-preserving refactor, so these tests are a regression
guard, not a red→green cycle: they must pass before AND after the delegation.

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`
Expected: PASS — the store still computes balance/spend inline at this point.
This confirms the trimmed blocks are valid before you change the implementation
in Step 3 (which must keep them green).

- [ ] **Step 3: Make the store delegate and fix imports**

In `apps/vanilla-oyl/src/state/journal-store.js`:

1. Replace the import on line 1:
   ```js
   import { Journal, Transaction } from '@oyl/all-of-oyl'
   ```
   (drops `Money` and `periodWindowOf` from the value import).

2. Add a `Money` typedef to the typedef block (after the `DayRange` typedef line):
   ```js
   /** @typedef {import('@oyl/all-of-oyl').Money} Money */
   ```

3. Replace the `accountSpend` method with:
   ```js
   /** This-month expense total for `account` (Money in the account's currency; reactive). @param {Account} account @param {DayKey} day @returns {Money} */
   accountSpend(account, day) {
     revision.get()
     return account.spentIn(journal, day)
   },
   ```

4. Replace the `accountBalance` method with:
   ```js
   /** All-time balance for `account`: income minus expense over recorded transactions (Money in the account's currency; reactive). Net-of-recorded. @param {Account} account @returns {Money} */
   accountBalance(account) {
     revision.get()
     return account.balanceIn(journal)
   },
   ```

- [ ] **Step 4: Run the full app gate**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all tests PASS (the delegation cases prove the store reflects writes); typecheck clean (proves the import surgery — pruned `periodWindowOf`, `Money` as typedef — satisfies `noUnusedLocals`).

- [ ] **Step 5: Verify the move and commit**

Run: `grep -n "instanceof Transaction" apps/vanilla-oyl/src/state/journal-store.js`
Expected: a single match inside `transactionsIn` only (the balance/spend reduces are gone from the app).

```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "refactor(vanilla-oyl): delegate account balance/spend to the Account aggregate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Definition of Done (whole feature)

- `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green.
- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- `grep -n "instanceof Transaction" apps/vanilla-oyl/src/state/journal-store.js` shows only `transactionsIn`.
- The store's `accountBalance`/`accountSpend` keep their signatures; no component file changed.
