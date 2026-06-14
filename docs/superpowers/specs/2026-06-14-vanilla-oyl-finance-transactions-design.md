# Vanilla-OYL Finance Screen — Slice 1 (Transactions ledger) — Design

**Status:** approved (expenses-only; recommendations R-A–R-F baked in)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** First sub-project of the **Finance** area (the last domain area). Decomposition: **Slice 1 = transactions ledger** (this); Slice 2 = budgets; Slice 3 = accounts + the subscription→transaction seam. Builds on all six existing screens.

---

## What this is

A `#/finance` screen for recording **expenses** and seeing this month's ledger. A `Transaction` *is* a journal `Entry` (revived via `reviveEntry`), so recording one is `journalStore.add(new Transaction(...))` — and it **automatically** flows into Insights spending (`finance.spend.<category>`) and budgets (Slice 2). No new store.

### Decisions (settled — R-A–R-F)

1. **(R-A) Expenses only.** Income transactions surface nowhere yet (`review().totals.spending`/`topSpending` read `finance.spend` only), so an expense/income segment + income categories add UI for ~zero v1 value. Slice 1 records expenses (`direction: 'expense'` always); income + direction are a later enhancement. Fully compatible with the later subscription→transaction seam (posts expenses).
2. **(R-B) `occurredAt` at local noon.** A date input gives `YYYY-MM-DD`; `new Date('2026-06-01')` is UTC midnight → in a negative-offset tz that's *the previous day/month*, mis-attributing budgets/insights at boundaries. Build `new Date(`${dateValue}T12:00:00`)` (local noon) so `dayOf(tz)` resolves to the chosen calendar day for any offset.
3. **(R-C) Composer guards `amount > 0`.** `Transaction`'s constructor does NOT validate the amount (unlike `Subscription`/`Budget`), so the composer must reject `≤ 0` itself with an inline error.
4. **(R-D) Reuse `oyl-vault-item` for ledger rows; amounts via `formatMoney`.** Each row is label + lines + inline-confirm delete = `oyl-vault-item` (label `category · formatMoney(amount)`, lines `[date, note]`). Amounts use the **currency-aware** `formatMoney` from `vault/format.js` (Money → "$65.00"/"€10.00"), not the $-only `money()` in `insights/format.js`.
5. **(R-E) Ledger newest-first** by `occurredAt` (`entriesIn` order is unspecified).
6. **(R-F) `journalStore.transactionsIn(range)` passthrough** (reactive; `entriesIn(range)` filtered to `instanceof Transaction`) — keeps the `peek()` exposure data-layer-only (Insights R1) instead of the screen reaching into the aggregate.
7. **Dedicated `#/finance` screen** (not folded into Journal) + **preset slug category select** (matching the subscription-category decision).
8. **(R-G) Filter transactions out of the #/journal day view.** A `Transaction` is an `Entry`, so it lands in `journalStore.entriesOn(day)` and would render via `oyl-entry-row` as a bare "**Entry**" row (no amount/category — the `else` fallback) *and* duplicate the #/finance ledger. Journal = notes + measurements; finance owns transactions. Filter `kind === 'transaction'` from the journal day list (this slice owns the cleanup, since it makes transactions a first-class action; the seed already exposes the oddity).
9. **(R-H) Composer guards a non-empty date too** — the date is defaulted but a date input can be cleared, and `new Date('T12:00:00')` is `Invalid Date`.

### Out of scope (later slices)

- Income + the expense/income direction segment; refunds (negative amounts).
- Budgets (Slice 2); accounts + account picker + subscription→transaction seam (Slice 3).
- A monthly total on the screen (Insights already shows monthly spending); period selector (v1 = this month).

---

## Domain API this consumes (verified)

- `new Transaction({ id?, occurredAt: Date, note?, amount: Money, category: string (slug), direction: 'expense'|'income', accountId? })`. `category` must be a slug (`assertSlug` throws otherwise). **No amount validation** (R-C). `extends Entry` → `.kind === 'transaction'`, `.note?`, `.occurredAt` (getter), `.amount`, `.category`.
- `metrics()` → `finance.spend.<category>` (major units) — feeds the journal aggregate, hence Insights/budgets.
- `Journal.entriesIn(range): readonly Entry[]`; the journal store wraps it.
- `@oyl/all-of-oyl` exports `Transaction`, `Money`, `DayKey`, `DayRange`, `periodWindowOf`. `reviveEntry` already handles `transaction`, so `repos.entries` round-trips transactions and `journalStore` hydrates them.

---

## Architecture

### 1. `src/state/journal-store.js` — `transactionsIn(range)`

Add to the returned object (import `Transaction` at the top):
```js
    /** Transactions whose day falls in `range`, for the finance ledger (auto-tracks revision). @param {DayRange} range @returns {readonly Transaction[]} */
    transactionsIn(range) {
      revision.get()
      return /** @type {Transaction[]} */ (journal.entriesIn(range).filter((e) => e instanceof Transaction))
    },
```
Add `/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */` and import `Transaction` (value, for `instanceof`).

### 2. `src/components/oyl-finance-composer.js` — `<oyl-finance-composer>`

Properties `store` (JournalStore — `.add`), `onAdded`. Reuses the composer CSS conventions (`.field`, `.price` for amount+currency, `[data-role="error"]`, `button.primary`). Fields:
- **Amount** (number, `min="0"`, `step="any"`) + a currency `<select>` (USD/EUR/GBP) → `Money.fromMajor(amount, currency)`.
- **Category** `<select name="category">` — preset slugs: `groceries`, `dining`, `transport`, `utilities`, `entertainment`, `other`.
- **Date** (`name="date"`, default today's ISO via `now().toISOString().slice(0,10)`).
- **Note** (text, optional).

`_submit`:
```js
if (!ctx.date.value) { ctx.error.textContent = 'Pick a date'; return }            // R-H
const amt = Number(ctx.amount.value)
if (!(amt > 0)) { ctx.error.textContent = 'Amount must be positive'; return }    // R-C
const props = /** @type {{ occurredAt: Date, amount: Money, category: string, direction: 'expense', note?: string }} */ ({
  occurredAt: new Date(`${ctx.date.value}T12:00:00`),                              // R-B local noon
  amount: Money.fromMajor(amt, ctx.currency.value),
  category: ctx.category.value,
  direction: 'expense',
})
if (ctx.note.value) props.note = ctx.note.value
await this.store.add(new Transaction(props))
ctx.amount.value = ''
ctx.note.value = ''                       // keep date/category/currency for rapid entry
this.onAdded()
```
Wrap in try/catch → inline error (covers a malformed slug etc., though the preset select is always valid). STATIC import `{ Transaction, Money }`. `defineFinanceComposer()` idempotent.

### 3. `src/components/oyl-finance.js` — `<oyl-finance>` (screen)

Properties: `store` (JournalStore), `tz`. Calls `defineFinanceComposer()` + `defineVaultItem()` in `render()`. Renders `<h2 tabindex="-1">Finance</h2>`, an `aria-live` region, the composer, a `Spending` `section-label`, a ledger `<ol>`, and an empty state. One `this.track()`:
```js
const today = DayKey.from(now(), this.tz)
const range = periodWindowOf('month', today)
const txs = [...this.store.transactionsIn(range)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())  // R-E
list.replaceChildren()
for (const tx of txs) {
  const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
  item.label = `${tx.category} · ${formatMoney(tx.amount)}`                          // R-D
  item.lines = [DayKey.from(tx.occurredAt, this.tz).value, tx.note]                  // falsy note filtered by the item
  item.onDelete = () => { void this.store.remove(tx.id); live.textContent = 'Deleted' }
  const li = document.createElement('li'); li.append(item); list.append(li)
}
empty.hidden = txs.length > 0
empty.textContent = empty.hidden ? '' : 'No transactions this month.'
```
Import `formatMoney` from `../vault/format.js`, `defineVaultItem` from `./oyl-vault-item.js`. `defineFinance()` idempotent.

### 4. `src/components/oyl-journal.js` — exclude transactions (R-G)

In the journal screen's `track()`, where it reads the day's entries, filter out transactions so they don't render as bare "Entry" rows (they live on #/finance):
```js
const entries = [...this.store.entriesOn(day)].filter((e) => e.kind !== 'transaction').sort(/* existing sort */)
```
(Keep the existing sort; just add the `.filter`. Notes/measurements are unaffected.)

### 5. Wiring

- `src/components/oyl-nav.js`: add `['finance', 'Finance']` to `ITEMS` (nav already wraps).
- `src/main.js`: `defineFinance()`; route `finance: () => { const v = document.createElement('oyl-finance'); v.store = dataState.journal; v.tz = defaultTimezone(); return v }`.
- No `data.js` change — transactions ride the existing journal store.

---

## Data flow

```
add expense (composer) → new Transaction({occurredAt: local-noon, amount, category, direction:'expense', note?})
  → journalStore.add(it)  (persist to entries repo + journal.add; revision bumps)
  → ledger repaints (transactionsIn(thisMonth)); Insights spending + budgets pick it up via finance.spend.<category>
delete → journalStore.remove(id) (soft-delete) → ledger repaints
```

## Error handling

- `amount ≤ 0` → inline "Amount must be positive" (R-C). The preset category is always a valid slug; a try/catch still wraps `_submit` and renders any thrown message inline.
- `journalStore.add` rejections propagate (consistent with other screens — the live region just doesn't announce on failure).

## Testing (Vitest + happy-dom)

- **`journal-store.test.js`** (extend): `transactionsIn(range)` returns only `Transaction`s in range — add a `Transaction` + a `Note`, assert `transactionsIn(monthRange)` has length 1 and it's the transaction; reflects a second add (reactive).
- **`oyl-finance-composer.test.js`** (new): submitting amount+currency+category+date builds a `Transaction` with `direction:'expense'`, `amount.minor`, `category`, and `occurredAt` on the chosen **local** day (`added.occurredAt.getDate()/getMonth()/getFullYear()` match the input — proves R-B local-noon); `amount = 0` (and empty) → inline error + no add (R-C); a typed note is set, omitted when blank.
- **`oyl-finance.test.js`** (new): with a **real** `createJournalStore` (so `transactionsIn` is reactive), seed two transactions on different days; the screen renders them **newest-first** as `oyl-vault-item`s (assert via each item's `.label` — shadow-DOM lesson), with the date+note in `.lines`; adding via the composer makes one appear; deleting removes it; empty store → "No transactions this month."
- **`oyl-journal.test.js`** (extend, R-G): adding a `Transaction` to the journal store does NOT render an entry row in the day view (it's filtered) — assert the transaction's identifying text/`oyl-entry-row` count is unaffected while a same-day `Note` still shows.

## File structure

```
apps/vanilla-oyl/src/
  state/journal-store.js          (modify: add transactionsIn)
  components/oyl-finance-composer.js (new)
  components/oyl-finance.js        (new)
  components/oyl-journal.js        (modify: filter out transactions — R-G)
  components/oyl-nav.js           (modify: Finance nav item)
  main.js                         (modify: defineFinance + #/finance route)
  + new tests (composer, screen); extend journal-store + oyl-journal tests
```

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/finance`:
- This month's seeded transactions list newest-first (e.g. "groceries · $65.00", with date + any note); add an expense (amount + category + date) → it appears at the top; delete one via the inline confirm.
- Cross-check: the new expense raises **Insights → Top spending / Spending total** for the month (transactions are journal entries).
- An out-of-month or `$0` amount is rejected; empty month → "No transactions this month."
