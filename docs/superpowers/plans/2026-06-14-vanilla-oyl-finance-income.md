# Vanilla-OYL Finance Slice A (income / direction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user record income (not just expenses) and see it distinctly in the ledger, with income cleanly excluded from budgets/Insights/spend (the domain routes `direction: 'income'` to `finance.income.<cat>`).

**Architecture:** Two files. The composer gains a `_direction` signal + a segmented Expense|Income toggle (the `.seg`/`_segButton` pattern), a direction-driven category set (rebuilt in the existing `track()`), and passes `direction` to `_submit`. The ledger row prefixes income amounts with `+`. No budgets/insights/store/data/main changes.

**Tech Stack:** Vanilla JS + JSDoc, Web Components (signals + shadow DOM), `@oyl/all-of-oyl` `Transaction`, Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-income-design.md`

**Branch:** `feat/vanilla-oyl-finance-income` (off `master` HEAD). Baseline: `pnpm vanilla test` green (235 tests).

---

## File structure

- **Modify** `apps/vanilla-oyl/src/components/oyl-finance-composer.js` — direction signal, seg toggle, income categories, submit direction, `onAdded(dir)` (T1).
- **Modify** `apps/vanilla-oyl/src/components/oyl-finance.js` — ledger income `+` sign + `onAdded(dir)` announce (T2).
- **Tests:** extend `oyl-finance-composer.test.js` (T1), `oyl-finance.test.js` (T2).

---

### Task 1: Composer income / direction

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance-composer.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `oyl-finance-composer.test.js` (helpers `composer(store, accounts)`, `q`, `submit` already exist), inside the main `describe('<oyl-finance-composer>', ...)`:
```js
  it('defaults to Expense with expense categories', async () => {
    const el = composer({ add: async (e) => e })
    await Promise.resolve()
    const cats = [...q(el, 'select[name="category"]').options].map((o) => o.value)
    expect(cats).toContain('groceries')
    expect(q(el, '.seg button[data-value="expense"]').getAttribute('aria-pressed')).toBe('true')
    el.remove()
  })

  it('switches to income categories when Income is selected', async () => {
    const el = composer({ add: async (e) => e })
    await Promise.resolve()
    q(el, '.seg button[data-value="income"]').click()
    await Promise.resolve()
    const cats = [...q(el, 'select[name="category"]').options].map((o) => o.value)
    expect(cats).toContain('salary')
    expect(cats).not.toContain('groceries')
    expect(q(el, '.seg button[data-value="income"]').getAttribute('aria-pressed')).toBe('true')
    el.remove()
  })

  it('posts an income transaction with the income direction', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } })
    await Promise.resolve()
    q(el, '.seg button[data-value="income"]').click()
    await Promise.resolve()
    q(el, 'input[name="amount"]').value = '2000'
    q(el, 'select[name="category"]').value = 'salary'
    q(el, 'input[name="date"]').value = '2026-06-10'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0].direction).toBe('income')
    expect(added[0].category).toBe('salary')
    el.remove()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: the 3 new tests FAIL (no `.seg` element / no income categories). Existing tests still pass. If an existing test fails, STOP and report.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-finance-composer.js`:

(a) Add the signal import after line 4:
```js
import { signal } from '../lib/reactive/signal.js'
```
(b) Replace the `CATEGORIES` constant (line 10) with both sets:
```js
const EXPENSE_CATEGORIES = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']
const INCOME_CATEGORIES = ['salary', 'freelance', 'gift', 'refund', 'other']
```
(c) Add the `.seg` rules to the `styles` sheet (after the `button.primary` rule, line 20):
```css
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
```
(d) Widen the `onAdded` typedef in the constructor (lines 31-32) to:
```js
    /** @type {(direction?: 'expense' | 'income') => void} */
    this.onAdded = () => {}
```
(e) Add the direction signal in the constructor (after the `this.accounts` assignment, line 34):
```js
    this._direction = signal('expense')
```
(f) In `render()`, build the segmented toggle near the top (after `const formEl = document.createElement('form')`, line 39):
```js
    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Direction')
    const expenseBtn = this._segButton('expense', 'Expense')
    const incomeBtn = this._segButton('income', 'Income')
    seg.append(expenseBtn, incomeBtn)
```
(g) Change the category select's initial population (line 60) to use `EXPENSE_CATEGORIES` (the loop stays; just the constant name): `for (const c of EXPENSE_CATEGORIES) {`.
(h) Prepend `seg` to the `formEl.append(...)` (line 88) as the first child:
```js
    formEl.append(
      seg,
      this._labeled('amount', 'Amount', priceWrap),
      this._labeled('account', 'Account', account),
      this._labeled('category', 'Category', category),
      this._labeled('date', 'Date', date),
      this._labeled('note', 'Note (optional)', note),
      error, actions,
    )
```
(i) Extend the existing `track()` (after the `syncCurrencyVisibility()` line inside it, line 118) with the direction block:
```js
      const dir = this._direction.get()
      const cats = dir === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
      const prevCat = category.value
      category.replaceChildren()
      for (const c of cats) {
        const o = document.createElement('option')
        o.value = c
        o.textContent = c
        category.append(o)
      }
      category.value = cats.includes(prevCat) ? prevCat : cats[0]
      expenseBtn.setAttribute('aria-pressed', String(dir === 'expense'))
      incomeBtn.setAttribute('aria-pressed', String(dir === 'income'))
      submit.textContent = dir === 'income' ? 'Add income' : 'Add expense'
```
(j) In `_submit`, change `direction: 'expense'` (line 136) to `direction: this._direction.get()`, widen the props typedef's `direction` from `'expense'` to `'expense' | 'income'` (line 132), and change `this.onAdded()` (line 143) to `this.onAdded(this._direction.get())`.
(k) Add the `_segButton` method (after `_submit`, before `_input`):
```js
  /** @param {'expense' | 'income'} value @param {string} label @returns {HTMLButtonElement} */
  _segButton(value, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.value = value
    b.textContent = label
    b.addEventListener('click', () => this._direction.set(value), { signal: this.lifecycle })
    return b
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js`
Expected: PASS (3 new + all existing, including the original "adds an expense transaction" test).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean. (The `_direction` signal is `signal('expense')` — its `.get()` returns the string; the props `direction` typedef is widened to accept it. If tsc complains the signal's type is `string` not the union, annotate the signal: `this._direction = /** @type {import('../lib/reactive/signal.js').Signal<'expense' | 'income'>} */ (signal('expense'))`.) Fix NEW errors; report pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance-composer.js apps/vanilla-oyl/src/components/oyl-finance-composer.test.js
git commit -m "feat(vanilla-oyl): income/direction toggle in the finance composer"
```

---

### Task 2: Ledger income sign + announce

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance.js`
- Test: `apps/vanilla-oyl/src/components/oyl-finance.test.js`

- [ ] **Step 1: Write the failing test**

Add to `oyl-finance.test.js` (`Transaction`, `Money`, `createJournalStore`, `InMemoryRepository`, `at`, `root`, `screen` already imported/defined):
```js
  it('shows a + sign on income ledger rows, not on expenses', async () => {
    const store = createJournalStore(/** @type {any} */ (new InMemoryRepository()), TZ)
    await store.add(new Transaction({ occurredAt: at(9), amount: Money.of(200000, 'USD', 2), category: 'salary', direction: 'income' }))
    await store.add(new Transaction({ occurredAt: at(10), amount: Money.of(3000, 'USD', 2), category: 'dining', direction: 'expense' }))
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const salary = items.find((i) => i.label.includes('salary'))
    const dining = items.find((i) => i.label.includes('dining'))
    expect(salary.label).toContain('+')
    expect(dining.label).not.toContain('+')
    el.remove()
  })
```
(Add it to whichever `describe` block holds the existing ledger tests, e.g. the main `describe('<oyl-finance>', ...)`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance.test.js`
Expected: FAIL — the salary row's label has no `+`.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/oyl-finance.js`:

(a) In the ledger loop, change:
```js
        item.label = `${tx.category} · ${formatMoney(tx.amount)}`
```
to:
```js
        const sign = tx.direction === 'income' ? '+' : ''
        item.label = `${tx.category} · ${sign}${formatMoney(tx.amount)}`
```
(b) Change the composer's `onAdded` handler from:
```js
    composer.onAdded = () => { live.textContent = 'Expense added' }
```
to:
```js
    composer.onAdded = (dir) => { live.textContent = dir === 'income' ? 'Income added' : 'Expense added' }
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
git commit -m "feat(vanilla-oyl): ledger shows income with a + sign + direction-aware announce"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome acceptance (controller, after both tasks): `pnpm vanilla build:lib`, http-server on 8041, seed, hard-reload. On `#/finance`: the composer shows an **Expense | Income** toggle (Expense active, "Add expense"). Switch to **Income** → categories become `salary/freelance/…`, button reads "Add income"; record `salary` `2000` → ledger shows "salary · +$2000.00", and the Budgets section + each account's "this month" spend are unchanged (income excluded). Switch back to **Expense** and confirm a normal expense still records + counts.
