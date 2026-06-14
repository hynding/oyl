# vanilla-oyl Finance Slice 1 (Transactions ledger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `#/finance` screen to record **expenses** and see this month's ledger. A `Transaction` is a journal `Entry`, so this reuses the journal store and feeds Insights/budgets for free.

**Architecture:** `journalStore.transactionsIn(range)` (reactive passthrough) lists transactions; `<oyl-finance>` renders a month ledger (reusing `oyl-vault-item`) + an expense composer (`journalStore.add(new Transaction(...))`). Transactions are filtered out of the #/journal day view (they belong on #/finance). No new store; no `data.js` change.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Transaction`/`Money`/`DayKey`/`DayRange`/`periodWindowOf`).

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-finance-transactions-design.md` (decisions R-A–R-H).

---

## Conventions

- `.js` + JSDoc strict + checkJs. **No `innerHTML`**. STATIC imports. `@oyl/all-of-oyl` → TS source (no build for tests/typecheck).
- Reuse `oyl-vault-item` for ledger rows; `formatMoney` (currency-aware) from `vault/format.js`. Bar/style round-trip not needed here.
- **Assert child content via the child's `shadowRoot`/props** (e.g. `oyl-vault-item.label`), never the parent's `textContent`. Screen tests use the **real** `createJournalStore` so `transactionsIn` is reactive; a `settle = () => new Promise(r => setTimeout(r, 0))` flushes async delete→repaint.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `components/oyl-finance-composer.js`, `components/oyl-finance.js` (+ tests).
**Modified:** `state/journal-store.js`, `components/oyl-journal.js`, `components/oyl-nav.js`, `main.js` (+ extend journal-store/oyl-journal tests).

---

## Task 1: `journalStore.transactionsIn(range)`

**Files:** Modify `apps/vanilla-oyl/src/state/journal-store.js`; test `apps/vanilla-oyl/src/state/journal-store.test.js`.

- [ ] **Step 1: Add the failing test.** In `journal-store.test.js`, change the import to add `Transaction`, `Money`, `DayRange`:
```js
import { InMemoryRepository, Note, Measurement, Goal, Transaction, Money, DayKey, DayRange } from '@oyl/all-of-oyl'
```
Append inside `describe('createJournalStore', …)`:
```js
  it('transactionsIn returns only transactions whose day is in range', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    await store.add(new Note({ occurredAt: new Date(ISO), text: 'a note' }))
    await store.add(new Transaction({ occurredAt: new Date(ISO), amount: Money.of(6500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const range = DayRange.of(dayOf(), dayOf())
    const txs = store.transactionsIn(range)
    expect(txs).toHaveLength(1)
    expect(txs[0]?.category).toBe('groceries')
  })
```

- [ ] **Step 2: Run → FAIL** (`store.transactionsIn is not a function`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js`

- [ ] **Step 3: Implement** in `apps/vanilla-oyl/src/state/journal-store.js`.
Change the import line to add `Transaction`:
```js
import { Journal, Transaction } from '@oyl/all-of-oyl'
```
Add a typedef near the others:
```js
/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
```
Add this method to the returned object, right after the `peek()` method's closing `},`:
```js
    /** Transactions whose day falls in `range`, for the finance ledger (auto-tracks revision). @param {DayRange} range @returns {readonly Transaction[]} */
    transactionsIn(range) {
      revision.get()
      return /** @type {Transaction[]} */ (journal.entriesIn(range).filter((e) => e instanceof Transaction))
    },
```

- [ ] **Step 4: Run → PASS** (existing + 1 new).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): journalStore.transactionsIn (finance ledger query)"
```

---

## Task 2: filter transactions out of the #/journal day view (R-G)

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-journal.js`; test `apps/vanilla-oyl/src/components/oyl-journal.test.js`.

- [ ] **Step 1: Add the failing test.** In `oyl-journal.test.js`, change the import to add `Transaction`, `Money`:
```js
import { InMemoryRepository, Note, Transaction, Money } from '@oyl/all-of-oyl'
```
Append inside `describe('<oyl-journal>', …)`:
```js
  it('does not render transactions in the day view (they live on #/finance)', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Note({ occurredAt: new Date(), text: 'a note' }))
    await store.add(new Transaction({ occurredAt: new Date(), amount: Money.of(500, 'USD', 2), category: 'groceries', direction: 'expense' }))
    const el = screen(store)
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)        // only the note
    expect(txt(el)).toContain('a note')
    el.remove()
  })
```

- [ ] **Step 2: Run → FAIL** (the transaction renders as a bare entry row → 2 rows): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-journal.test.js`

- [ ] **Step 3: Implement.** In `apps/vanilla-oyl/src/components/oyl-journal.js`, change the entries line (currently `const entries = [...this.store.entriesOn(day)].sort(...)`) to filter out transactions before sorting:
```js
      const entries = [...this.store.entriesOn(day)].filter((e) => e.kind !== 'transaction').sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
```

- [ ] **Step 4: Run → PASS** (existing journal tests + 1 new).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-journal.js apps/vanilla-oyl/src/components/oyl-journal.test.js
git commit -m "feat(vanilla-oyl): exclude transactions from the journal day view (they live on #/finance)"
```

---

## Task 3: `components/oyl-finance-composer.js` — expense composer

**Files:** Create `apps/vanilla-oyl/src/components/oyl-finance-composer.js`; test `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`. Models on `oyl-vault-composer` (`.field`/`.price`/`[data-role="error"]`/`button.primary` + `_input`/`_labeled` helpers).

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-finance-composer.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { Transaction } from '@oyl/all-of-oyl'
import { defineFinanceComposer } from './oyl-finance-composer.js'

beforeAll(() => defineFinanceComposer())
/** @param {{ add?: (e: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-finance-composer>', () => {
  it('adds an expense transaction with amount, category, date, note', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } })
    q(el, 'input[name="amount"]').value = '65'
    q(el, 'select[name="currency"]').value = 'USD'
    q(el, 'select[name="category"]').value = 'groceries'
    q(el, 'input[name="date"]').value = '2026-06-10'
    q(el, 'input[name="note"]').value = 'market'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Transaction)
    expect(added[0].direction).toBe('expense')
    expect(added[0].amount.minor).toBe(6500)
    expect(added[0].category).toBe('groceries')
    expect(added[0].note).toBe('market')
    // R-B: occurredAt lands on the chosen LOCAL calendar day
    expect(added[0].occurredAt.getFullYear()).toBe(2026)
    expect(added[0].occurredAt.getMonth()).toBe(5)
    expect(added[0].occurredAt.getDate()).toBe(10)
    el.remove()
  })

  it('rejects a non-positive amount with an inline error (R-C)', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ add: async (e) => { added.push(e); return e } })
    q(el, 'input[name="amount"]').value = '0'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-finance-composer.js`:
```js
import { Transaction, Money } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']
const CATEGORIES = ['groceries', 'dining', 'transport', 'utilities', 'entertainment', 'other']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .price { display: grid; grid-template-columns: 1fr auto; gap: .5rem; }
  .price select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylFinanceComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const amount = this._input('amount', 'number')
    amount.min = '0'
    amount.step = 'any'
    const currency = document.createElement('select')
    currency.name = 'currency'
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const priceWrap = document.createElement('div')
    priceWrap.className = 'price'
    priceWrap.append(amount, currency)

    const category = document.createElement('select')
    category.name = 'category'
    for (const c of CATEGORIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      category.append(o)
    }

    const date = this._input('date', 'date')
    date.value = now().toISOString().slice(0, 10)
    const note = this._input('note', 'text')

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add expense'
    actions.append(submit)

    formEl.append(
      this._labeled('amount', 'Amount', priceWrap),
      this._labeled('category', 'Category', category),
      this._labeled('date', 'Date', date),
      this._labeled('note', 'Note (optional)', note),
      error, actions,
    )
    root.append(formEl)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, amount, currency, category, date, note })
    }, { signal: this.lifecycle })
  }

  /** @param {{ error: HTMLElement, amount: HTMLInputElement, currency: HTMLSelectElement, category: HTMLSelectElement, date: HTMLInputElement, note: HTMLInputElement }} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    if (!ctx.date.value) { ctx.error.textContent = 'Pick a date'; return }
    const amt = Number(ctx.amount.value)
    if (!(amt > 0)) { ctx.error.textContent = 'Amount must be positive'; return }
    try {
      const props = /** @type {{ occurredAt: Date, amount: Money, category: string, direction: 'expense', note?: string }} */ ({
        occurredAt: new Date(`${ctx.date.value}T12:00:00`),
        amount: Money.fromMajor(amt, ctx.currency.value),
        category: ctx.category.value,
        direction: 'expense',
      })
      if (ctx.note.value) props.note = ctx.note.value
      await this.store.add(new Transaction(props))
      ctx.amount.value = ''
      ctx.note.value = ''
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {string} name @param {string} type @returns {HTMLInputElement} */
  _input(name, type) {
    const i = document.createElement('input')
    i.name = name
    i.type = type
    return i
  }

  /** @param {string} forName @param {string} text @param {HTMLElement} control @returns {HTMLElement} */
  _labeled(forName, text, control) {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const label = document.createElement('label')
    label.textContent = text
    label.htmlFor = forName
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineFinanceComposer() {
  if (!customElements.get('oyl-finance-composer')) customElements.define('oyl-finance-composer', OylFinanceComposer)
}
```

- [ ] **Step 4: Run → PASS** (2 tests). The `amount=0` test relies on the R-C guard (`new Transaction` would NOT throw, so the guard must reject before `store.add`).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-finance-composer.js apps/vanilla-oyl/src/components/oyl-finance-composer.test.js
git commit -m "feat(vanilla-oyl): oyl-finance-composer (expense: amount/category/date/note, amount>0 + local-noon)"
```

---

## Task 4: `components/oyl-finance.js` — the screen

**Files:** Create `apps/vanilla-oyl/src/components/oyl-finance.js`; test `apps/vanilla-oyl/src/components/oyl-finance.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-finance.test.js` (real journal store; both seeded transactions are anchored to **today** at different hours so they're always in the current month regardless of run date):
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Transaction, Money } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { defineFinance } from './oyl-finance.js'

beforeAll(() => defineFinance())
const TZ = 'UTC'
const settle = () => new Promise((r) => setTimeout(r, 0))
/** @param {number} h @returns {Date} */
const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d }
/** @param {string} cat @param {number} minor @param {Date} when @returns {any} */
const tx = (cat, minor, when) => new Transaction({ occurredAt: when, amount: Money.of(minor, 'USD', 2), category: cat, direction: 'expense' })

/** @param {any} store */
function screen(store) {
  const el = /** @type {import('./oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
  el.store = store
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-finance>', () => {
  it("lists this month's transactions newest-first", async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6500, at(9)))
    await store.add(tx('dining', 3000, at(13)))
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    expect(items).toHaveLength(2)
    expect(items[0].label).toContain('dining')   // newest first
    expect(items[0].label).toContain('$30.00')
    expect(items[1].label).toContain('groceries')
    el.remove()
  })

  it('empty store shows the empty state', async () => {
    const el = screen(createJournalStore(new InMemoryRepository(), TZ))
    await Promise.resolve()
    expect(root(el).textContent).toContain('No transactions this month.')
    el.remove()
  })

  it('deleting a transaction removes it', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(tx('groceries', 6500, at(10)))
    const el = screen(store)
    await Promise.resolve()
    const item = /** @type {any} */ (root(el).querySelector('oyl-vault-item'))
    const del = /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="delete"]'))
    del.click()
    const yes = /** @type {HTMLButtonElement} */ (item.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await settle()
    expect(root(el).querySelectorAll('oyl-vault-item')).toHaveLength(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-finance.js`:
```js
import { DayKey, periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { formatMoney } from '../vault/format.js'
import { defineFinanceComposer } from './oyl-finance-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  oyl-finance-composer { display: block; margin-block-end: 1.6rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .2rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylFinance extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
  }

  render() {
    defineFinanceComposer()
    defineVaultItem()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const h2 = document.createElement('h2')
    h2.textContent = 'Finance'
    h2.tabIndex = -1
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    const composer = /** @type {import('./oyl-finance-composer.js').OylFinanceComposer} */ (document.createElement('oyl-finance-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Expense added' }
    const label = document.createElement('div')
    label.className = 'section-label'
    label.textContent = 'This month'
    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(h2, live, composer, label, list, empty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf('month', today)
      const txs = [...this.store.transactionsIn(range)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const tx of txs) {
        const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
        item.label = `${tx.category} · ${formatMoney(tx.amount)}`
        item.lines = [DayKey.from(tx.occurredAt, this.tz).value, tx.note]
        item.onDelete = () => { void this.store.remove(tx.id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(item)
        list.append(li)
      }
      empty.hidden = txs.length > 0
      empty.textContent = empty.hidden ? '' : 'No transactions this month.'
    })
  }
}

/** Register the element (idempotent). */
export function defineFinance() {
  if (!customElements.get('oyl-finance')) customElements.define('oyl-finance', OylFinance)
}
```

- [ ] **Step 4: Run → PASS** (3 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-finance.js apps/vanilla-oyl/src/components/oyl-finance.test.js
git commit -m "feat(vanilla-oyl): oyl-finance screen (this-month ledger via oyl-vault-item)"
```

---

## Task 5: Wire-up — nav item + route

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-nav.js`, `apps/vanilla-oyl/src/main.js`.

- [ ] **Step 1: Nav.** In `apps/vanilla-oyl/src/components/oyl-nav.js`, add to `ITEMS` after the `['insights', 'Insights']` entry:
```js
  ['finance', 'Finance'],
```

- [ ] **Step 2: `main.js`.**
1. Import after `import { defineInsights } from './components/oyl-insights.js'`:
```js
import { defineFinance } from './components/oyl-finance.js'
```
2. In the `defineX()` block after `defineInsights()`:
```js
  defineFinance()
```
3. In `router.routes`, after the `insights:` entry:
```js
    finance: () => {
      const view = /** @type {import('./components/oyl-finance.js').OylFinance} */ (document.createElement('oyl-finance'))
      view.store = dataState.journal
      view.tz = defaultTimezone()
      return view
    },
```

- [ ] **Step 3: Full suite + typecheck.**
Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run` — expect all green (186 prior + ~8 new ≈ 194). Report the total.
Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` — clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire Finance — nav item + #/finance route"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload**), open `#/finance`, Load demo data:
  - This month's seeded transactions list newest-first (e.g. "groceries · $65.00" with the date in the sub-line); add an expense (amount + category + date + note) → it appears at the top; delete one via the inline confirm; `$0`/empty-date is rejected.
  - **#/journal** no longer shows transactions as bare "Entry" rows (only notes/measurements).
  - **#/insights** Top spending / Spending total for the month reflects a newly added expense (transactions are journal entries).
- [ ] **Final code review** of the branch, then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** `transactionsIn` (T1, R-F); journal day-view filter (T2, R-G); expense composer with amount>0 + date guards + local-noon occurredAt + preset slug category (T3, R-A/R-B/R-C/R-H); month ledger reusing `oyl-vault-item` + `formatMoney`, newest-first (T4, R-D/R-E); nav + route (T5).
- **Type consistency:** `journalStore.transactionsIn(range) → readonly Transaction[]`; composer builds `Transaction` with `direction: 'expense'` (typed literal); screen reads `tx.category`/`.amount`/`.occurredAt`/`.note`/`.id`. `formatMoney(Money)` from vault/format.
- **Test robustness:** screen test anchors both transactions to **today** (`at(h)`) so they're always in the current month regardless of run date (avoids a month-boundary flake); asserts via `oyl-vault-item.label`; uses the real journal store + `settle()` for the delete path; composer test checks `occurredAt` via local `getDate()/getMonth()/getFullYear()` (proves R-B).
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
