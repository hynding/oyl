# vanilla-oyl Vault Slice 2 (Subscriptions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Subscriptions to the existing Vault screen — a composer mode, a dedicated `<oyl-subscription-row>` with single-click Renew + inline-confirm Delete, and a per-currency monthly-cost total — without touching nav, routes, or `data.js`.

**Architecture:** `VaultStore` already hydrates subscriptions; this slice exposes `addSubscription`/`removeSubscription`/`subscriptions()`/`renew(id,on)` (planner-style stateful mutation, the returned `SubscriptionCharge` discarded — finance deferred) and `monthlySubscriptionTotals()`. The composer gains a third segment; the screen gains a Subscriptions section after Possessions. Renew advances the cursor only.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Subscription`/`Cadence`/`Money`/`DayKey`), the foundation's signals + Web Component base + Slice 1 vault patterns + the shared `inlineConfirm` helper.

**Spec:** `docs/superpowers/specs/2026-06-13-vanilla-oyl-vault-subscriptions-design.md`

---

## Conventions (carried from Slice 1 — apply throughout)

- `.js` + JSDoc strict + checkJs. **No `innerHTML`** — `createElement`/`textContent` (a security hook blocks `innerHTML`).
- Web Components extend `OylElement` (`this.track(fn)`, `this.lifecycle` AbortSignal, `static styles = [sheet(css)]`); idempotent `defineX()`.
- Externally-assigned fields use the double-cast default; fields with sane empty defaults get them directly.
- **STATIC** domain imports at module top (no dynamic `import()` in submit).
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Full: `pnpm --filter @oyl/vanilla-oyl exec vitest run`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- `@oyl/all-of-oyl` resolves to TS source — no build needed for tests/typecheck.
- ASI hazard: never write `(root.querySelector(...)).click()` bare — use a named local with a cast (`const b = /** @type {HTMLButtonElement} */ (root.querySelector(...)); b.click()`). Also satisfies strict null-checks.
- The shared `inlineConfirm({ mount, prompt, lifecycle, onYes, restore })` (in `components/confirm.js`) produces a `.confirm` group with `data-act="confirm-yes"` / `"confirm-no"`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `components/oyl-subscription-row.js` (+ test).
**Modified:** `vault/format.js`, `state/vault-store.js`, `components/oyl-vault-composer.js`, `components/oyl-vault.js` (+ extend their tests).
**Untouched:** `main.js`, `oyl-nav.js`, `state/data.js`, routing — the screen and store already exist and already hydrate subscriptions.

---

## Task 1: `vault/format.js` — `monthlyTotalLabel`

**Files:**
- Modify: `apps/vanilla-oyl/src/vault/format.js`
- Test: `apps/vanilla-oyl/src/vault/format.test.js`

- [ ] **Step 1: Add the failing tests**

In `apps/vanilla-oyl/src/vault/format.test.js`, update the import and append a `describe` block. Change the import line:
```js
import { dueInLabel, formatMoney, monthlyTotalLabel } from './format.js'
```
Append (after the existing `describe('formatMoney', …)` block):
```js
describe('monthlyTotalLabel', () => {
  it('returns empty string for no subscriptions', () => {
    expect(monthlyTotalLabel(new Map())).toBe('')
  })
  it('formats a single currency', () => {
    expect(monthlyTotalLabel(new Map([['USD', Money.of(1399, 'USD', 2)]]))).toBe('$13.99/mo')
  })
  it('sorts multiple currencies by code regardless of insertion order', () => {
    const totals = new Map([['USD', Money.of(1399, 'USD', 2)], ['GBP', Money.of(500, 'GBP', 2)]])
    expect(monthlyTotalLabel(totals)).toBe('£5.00 + $13.99/mo')
  })
})
```
(`Money` is already imported in this file.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: FAIL (`monthlyTotalLabel is not a function` / not exported).

- [ ] **Step 3: Implement**

Append to `apps/vanilla-oyl/src/vault/format.js` (after `formatMoney`):
```js
/**
 * "$13.99/mo" for one currency, "£5.00 + $13.99/mo" for several, "" when empty.
 * Sorted by currency code so output is deterministic (the source Map is insertion-ordered).
 * @param {ReadonlyMap<string, Money>} totals @returns {string}
 */
export function monthlyTotalLabel(totals) {
  const parts = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => formatMoney(m))
  return parts.length === 0 ? '' : `${parts.join(' + ')}/mo`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean)
```bash
git add apps/vanilla-oyl/src/vault/format.js apps/vanilla-oyl/src/vault/format.test.js
git commit -m "feat(vanilla-oyl): vault monthlyTotalLabel (deterministic per-currency monthly total)"
```

---

## Task 2: `state/vault-store.js` — subscription methods + renew + totals

**Files:**
- Modify: `apps/vanilla-oyl/src/state/vault-store.js`
- Test: `apps/vanilla-oyl/src/state/vault-store.test.js`

- [ ] **Step 1: Add the failing tests**

In `apps/vanilla-oyl/src/state/vault-store.test.js`, extend the import:
```js
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey, DayRange } from '@oyl/all-of-oyl'
```
Add a subscription helper near the top (after the existing `today`/`range` consts):
```js
/** @param {Record<string, unknown>} [opts] */
const sub = (opts = {}) => new Subscription({
  name: 'Netflix', amount: Money.of(1399, 'USD', 2), cadence: Cadence.of(1, 'months'),
  anchor: today, category: 'entertainment', ...opts,
})
```
Append inside `describe('createVaultStore', …)`:
```js
  it('addSubscription persists, reflects in subscriptions(), and in upcoming()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addSubscription(sub())
    expect(store.subscriptions()).toHaveLength(1)
    expect(await r.subscriptions.list()).toHaveLength(1)
    expect(store.upcoming(range).map((u) => u.label)).toContain('Netflix')
  })

  it('removeSubscription deletes from the repo and the aggregate', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addSubscription(sub())
    await store.removeSubscription(saved.id)
    expect(store.subscriptions()).toHaveLength(0)
    expect(await r.subscriptions.list()).toHaveLength(0)
  })

  it('renew advances the next due to the following occurrence', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addSubscription(sub())
    const before = saved.nextDueOn(today) // never renewed → pending = anchor (today)
    await store.renew(saved.id, today)
    const after = store.subscriptions()[0].nextDueOn(today)
    expect(after.compare(before)).toBeGreaterThan(0)
  })

  it('monthlySubscriptionTotals reflects added subscriptions', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addSubscription(sub()) // $13.99 monthly → $13.99/mo
    expect(store.monthlySubscriptionTotals().get('USD')?.minor).toBe(1399)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/vault-store.test.js`
Expected: FAIL (`store.addSubscription is not a function`).

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/vault-store.js`, add typedefs after the existing ones (near line 7):
```js
/** @typedef {import('@oyl/all-of-oyl').Subscription} Subscription */
/** @typedef {import('@oyl/all-of-oyl').SubscriptionCharge} SubscriptionCharge */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */
```
Add the write methods inside the returned object, immediately after the `removePossession` method (after its closing `},`):
```js
    /** @param {Subscription} sub @returns {Promise<Subscription>} */
    async addSubscription(sub) {
      const saved = await repos.subscriptions.save(sub)
      vault.addSubscription(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeSubscription(id) {
      await repos.subscriptions.delete(id)
      vault.removeSubscription(id)
      revision.set((n += 1))
    },
    /**
     * Pay the pending occurrence (stateful: advances the cursor in place, persists,
     * re-hydrates to resync — rollback-on-failure, like planner cancel). The returned
     * SubscriptionCharge is the finance seam; Slice 2 callers ignore it.
     * @param {Id} id @param {DayKey} on @returns {Promise<SubscriptionCharge | undefined>}
     */
    async renew(id, on) {
      const sub = vault.subscriptions().find((s) => s.id === id)
      if (!sub) return undefined
      const charge = sub.renew(on)
      try {
        await repos.subscriptions.save(sub)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
      return charge
    },
```
Add the read methods after the `possessions()` method (after its closing `},`):
```js
    /** @returns {readonly Subscription[]} */
    subscriptions() {
      revision.get()
      return vault.subscriptions()
    },
    /** @returns {ReadonlyMap<string, Money>} */
    monthlySubscriptionTotals() {
      revision.get()
      return vault.monthlySubscriptionTotals()
    },
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/vault-store.test.js`
Expected: PASS (existing 5 + 4 new).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean). If `vault.subscriptions().find(...)` trips a readonly-array `.find` issue, it won't — `.find` exists on `readonly T[]`. If the `subscriptions` repo element type (typed `Repository<Subscription>` in `VaultRepos`) mismatches, adjust minimally and report.
```bash
git add apps/vanilla-oyl/src/state/vault-store.js apps/vanilla-oyl/src/state/vault-store.test.js
git commit -m "feat(vanilla-oyl): VaultStore subscription methods (add/remove/renew/subscriptions/totals)"
```

---

## Task 3: `components/oyl-subscription-row.js` — new component

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-subscription-row.js`
- Test: `apps/vanilla-oyl/src/components/oyl-subscription-row.test.js`

Mirrors `oyl-plan-row` (read it for the actions+confirm pattern). Renew is a single click (no confirm, like the planner complete checkbox); Delete uses the shared `inlineConfirm`. Both actions live in one `.actions` mount that the confirm temporarily takes over and `_renderActions` restores.

- [ ] **Step 1: Create the failing test** `apps/vanilla-oyl/src/components/oyl-subscription-row.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Subscription, Cadence, Money, DayKey } from '@oyl/all-of-oyl'
import { defineSubscriptionRow } from './oyl-subscription-row.js'

beforeAll(() => defineSubscriptionRow())

const today = DayKey.of('2026-06-13')
/** @param {Record<string, unknown>} [opts] */
const mkSub = (opts = {}) => new Subscription({
  name: 'Netflix', amount: Money.of(1399, 'USD', 2), cadence: Cadence.of(1, 'months'),
  anchor: today, category: 'entertainment', ...opts,
})

/** @param {any} subscription @param {{ onRenew?: (id: any) => void, onDelete?: (id: any) => void }} [h] */
function row(subscription, h = {}) {
  const el = /** @type {import('./oyl-subscription-row.js').OylSubscriptionRow} */ (document.createElement('oyl-subscription-row'))
  el.subscription = subscription
  el.today = today
  el.onRenew = h.onRenew ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-subscription-row>', () => {
  it('renders name, amount, cadence and next-due', () => {
    const el = row(mkSub())
    const text = root(el).textContent ?? ''
    expect(text).toContain('Netflix')
    expect(text).toContain('$13.99')
    expect(text.toLowerCase()).toContain('every month')
    expect(text).toContain('Renews')
    el.remove()
  })

  it('Renew calls onRenew(id)', () => {
    const onRenew = vi.fn()
    const s = mkSub()
    const el = row(s, { onRenew })
    const btn = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="renew"]'))
    btn.click()
    expect(onRenew).toHaveBeenCalledWith(s.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const s = mkSub()
    const el = row(s, { onDelete })
    const r = root(el)
    const del1 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del1.click()
    const no = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-no"]'))
    no.click()
    expect(r.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()
    const del2 = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]'))
    del2.click()
    const yes = /** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    expect(onDelete).toHaveBeenCalledWith(s.id)
    el.remove()
  })

  it('marks a lapsed (past-due) renewal as overdue', () => {
    const el = row(mkSub({ anchor: DayKey.of('2026-06-01') })) // pending = 2026-06-01 < today
    expect(root(el).querySelector('.overdue')).toBeTruthy()
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-subscription-row.test.js`
Expected: FAIL (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-subscription-row.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { formatMoney, dueInLabel } from '../vault/format.js'
import { cadenceLabel } from '../planner/format.js'

/** @typedef {import('@oyl/all-of-oyl').Subscription} Subscription */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .meta { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .due { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .due.overdue { color: var(--color-warn); }
  .actions { grid-column: 2; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylSubscriptionRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Subscription} */
    this.subscription = /** @type {Subscription} */ (/** @type {unknown} */ (undefined))
    /** @type {DayKey} */
    this.today = /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onRenew = () => {}
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const main = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.subscription.name
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = `${formatMoney(this.subscription.amount)} · ${cadenceLabel(this.subscription.cadence)}`
    main.append(title, meta)
    const due = this.subscription.nextDueOn(this.today)
    if (due) {
      const dueEl = document.createElement('div')
      dueEl.className = 'due'
      if (due.compare(this.today) < 0) dueEl.classList.add('overdue')
      dueEl.textContent = `Renews ${due.value} · ${dueInLabel(due, this.today)}`
      main.append(dueEl)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderActions(actions)

    row.append(main, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderActions(mount) {
    mount.replaceChildren()
    const renew = document.createElement('button')
    renew.dataset.act = 'renew'
    renew.textContent = 'Renew'
    renew.addEventListener('click', () => this.onRenew(this.subscription.id), { signal: this.lifecycle })
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.subscription.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(renew, del)
  }
}

/** Register the element (idempotent). */
export function defineSubscriptionRow() {
  if (!customElements.get('oyl-subscription-row')) customElements.define('oyl-subscription-row', OylSubscriptionRow)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-subscription-row.test.js`
Expected: PASS (4 tests). Note `cadenceLabel(Cadence.of(1,'months'))` → `'every month'`.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean). Before trusting the code, confirm against `oyl-plan-row.js` that `inlineConfirm`, `OylElement`, `this.lifecycle`, and `sheet` are used identically; confirm `cadenceLabel` is exported from `../planner/format.js` and `formatMoney`/`dueInLabel` from `../vault/format.js`.
```bash
git add apps/vanilla-oyl/src/components/oyl-subscription-row.js apps/vanilla-oyl/src/components/oyl-subscription-row.test.js
git commit -m "feat(vanilla-oyl): oyl-subscription-row (amount/cadence/next-due, Renew + inline-confirm Delete)"
```

---

## Task 4: `components/oyl-vault-composer.js` — add the Subscription mode

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-vault-composer.js`
- Test: `apps/vanilla-oyl/src/components/oyl-vault-composer.test.js`

The composer uses an `applyType(type)` helper (not a `track` toggle) and builds segment buttons inline. The price control (`input[name="amount"]` + currency) is shared and shown for possession **and** subscription, with a dynamic `<label>`.

- [ ] **Step 1: Add the failing tests**

In `apps/vanilla-oyl/src/components/oyl-vault-composer.test.js`, extend the import:
```js
import { Document, Possession, Subscription } from '@oyl/all-of-oyl'
```
Extend the `composer` helper's JSDoc param to include `addSubscription`:
```js
/** @param {{ addDocument?: (d: any) => Promise<any>, addPossession?: (p: any) => Promise<any>, addSubscription?: (s: any) => Promise<any> }} store */
```
Append inside `describe('<oyl-vault-composer>', …)`:
```js
  it('adds a subscription with amount, cadence, anchor, and category', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addSubscription: async (s) => { added.push(s); return s } })
    q(el, 'button[data-type="subscription"]').click()
    q(el, 'input[name="name"]').value = 'Netflix'
    q(el, 'input[name="amount"]').value = '13.99'
    q(el, 'select[name="currency"]').value = 'USD'
    q(el, 'input[name="cadenceN"]').value = '1'
    q(el, 'select[name="cadenceUnit"]').value = 'months'
    q(el, 'input[name="anchor"]').value = '2026-06-01'
    q(el, 'select[name="category"]').value = 'entertainment'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Subscription)
    expect(added[0].name).toBe('Netflix')
    expect(added[0].amount.minor).toBe(1399)
    expect(added[0].cadence.n).toBe(1)
    expect(added[0].cadence.unit).toBe('months')
    expect(added[0].anchor.value).toBe('2026-06-01')
    expect(added[0].category).toBe('entertainment')
    el.remove()
  })

  it('subscription with a non-positive amount shows an error and does not add', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addSubscription: async (s) => { added.push(s); return s } })
    q(el, 'button[data-type="subscription"]').click()
    q(el, 'input[name="name"]').value = 'Bad'
    q(el, 'input[name="amount"]').value = '0'
    q(el, 'input[name="anchor"]').value = '2026-06-01'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('toggling to Subscription shows cadence/anchor/category and hides doc & possession-only fields', () => {
    const el = composer({})
    q(el, 'button[data-type="subscription"]').click()
    expect(q(el, 'input[name="cadenceN"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="anchor"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'select[name="category"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="kind"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="location"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="amount"]').closest('.field').hidden).toBe(false) // price shared
    el.remove()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-composer.test.js`
Expected: FAIL (no `button[data-type="subscription"]`).

- [ ] **Step 3: Implement** — six edits to `apps/vanilla-oyl/src/components/oyl-vault-composer.js`:

**3a. Imports.** Replace:
```js
import { Document, Possession, Money, DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
```
with:
```js
import { Document, Possession, Subscription, Money, Cadence, DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
```

**3b. Constants.** Replace `const CURRENCIES = ['USD', 'EUR', 'GBP']` with:
```js
const CURRENCIES = ['USD', 'EUR', 'GBP']
const CADENCE_UNITS = ['days', 'weeks', 'months', 'years']
const CATEGORIES = ['entertainment', 'software', 'fitness', 'utilities', 'news', 'other']
```

**3c. Segment button.** Replace `    seg.append(docBtn, posBtn)` with:
```js
    const subBtn = document.createElement('button')
    subBtn.type = 'button'
    subBtn.dataset.type = 'subscription'
    subBtn.textContent = 'Subscription'
    seg.append(docBtn, posBtn, subBtn)
```

**3d. Subscription fields.** Immediately after the line `    const purchasedField = this._labeled('purchasedOn', 'Purchased (optional)', purchasedOn)`, insert:
```js

    // Subscription-only fields
    const cadenceN = this._input('cadenceN', 'number')
    cadenceN.value = '1'
    cadenceN.min = '1'
    const cadenceUnit = document.createElement('select')
    cadenceUnit.name = 'cadenceUnit'
    for (const u of CADENCE_UNITS) {
      const o = document.createElement('option')
      o.value = u
      o.textContent = u
      if (u === 'months') o.selected = true
      cadenceUnit.append(o)
    }
    const cadenceWrap = document.createElement('div')
    cadenceWrap.className = 'price'
    cadenceWrap.append(cadenceN, cadenceUnit)
    const anchor = this._input('anchor', 'date')
    anchor.value = now().toISOString().slice(0, 10)
    const category = document.createElement('select')
    category.name = 'category'
    for (const c of CATEGORIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      category.append(o)
    }
    const cadenceField = this._labeled('cadenceN', 'Every', cadenceWrap)
    const anchorField = this._labeled('anchor', 'Renews on', anchor)
    const categoryField = this._labeled('category', 'Category', category)
```

**3e. Append the new fields + extend `applyType` + add the listener.** Replace this whole block:
```js
    formEl.append(
      seg,
      this._labeled('name', 'Name', name),
      kindField, expiresField,
      locationField, warrantyField, priceField, purchasedField,
      error, actions,
    )
    root.append(formEl)

    /** @param {string} type */
    const applyType = (type) => {
      const isDoc = type === 'document'
      kindField.hidden = !isDoc
      expiresField.hidden = !isDoc
      locationField.hidden = isDoc
      warrantyField.hidden = isDoc
      priceField.hidden = isDoc
      purchasedField.hidden = isDoc
      docBtn.setAttribute('aria-pressed', String(isDoc))
      posBtn.setAttribute('aria-pressed', String(!isDoc))
    }
    applyType(this._type.get())
    docBtn.addEventListener('click', () => { this._type.set('document'); applyType('document') }, { signal: this.lifecycle })
    posBtn.addEventListener('click', () => { this._type.set('possession'); applyType('possession') }, { signal: this.lifecycle })
```
with:
```js
    formEl.append(
      seg,
      this._labeled('name', 'Name', name),
      kindField, expiresField,
      locationField, warrantyField, priceField, purchasedField,
      cadenceField, anchorField, categoryField,
      error, actions,
    )
    root.append(formEl)

    const priceLabel = /** @type {HTMLLabelElement} */ (priceField.querySelector('label'))
    /** @param {string} type */
    const applyType = (type) => {
      const isDoc = type === 'document'
      const isPos = type === 'possession'
      const isSub = type === 'subscription'
      kindField.hidden = !isDoc
      expiresField.hidden = !isDoc
      locationField.hidden = !isPos
      warrantyField.hidden = !isPos
      purchasedField.hidden = !isPos
      priceField.hidden = isDoc // shown for possession AND subscription
      priceLabel.textContent = isSub ? 'Amount' : 'Price (optional)'
      cadenceField.hidden = !isSub
      anchorField.hidden = !isSub
      categoryField.hidden = !isSub
      docBtn.setAttribute('aria-pressed', String(isDoc))
      posBtn.setAttribute('aria-pressed', String(isPos))
      subBtn.setAttribute('aria-pressed', String(isSub))
    }
    applyType(this._type.get())
    docBtn.addEventListener('click', () => { this._type.set('document'); applyType('document') }, { signal: this.lifecycle })
    posBtn.addEventListener('click', () => { this._type.set('possession'); applyType('possession') }, { signal: this.lifecycle })
    subBtn.addEventListener('click', () => { this._type.set('subscription'); applyType('subscription') }, { signal: this.lifecycle })
```

**3f. Submit context + branch.** Replace the `submit` listener line:
```js
      void this._submit({ error, name, kind, expiresOn, location, warrantyUntil, amount, currency, purchasedOn, formEl })
```
with:
```js
      void this._submit({ error, name, kind, expiresOn, location, warrantyUntil, amount, currency, purchasedOn, cadenceN, cadenceUnit, anchor, category, formEl })
```
Then replace the entire `_submit` method with:
```js
  /**
   * @param {{ error: HTMLElement, name: HTMLInputElement, kind: HTMLInputElement, expiresOn: HTMLInputElement,
   *   location: HTMLInputElement, warrantyUntil: HTMLInputElement, amount: HTMLInputElement,
   *   currency: HTMLSelectElement, purchasedOn: HTMLInputElement, cadenceN: HTMLInputElement,
   *   cadenceUnit: HTMLSelectElement, anchor: HTMLInputElement, category: HTMLSelectElement,
   *   formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    try {
      if (this._type.get() === 'document') {
        const props = /** @type {{ name: string, kind: string, expiresOn?: DayKey }} */ ({ name: ctx.name.value, kind: ctx.kind.value })
        if (ctx.expiresOn.value) props.expiresOn = DayKey.of(ctx.expiresOn.value)
        await this.store.addDocument(new Document(props))
      } else if (this._type.get() === 'possession') {
        const props = /** @type {{ name: string, location?: string, warrantyUntil?: DayKey, purchasePrice?: Money, purchasedOn?: DayKey }} */ ({ name: ctx.name.value })
        if (ctx.location.value) props.location = ctx.location.value
        if (ctx.warrantyUntil.value) props.warrantyUntil = DayKey.of(ctx.warrantyUntil.value)
        const amt = Number(ctx.amount.value)
        if (ctx.amount.value && amt > 0) props.purchasePrice = Money.fromMajor(amt, ctx.currency.value)
        if (ctx.purchasedOn.value) props.purchasedOn = DayKey.of(ctx.purchasedOn.value)
        await this.store.addPossession(new Possession(props))
      } else {
        const sub = new Subscription({
          name: ctx.name.value,
          amount: Money.fromMajor(Number(ctx.amount.value), ctx.currency.value),
          cadence: Cadence.of(Number(ctx.cadenceN.value), /** @type {any} */ (ctx.cadenceUnit.value)),
          anchor: DayKey.of(ctx.anchor.value),
          category: ctx.category.value,
        })
        await this.store.addSubscription(sub)
      }
      ctx.formEl.reset()
      ctx.cadenceN.value = '1'
      ctx.anchor.value = now().toISOString().slice(0, 10)
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }
```
(Re-defaulting `cadenceN`/`anchor` after `formEl.reset()` keeps the form usable for repeated adds — `reset()` reverts inputs to their empty HTML attribute defaults, not the JS-set values.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-composer.test.js`
Expected: PASS (existing 4 + 3 new). The non-positive-amount test relies on `Money.fromMajor(0,…)` → `new Subscription` throwing `INVALID_QUANTITY`, caught and shown inline.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean). The unused `_segButton` method remains (pre-existing dead code from Slice 1) — leave it; `noUnusedLocals` does not flag class methods.
```bash
git add apps/vanilla-oyl/src/components/oyl-vault-composer.js apps/vanilla-oyl/src/components/oyl-vault-composer.test.js
git commit -m "feat(vanilla-oyl): vault composer Subscription mode (cadence, anchor, slug category, shared price)"
```

---

## Task 5: `components/oyl-vault.js` — Subscriptions section + monthly total

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-vault.js`
- Test: `apps/vanilla-oyl/src/components/oyl-vault.test.js`

- [ ] **Step 1: Add the failing tests**

In `apps/vanilla-oyl/src/components/oyl-vault.test.js`, extend the import:
```js
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey } from '@oyl/all-of-oyl'
```
In the `seededStore()` helper, add a subscription before `const store = createVaultStore(repos)` (anchored today so it lands in every horizon and appears in the feed):
```js
  await repos.subscriptions.save(new Subscription({ name: 'Spotify', amount: Money.of(999, 'USD', 2), cadence: Cadence.of(1, 'months'), anchor: today(), category: 'entertainment' }))
```
Append inside `describe('<oyl-vault>', …)`:
```js
  it('renders the Subscriptions section with a monthly total', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Subscriptions')
    expect(text).toContain('Spotify')
    expect(root(el).querySelectorAll('oyl-subscription-row')).toHaveLength(1)
    const total = root(el).querySelector('.monthly-total')?.textContent ?? ''
    expect(total).toContain('$9.99')
    el.remove()
  })

  it('renew advances a subscription and delete removes it', async () => {
    const store = await seededStore()
    const renewSpy = vi.spyOn(store, 'renew')
    const removeSpy = vi.spyOn(store, 'removeSubscription')
    const el = screen(store)
    await Promise.resolve()
    const row1 = /** @type {any} */ (root(el).querySelector('oyl-subscription-row'))
    const renewBtn = /** @type {HTMLButtonElement} */ (row1.shadowRoot.querySelector('button[data-act="renew"]'))
    renewBtn.click()
    await Promise.resolve(); await Promise.resolve()
    expect(renewSpy).toHaveBeenCalled()
    const row2 = /** @type {any} */ (root(el).querySelector('oyl-subscription-row'))
    const delBtn = /** @type {HTMLButtonElement} */ (row2.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const yes = /** @type {HTMLButtonElement} */ (row2.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await Promise.resolve(); await Promise.resolve()
    expect(removeSpy).toHaveBeenCalled()
    el.remove()
  })
```
(The existing Slice 1 tests still hold: subscriptions render as `oyl-subscription-row`, so the "2 `oyl-vault-item`" assertion is unaffected, and `Spotify` in the feed doesn't break the `Passport`/`Espresso` `toContain` checks.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: FAIL (no Subscriptions section / `oyl-subscription-row`).

- [ ] **Step 3: Implement** — four edits to `apps/vanilla-oyl/src/components/oyl-vault.js`:

**3a. Imports.** Replace:
```js
import { dueInLabel, formatMoney } from '../vault/format.js'
import { defineVaultComposer } from './oyl-vault-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'
```
with:
```js
import { dueInLabel, formatMoney, monthlyTotalLabel } from '../vault/format.js'
import { defineVaultComposer } from './oyl-vault-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'
import { defineSubscriptionRow } from './oyl-subscription-row.js'
```

**3b. Style for the total.** In the `sheet(...)` template, after the `.empty { … }` rule, add:
```js
  .monthly-total { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; }
```

**3c. Register + build the section.** Replace:
```js
    defineVaultComposer()
    defineVaultItem()
```
with:
```js
    defineVaultComposer()
    defineVaultItem()
    defineSubscriptionRow()
```
Then, immediately after the possessions elements block:
```js
    const posLabel = document.createElement('div')
    posLabel.className = 'section-label'
    posLabel.textContent = 'Possessions'
    const posList = document.createElement('ol')
    const posEmpty = document.createElement('div')
    posEmpty.className = 'empty'
```
insert:
```js

    const subHead = document.createElement('div')
    subHead.className = 'upcoming-head'
    const subLabel = document.createElement('div')
    subLabel.className = 'section-label'
    subLabel.textContent = 'Subscriptions'
    const subTotal = document.createElement('span')
    subTotal.className = 'monthly-total'
    subHead.append(subLabel, subTotal)
    const subsList = document.createElement('ol')
    const subsEmpty = document.createElement('div')
    subsEmpty.className = 'empty'
```
And replace the `root.append(...)` line:
```js
    root.append(h2, live, composer, upHead, upList, upEmpty, docLabel, docList, docEmpty, posLabel, posList, posEmpty)
```
with:
```js
    root.append(h2, live, composer, upHead, upList, upEmpty, docLabel, docList, docEmpty, posLabel, posList, posEmpty, subHead, subsList, subsEmpty)
```

**3d. Repaint subscriptions in `track()`.** At the END of the `this.track(() => { … })` callback, immediately before its closing `})` (after the `posEmpty.textContent = …` line), insert:
```js

      const today = DayKey.from(now(), this.tz)
      const subs = this.store.subscriptions()
      subTotal.textContent = monthlyTotalLabel(this.store.monthlySubscriptionTotals())
      subsList.replaceChildren()
      for (const s of subs) {
        const srow = /** @type {import('./oyl-subscription-row.js').OylSubscriptionRow} */ (document.createElement('oyl-subscription-row'))
        srow.subscription = s
        srow.today = today
        srow.onRenew = (id) => { void this.store.renew(id, today); live.textContent = 'Renewed' }
        srow.onDelete = (id) => { void this.store.removeSubscription(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(srow)
        subsList.append(li)
      }
      subsEmpty.hidden = subs.length > 0
      subsEmpty.textContent = subsEmpty.hidden ? '' : 'No subscriptions yet.'
```
`DayKey` and `now` are already imported in this file (used by `repaintUpcoming`). This block computes its own `today` in the `track()` scope (`repaintUpcoming` keeps its own internal `today` — a harmless small double-compute).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: PASS (existing 4 + 2 new).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean)
```bash
git add apps/vanilla-oyl/src/components/oyl-vault.js apps/vanilla-oyl/src/components/oyl-vault.test.js
git commit -m "feat(vanilla-oyl): vault screen Subscriptions section + monthly total"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green: 120 prior + ~16 new ≈ 136) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser pass (real Chrome):** `pnpm vanilla dev` (builds lib + vendors + serves on 8041; **hard-reload** the tab so updated ES modules load), open `#/vault`:
  - Status → Load demo data, return to Vault.
  - **Subscriptions** section lists Netflix + Gym with a monthly total on the header (e.g. `$17.99/mo`); Gym (lapsed in the seed) shows its "Renews …" line in amber (overdue).
  - Click **Renew** on a subscription → its "Renews …" date advances to the next period and its entry moves forward in the **Upcoming** feed.
  - Add a subscription via the composer (Subscription segment: name + amount + cadence + Renews-on + category) → appears in the section and (if within horizon) the feed; the monthly total updates.
  - **Delete** a subscription via the inline confirm (Yes/No).
  - Toggle a theme to confirm tokens hold.
- [ ] **Final code review** of the branch (subagent-driven-development final reviewer), then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** `monthlyTotalLabel` (Task 1); store add/remove/renew/subscriptions/totals (Task 2); `<oyl-subscription-row>` with Renew + inline-confirm Delete + overdue (Task 3); composer 3rd segment + cadence/anchor/slug-category + dynamic price label + domain-delegated validation (Task 4); Subscriptions section + inline monthly total + renew/delete wiring (Task 5). No nav/route/data changes, per spec.
- **Type consistency:** store methods `addSubscription`/`removeSubscription`/`renew`/`subscriptions`/`monthlySubscriptionTotals` used identically in store, screen, and tests. Row props `subscription`/`today`/`onRenew`/`onDelete`. `Money.fromMajor`, `Cadence.of(n, unit)`, `DayKey.of`, `subscription.nextDueOn(today)` match the real API. `inlineConfirm` selectors `confirm-yes`/`confirm-no`. `cadenceLabel` reused from `planner/format.js`.
- **Edge cases:** empty/zero/negative amount → `Subscription` throws "amount must be positive" (caught inline); preset-select category is always a valid slug; lapsed subscription (`nextDueOn` in the past) → `.overdue` amber; `monthlyTotalLabel` sorted for determinism; `reset()` re-defaults `cadenceN`/`anchor`.
- **Placeholder scan:** clean — every code step is complete and copy-pasteable; no TBDs, no pseudo-code, no artifact blocks.
