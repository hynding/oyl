# Vanilla-OYL Finance Slice 4a (Accounts catalog + per-account spend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Accounts section to the bottom of `#/finance` — a money-account catalog (inline add, delete) where each account shows its this-month spend, computed from the transactions that already carry its `accountId`.

**Architecture:** Reuses every established pattern — `createAccountsStore` mirrors `BudgetsStore`; account rows reuse `oyl-vault-item` (no new row component); the add form mirrors `oyl-budget-form`. The one new domain read is `journalStore.accountSpend(account, day) → Money`. No composer/ledger changes (that is Slice 4b).

**Tech Stack:** Vanilla JS + JSDoc, `@oyl/all-of-oyl` (`Account`, `Money`, `Transaction`, `periodWindowOf`), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-accounts-catalog-design.md`

**Branch:** `feat/vanilla-oyl-accounts-catalog` (off `master` HEAD). Baseline: `pnpm vanilla test` green (208 tests).

---

## File structure

- **Create** `apps/vanilla-oyl/src/account/format.js` — `accountSpendLabel(spent)`.
- **Create** `apps/vanilla-oyl/src/state/accounts-store.js` — `createAccountsStore(accountsRepo)`.
- **Create** `apps/vanilla-oyl/src/components/oyl-account-form.js` — inline add (name + currency).
- **Modify** `apps/vanilla-oyl/src/state/journal-store.js` — add `accountSpend(account, day)`.
- **Modify** `apps/vanilla-oyl/src/components/oyl-finance.js` — Accounts section + `accounts` prop.
- **Modify** `apps/vanilla-oyl/src/state/data.js` — wire the accounts store.
- **Modify** `apps/vanilla-oyl/src/main.js` — finance route sets `view.accounts`.
- **Tests:** new `account/format.test.js`, `accounts-store.test.js`, `oyl-account-form.test.js`; extend `journal-store.test.js`, `oyl-finance.test.js`, `data.test.js`.

---

### Task 1: `account/format.js` — `accountSpendLabel`

**Files:**
- Create: `apps/vanilla-oyl/src/account/format.js`
- Test: `apps/vanilla-oyl/src/account/format.test.js`

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/account/format.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { Money } from '@oyl/all-of-oyl'
import { accountSpendLabel } from './format.js'

describe('accountSpendLabel', () => {
  it('formats the money with a "this month" suffix', () => {
    expect(accountSpendLabel(Money.of(6500, 'USD', 2))).toBe('$65.00 this month')
  })
  it('handles zero', () => {
    expect(accountSpendLabel(Money.of(0, 'USD', 2))).toBe('$0.00 this month')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/account/format.test.js`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/account/format.js`:
```js
import { formatMoney } from '../vault/format.js'

/** @typedef {import('@oyl/all-of-oyl').Money} Money */

/** "$65.00 this month". @param {Money} spent @returns {string} */
export function accountSpendLabel(spent) {
  return `${formatMoney(spent)} this month`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/account/format.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/account/format.js apps/vanilla-oyl/src/account/format.test.js
git commit -m "feat(vanilla-oyl): accountSpendLabel formatter"
```

---

### Task 2: `accounts-store.js` — `createAccountsStore`

**Files:**
- Create: `apps/vanilla-oyl/src/state/accounts-store.js`
- Test: `apps/vanilla-oyl/src/state/accounts-store.test.js`

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/state/accounts-store.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Account } from '@oyl/all-of-oyl'
import { createAccountsStore } from './accounts-store.js'

describe('createAccountsStore', () => {
  it('add persists and appears in all()', async () => {
    const store = createAccountsStore(new InMemoryRepository())
    const saved = await store.add(new Account({ name: 'Checking', currency: 'USD' }))
    expect(saved.name).toBe('Checking')
    expect(store.all().map((a) => a.name)).toEqual(['Checking'])
  })

  it('remove deletes by id', async () => {
    const store = createAccountsStore(new InMemoryRepository())
    const a = await store.add(new Account({ name: 'Visa', currency: 'USD' }))
    await store.remove(a.id)
    expect(store.all()).toHaveLength(0)
  })

  it('hydrate rebuilds from the repository', async () => {
    const repo = new InMemoryRepository()
    await repo.save(new Account({ name: 'Savings', currency: 'EUR' }))
    const store = createAccountsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all().map((a) => a.name)).toEqual(['Savings'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/accounts-store.test.js`
Expected: FAIL — cannot resolve `./accounts-store.js`.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/state/accounts-store.js`:
```js
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Account} Account */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').Repository<Account>} AccountsRepo */

/**
 * App-level reactive wrapper over the accounts Repository — the list of domain Accounts.
 * Add/remove are persist-first; accounts have no in-place mutation (no edit). Per-account
 * spend is read via journalStore.accountSpend (needs the Journal), so this store stays
 * journal-agnostic.
 * @param {AccountsRepo} accountsRepo
 */
export function createAccountsStore(accountsRepo) {
  /** @type {Account[]} */
  let accounts = []
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    accounts = [...(await accountsRepo.list())]
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,
    /** @param {Account} a @returns {Promise<Account>} */
    async add(a) {
      const saved = await accountsRepo.save(a)
      accounts = [...accounts, saved]
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async remove(id) {
      await accountsRepo.delete(id)
      accounts = accounts.filter((x) => x.id !== id)
      revision.set((n += 1))
    },
    /** @returns {readonly Account[]} */
    all() {
      revision.get()
      return [...accounts]
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/accounts-store.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/accounts-store.js apps/vanilla-oyl/src/state/accounts-store.test.js
git commit -m "feat(vanilla-oyl): accounts store (createAccountsStore)"
```

---

### Task 3: `journalStore.accountSpend(account, day)`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/journal-store.js:1` (import) and `:11` (typedef) and after `budgetStatus`
- Test: `apps/vanilla-oyl/src/state/journal-store.test.js`

- [ ] **Step 1: Write the failing test**

Append to `apps/vanilla-oyl/src/state/journal-store.test.js` (add `Account` to its `@oyl/all-of-oyl` import if not already present; `Transaction`, `Money`, `DayKey`, `createJournalStore`, `InMemoryRepository` are already imported there):
```js
describe('accountSpend', () => {
  it('sums this-month expenses for the account, ignoring others and prior months', async () => {
    const store = createJournalStore(new InMemoryRepository(), 'UTC')
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    const visa = new Account({ name: 'Visa', currency: 'USD' })
    const today = DayKey.from(new Date(), 'UTC')
    const noon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
    const prior = () => { const d = new Date(Date.now() - 40 * 86400000); d.setHours(12, 0, 0, 0); return d }
    /** @param {string} cat @param {number} minor @param {any} acc @param {Date} when */
    const txa = (cat, minor, acc, when) => new Transaction({ occurredAt: when, amount: Money.of(minor, 'USD', 2), category: cat, direction: 'expense', accountId: acc.id })
    await store.add(txa('groceries', 6500, checking, noon()))
    await store.add(txa('dining', 1500, checking, noon()))
    await store.add(txa('other', 9999, visa, noon()))
    await store.add(txa('groceries', 5000, checking, prior()))

    expect(store.accountSpend(checking, today).minor).toBe(8000)
    expect(store.accountSpend(visa, today).minor).toBe(9999)
  })

  it('returns a typed zero in the account currency when there are no transactions', () => {
    const store = createJournalStore(new InMemoryRepository(), 'UTC')
    const z = store.accountSpend(new Account({ name: 'Savings', currency: 'EUR' }), DayKey.from(new Date(), 'UTC'))
    expect(z.minor).toBe(0)
    expect(z.currency).toBe('EUR')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`
Expected: FAIL — `store.accountSpend is not a function` (and/or `Account` import missing — add it).

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/journal-store.js`, change line 1 to add `Money` and `periodWindowOf` as runtime imports:
```js
import { Journal, Transaction, Money, periodWindowOf } from '@oyl/all-of-oyl'
```
Remove the now-redundant `/** @typedef {import('@oyl/all-of-oyl').Money} Money */` line (line ~11) — the imported `Money` class serves as the type. Add an `Account` typedef next to the other typedefs:
```js
/** @typedef {import('@oyl/all-of-oyl').Account} Account */
```
Add this method immediately after `budgetStatus` (and its trailing comma):
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`
Expected: PASS (new + existing).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean. (If removing the Money typedef surfaces an unused/duplicate issue, ensure the runtime `Money` import is present and the typedef line is gone.)

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): journalStore.accountSpend (this-month total per account)"
```

---

### Task 4: `oyl-account-form.js` — inline add

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-account-form.js`
- Test: `apps/vanilla-oyl/src/components/oyl-account-form.test.js`

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/oyl-account-form.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository } from '@oyl/all-of-oyl'
import { createAccountsStore } from '../state/accounts-store.js'
import { defineAccountForm } from './oyl-account-form.js'

beforeAll(() => defineAccountForm())
const settle = () => new Promise((r) => setTimeout(r, 0))

/** @param {any} store */
function form(store) {
  const el = /** @type {any} */ (document.createElement('oyl-account-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))

describe('<oyl-account-form>', () => {
  it('adds an account with the typed name and selected currency', async () => {
    const store = createAccountsStore(new InMemoryRepository())
    const el = form(store)
    q(el, 'input[name="name"]').value = 'Visa'
    q(el, 'select[name="currency"]').value = 'EUR'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const accounts = store.all()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].name).toBe('Visa')
    expect(accounts[0].currency).toBe('EUR')
    el.remove()
  })

  it('shows an inline error and adds nothing for an empty name', async () => {
    const store = createAccountsStore(new InMemoryRepository())
    const el = form(store)
    q(el, 'input[name="name"]').value = '   '
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.all()).toHaveLength(0)
    expect(q(el, '[data-role="error"]').textContent).not.toBe('')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-account-form.test.js`
Expected: FAIL — cannot resolve `./oyl-account-form.js`.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/components/oyl-account-form.js`:
```js
import { Account } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylAccountForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {AccountsStore} */
    this.store = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const name = document.createElement('input')
    name.name = 'name'
    name.placeholder = 'Account name'
    name.setAttribute('aria-label', 'Account name')
    const currency = document.createElement('select')
    currency.name = 'currency'
    currency.setAttribute('aria-label', 'Currency')
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add account'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    formEl.append(name, currency, add, error)
    root.append(formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const account = new Account({ name: name.value.trim(), currency: currency.value })
        await this.store.add(account)
        name.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })
  }
}

/** Register the element (idempotent). */
export function defineAccountForm() {
  if (!customElements.get('oyl-account-form')) customElements.define('oyl-account-form', OylAccountForm)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-account-form.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-account-form.js apps/vanilla-oyl/src/components/oyl-account-form.test.js
git commit -m "feat(vanilla-oyl): oyl-account-form inline add"
```

---

### Task 5: `oyl-finance.js` — Accounts section + `accounts` prop

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance.test.js`

- [ ] **Step 1: Write the failing tests**

In `apps/vanilla-oyl/src/components/oyl-finance.test.js`:

(a) Extend the top imports:
```js
import { InMemoryRepository, Transaction, Budget, Money, Account } from '@oyl/all-of-oyl'
import { createAccountsStore } from '../state/accounts-store.js'
```
(b) Replace the `screen()` helper to also default an accounts store:
```js
/** @param {any} store @param {any} [budgets] @param {any} [accounts] */
function screen(store, budgets = createBudgetsStore(new InMemoryRepository()), accounts = createAccountsStore(new InMemoryRepository())) {
  const el = /** @type {import('./oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
  el.store = store
  el.budgets = budgets
  el.accounts = accounts
  el.tz = TZ
  document.body.append(el)
  return el
}
```
(c) Add a new `describe` block at the end of the file:
```js
describe('<oyl-finance> accounts', () => {
  it('renders an account with its this-month spend, and deletes it', async () => {
    const accounts = createAccountsStore(new InMemoryRepository())
    const acc = await accounts.add(new Account({ name: 'Checking', currency: 'USD' }))
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense', accountId: acc.id }))
    const el = screen(store, undefined, accounts)
    await Promise.resolve()

    const item = /** @type {any} */ ([...root(el).querySelectorAll('oyl-vault-item')].find((i) => i.label === 'Checking'))
    expect(item).toBeTruthy()
    expect(item.lines.join(' ')).toContain('$65.00')
    expect(item.lines.join(' ')).toContain('this month')

    /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="delete"]')).click()
    /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="confirm-yes"]')).click()
    await settle()
    expect([...root(el).querySelectorAll('oyl-vault-item')].some((i) => i.label === 'Checking')).toBe(false)
    el.remove()
  })

  it('adds an account via the inline form', async () => {
    const accounts = createAccountsStore(new InMemoryRepository())
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store, undefined, accounts)
    await Promise.resolve()
    const fr = /** @type {any} */ (root(el).querySelector('oyl-account-form')).shadowRoot
    /** @type {HTMLInputElement} */ (fr.querySelector('input[name="name"]')).value = 'Visa'
    /** @type {HTMLFormElement} */ (fr.querySelector('form')).dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect([...root(el).querySelectorAll('oyl-vault-item')].some((i) => i.label === 'Visa')).toBe(true)
    el.remove()
  })

  it('shows the empty state when there are no accounts', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store)
    await Promise.resolve()
    expect(root(el).textContent).toContain('No accounts yet.')
    el.remove()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: the 3 new accounts tests FAIL (the screen has no Accounts section — `el.accounts` is set by the helper but the component ignores it, so no `oyl-vault-item` for an account, no "No accounts yet."). The existing ledger/budget tests still PASS. If an existing test fails, STOP and report.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-finance.js`:

(a) Add imports after the budget-row import (line 9):
```js
import { defineAccountForm } from './oyl-account-form.js'
import { accountSpendLabel } from '../account/format.js'
```
(b) Add the AccountsStore typedef after the BudgetsStore typedef (line 12):
```js
/** @typedef {ReturnType<typeof import('../state/accounts-store.js').createAccountsStore>} AccountsStore */
```
(c) Add the `accounts` prop in the constructor after `this.budgets` (line 35):
```js
    /** @type {AccountsStore} */
    this.accounts = /** @type {AccountsStore} */ (/** @type {unknown} */ (undefined))
```
(d) Call `defineAccountForm()` in `render()` after `defineBudgetRow()` (line 42):
```js
    defineAccountForm()
```
(e) Build the Accounts section nodes after the budget nodes (after line 69, before the `root.append(...)`):
```js
    const accountLabelEl = document.createElement('div')
    accountLabelEl.className = 'section-label'
    accountLabelEl.textContent = 'Accounts'
    const accountForm = /** @type {import('./oyl-account-form.js').OylAccountForm} */ (document.createElement('oyl-account-form'))
    accountForm.store = this.accounts
    accountForm.onAdded = () => { live.textContent = 'Account added' }
    const accountList = document.createElement('ol')
    const accountEmpty = document.createElement('div')
    accountEmpty.className = 'empty'
```
(f) Extend the `root.append(...)` (line 71) to include the new nodes:
```js
    root.append(h2, live, composer, label, list, empty, budgetLabelEl, budgetForm, budgetList, budgetEmpty, accountLabelEl, accountForm, accountList, accountEmpty)
```
(g) Add the accounts loop at the END of the `track()` callback (after the `budgetEmpty.textContent = ...` line, line 102):
```js
      const accounts = this.accounts.all()
      accountList.replaceChildren()
      for (const a of accounts) {
        const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
        item.label = a.name
        item.lines = [`${a.currency} · ${accountSpendLabel(this.store.accountSpend(a, today))}`]
        item.onDelete = () => { void this.accounts.remove(a.id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(item)
        accountList.append(li)
      }
      accountEmpty.hidden = accounts.length > 0
      accountEmpty.textContent = accounts.length > 0 ? '' : 'No accounts yet.'
```
Also add a style rule for the form near the `oyl-budget-form` rule (line 18) in the `styles` sheet:
```css
  oyl-account-form { display: block; margin: .4rem 0 .8rem; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: PASS (existing ledger/budget tests + 3 new accounts tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): Accounts section on #/finance (per-account this-month spend)"
```

---

### Task 6: Wiring — `data.js` + `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js`
- Modify: `apps/vanilla-oyl/src/main.js:122-128`
- Test: `apps/vanilla-oyl/src/state/data.test.js`

- [ ] **Step 1: Write the failing test**

Append to `apps/vanilla-oyl/src/state/data.test.js` (inside the existing `describe('data state', ...)` block, alongside the "exposes a budgets store" test):
```js
  it('exposes an accounts store hydrated by refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await ds.repos.accounts.save(new Account({ name: 'Checking', currency: 'USD' }))
    await ds.refresh()
    expect(ds.accounts.all().map((a) => a.name)).toContain('Checking')
  })
```
Add `Account` to the test's `@oyl/all-of-oyl` import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`
Expected: FAIL — `ds.accounts` is undefined.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/data.js`:
(a) Add the import after the budgets-store import (line 9):
```js
import { createAccountsStore } from './accounts-store.js'
```
(b) Construct the store after `const budgets = ...` (line 28):
```js
  const accounts = createAccountsStore(repos.accounts)
```
(c) In `refresh()`, add a hydrate alongside the other store hydrates (next to `await budgets.hydrate()`):
```js
    await accounts.hydrate()
```
(d) Add `accounts` to the returned object (line 87):
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn, budgets, renewSubscription, accounts }
```

In `apps/vanilla-oyl/src/main.js`, in the `finance:` route, after `view.budgets = dataState.budgets` (line 125):
```js
      view.accounts = dataState.accounts
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`
Expected: PASS.

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire accounts store into data state + finance route"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller, after all tasks): `pnpm vanilla build:lib`, http-server on 8041, seed demo data, hard-reload. On `#/finance`: Accounts section (bottom) shows **Checking** / "USD · $0.00 this month". On `#/vault` renew **Netflix** → back on `#/finance`, Checking reads "USD · $15.99 this month" (live). Add an account via the form → appears "$0.00 this month"; delete via the inline confirm; with none → "No accounts yet."
