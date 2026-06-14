# vanilla-oyl Vault Screen (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vault screen (Slice 1) for `apps/vanilla-oyl` — an upcoming-due feed with a horizon selector, plus add/delete for Documents and Possessions — on a `VaultStore` that hydrates all five vault registries but only writes documents + possessions.

**Architecture:** A `VaultStore` wraps the `documents`/`possessions`/`subscriptions`/`contacts`/`giftIdeas` repositories + the domain `Vault`. Writes are persist-first surgical (like `JournalStore` — vault items are immutable, no mutations in Slice 1); the store hydrates all five registries so `vault.upcoming(range)` is complete even though only documents + possessions have write methods. Web Components (`<oyl-vault>`, `<oyl-vault-composer>`, `<oyl-vault-item>`) on `OylElement` render the screen; a `#/vault` route + a Vault nav item wire it in. The delete affordance reuses the shared `inlineConfirm` helper from the UI-consolidation pass.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Vault`/`Document`/`Possession`/`Money`/`DayKey`/`DayRange`/`UpcomingDue`/`InMemoryRepository`), the foundation's signals core + Web Component base + Journal/Planner-screen patterns + the shared `inlineConfirm` helper.

**Spec:** `docs/superpowers/specs/2026-06-13-vanilla-oyl-vault-screen-design.md`

---

## Conventions (carried from the Journal/Planner screens — apply throughout)

- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Full: `pnpm --filter @oyl/vanilla-oyl exec vitest run`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- App code is `.js` + JSDoc under strict + checkJs. **No `innerHTML`** — `createElement`/`textContent` only (a security hook blocks `innerHTML`).
- Web Components extend `OylElement` (`this.track(fn)` auto-disposed reactive effect; `this.lifecycle` AbortSignal for listeners; `static styles = [sheet(css)]`). Idempotent `defineX()` guarded by `customElements.get`.
- **Externally-assigned fields** use the constructor double-cast: `this.prop = /** @type {T} */ (/** @type {unknown} */ (undefined))`. For fields with a sane empty default (strings/arrays/callbacks), assign the default directly.
- Test fakes need JSDoc `@param` annotations (strict `noImplicitAny`); cast-then-`.click()` lines need leading semicolons or named locals (ASI hazard) — prefer `const el = root.querySelector(...)` then `el.click()`.
- `@oyl/all-of-oyl` resolves to TS source in tests/typecheck, so **no prior build is needed**.
- Use a **static import** of domain classes at module top (the dynamic-`import()`-in-submit settle-timing pitfall from the planner build).
- **Do not name a custom-element property `title`** — it reflects the global `title` content attribute (tooltip). The display row uses `label` + `lines`.

## File structure

**New (`apps/vanilla-oyl/src/`):**
- `vault/format.js` — `dueInLabel`, `formatMoney` (pure).
- `state/vault-store.js` — `createVaultStore(repos)` (persist-first; hydrates all five registries).
- `components/oyl-vault-item.js` — generic display row: `label` + `lines[]` + inline-confirm delete.
- `components/oyl-vault-composer.js` — Document | Possession add form.
- `components/oyl-vault.js` — the screen (upcoming feed + horizon + Documents + Possessions).
- Matching `*.test.js` for each of the five above.

**Modified:**
- `state/data.js` — build the vault store, hydrate in `refresh()`, expose `vault`.
- `components/oyl-nav.js` — add the `Vault` item.
- `main.js` — define `<oyl-vault>`, add the `#/vault` route.

---

## Task 1: `src/vault/format.js` — presentation helpers

**Files:**
- Create: `apps/vanilla-oyl/src/vault/format.js`
- Test: `apps/vanilla-oyl/src/vault/format.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/vault/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { DayKey, Money } from '@oyl/all-of-oyl'
import { dueInLabel, formatMoney } from './format.js'

const today = DayKey.of('2026-06-13')

describe('dueInLabel', () => {
  it('phrases near and far future days', () => {
    expect(dueInLabel(today, today)).toBe('today')
    expect(dueInLabel(today.addDays(1), today)).toBe('tomorrow')
    expect(dueInLabel(today.addDays(5), today)).toBe('in 5 days')
    expect(dueInLabel(today.addDays(21), today)).toBe('in 3 weeks')
    expect(dueInLabel(today.addDays(90), today)).toBe('in 3 months')
  })
  it('phrases past days (overdue renewals)', () => {
    expect(dueInLabel(today.addDays(-1), today)).toBe('yesterday')
    expect(dueInLabel(today.addDays(-5), today)).toBe('5 days ago')
  })
})

describe('formatMoney', () => {
  it('uses a symbol for known currencies', () => {
    expect(formatMoney(Money.of(64900, 'USD', 2))).toBe('$649.00')
    expect(formatMoney(Money.of(1000, 'EUR', 2))).toBe('€10.00')
    expect(formatMoney(Money.of(500, 'GBP', 2))).toBe('£5.00')
  })
  it('falls back to a trailing code for unknown currencies and respects exponent', () => {
    expect(formatMoney(Money.of(1000, 'JPY', 0))).toBe('1000 JPY')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: FAIL (`Cannot find module './format.js'`).

- [ ] **Step 3: Write the implementation**

Create `apps/vanilla-oyl/src/vault/format.js`:

```js
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Money} Money */

const SYMBOLS = /** @type {Record<string, string>} */ ({ USD: '$', EUR: '€', GBP: '£' })

/**
 * Relative phrasing for an upcoming (or past) due day: "today" / "tomorrow" /
 * "in 5 days" / "in 3 weeks" / "in 3 months", and past → "yesterday" / "5 days ago".
 * @param {DayKey} due @param {DayKey} today @returns {string}
 */
export function dueInLabel(due, today) {
  const days = Math.round((Date.parse(due.value) - Date.parse(today.value)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  const n = Math.abs(days)
  const phrase = n < 14 ? `${n} days` : n < 60 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30)} months`
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
}

/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>". @param {Money} m @returns {string} */
export function formatMoney(m) {
  const amount = (m.minor / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  return sym ? `${sym}${amount}` : `${amount} ${m.currency}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`
Expected: PASS (6 assertions across 4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (expect clean)

```bash
git add apps/vanilla-oyl/src/vault/format.js apps/vanilla-oyl/src/vault/format.test.js
git commit -m "feat(vanilla-oyl): vault format helpers (dueInLabel, formatMoney)"
```

---

## Task 2: `src/state/vault-store.js` — the VaultStore

**Files:**
- Create: `apps/vanilla-oyl/src/state/vault-store.js`
- Test: `apps/vanilla-oyl/src/state/vault-store.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/state/vault-store.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Document, Possession, DayKey, DayRange } from '@oyl/all-of-oyl'
import { createVaultStore } from './vault-store.js'

const today = DayKey.of('2026-06-13')
const range = DayRange.of(today, today.addDays(90))

/** Five in-memory repositories, the shape createVaultStore expects. */
function repos() {
  return {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
}

describe('createVaultStore', () => {
  it('addDocument persists, reflects in documents(), and bumps revision', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const before = store.revision.get()
    await store.addDocument(new Document({ name: 'Passport', kind: 'passport' }))
    expect(store.documents()).toHaveLength(1)
    expect(await r.documents.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('addPossession persists and reflects in possessions()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addPossession(new Possession({ name: 'Espresso machine' }))
    expect(store.possessions()).toHaveLength(1)
    expect(await r.possessions.list()).toHaveLength(1)
  })

  it('a dated item appears in upcoming() after add', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addDocument(new Document({ name: 'Passport', kind: 'passport', expiresOn: today.addDays(30) }))
    const feed = store.upcoming(range)
    expect(feed.map((u) => u.label)).toContain('Passport')
  })

  it('removeDocument deletes from the repo and the aggregate', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addDocument(new Document({ name: 'Passport', kind: 'passport' }))
    await store.removeDocument(saved.id)
    expect(store.documents()).toHaveLength(0)
    expect(await r.documents.list()).toHaveLength(0)
  })

  it('hydrate rebuilds every registry so upcoming() is complete', async () => {
    const r = repos()
    await r.documents.save(new Document({ name: 'Passport', kind: 'passport', expiresOn: today.addDays(20) }))
    await r.possessions.save(new Possession({ name: 'Espresso', warrantyUntil: today.addDays(10) }))
    const store = createVaultStore(r)
    expect(store.upcoming(range)).toHaveLength(0) // not hydrated yet
    await store.hydrate()
    const labels = store.upcoming(range).map((u) => u.label)
    expect(labels).toContain('Passport')
    expect(labels).toContain('Espresso (warranty)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/vault-store.test.js`
Expected: FAIL (`Cannot find module './vault-store.js'`).

- [ ] **Step 3: Write the implementation**

Create `apps/vanilla-oyl/src/state/vault-store.js`:

```js
import { Vault } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Document} Document */
/** @typedef {import('@oyl/all-of-oyl').Possession} Possession */
/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @template T @typedef {import('@oyl/all-of-oyl').Repository<T>} Repository */
/**
 * @typedef {{
 *   documents: Repository<Document>, possessions: Repository<Possession>,
 *   subscriptions: Repository<any>, contacts: Repository<any>, giftIdeas: Repository<any>,
 * }} VaultRepos
 */

/**
 * App-level reactive wrapper over the vault repositories + the domain Vault. Writes are
 * persist-first surgical (vault items are immutable — no in-place mutations in Slice 1).
 * hydrate() rebuilds ALL FIVE registries so upcoming() stays complete even though only
 * documents + possessions have write methods here (subscriptions/contacts/gift-ideas are
 * read-only until slices 2 & 3). Reads touch revision so they re-run under this.track().
 * @param {VaultRepos} repos
 */
export function createVaultStore(repos) {
  let vault = new Vault()
  let n = 0
  const revision = signal(0)

  async function hydrate() {
    const fresh = new Vault()
    for (const d of await repos.documents.list()) fresh.addDocument(d)
    for (const p of await repos.possessions.list()) fresh.addPossession(p)
    for (const s of await repos.subscriptions.list()) fresh.addSubscription(s)
    for (const c of await repos.contacts.list()) fresh.addContact(c)
    for (const g of await repos.giftIdeas.list()) fresh.addGiftIdea(g)
    vault = fresh
    revision.set((n += 1))
  }

  return {
    revision,
    hydrate,

    /** @param {Document} doc @returns {Promise<Document>} */
    async addDocument(doc) {
      const saved = await repos.documents.save(doc)
      vault.addDocument(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeDocument(id) {
      await repos.documents.delete(id)
      vault.removeDocument(id)
      revision.set((n += 1))
    },
    /** @param {Possession} p @returns {Promise<Possession>} */
    async addPossession(p) {
      const saved = await repos.possessions.save(p)
      vault.addPossession(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removePossession(id) {
      await repos.possessions.delete(id)
      vault.removePossession(id)
      revision.set((n += 1))
    },

    /** @returns {readonly Document[]} */
    documents() {
      revision.get()
      return vault.documents()
    },
    /** @returns {readonly Possession[]} */
    possessions() {
      revision.get()
      return vault.possessions()
    },
    /** @param {DayRange} range @returns {readonly import('@oyl/all-of-oyl').UpcomingDue[]} */
    upcoming(range) {
      revision.get()
      return vault.upcoming(range)
    },
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/vault-store.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (expect clean)

```bash
git add apps/vanilla-oyl/src/state/vault-store.js apps/vanilla-oyl/src/state/vault-store.test.js
git commit -m "feat(vanilla-oyl): VaultStore (persist-first; hydrates all five registries)"
```

---

## Task 3: `src/components/oyl-vault-item.js` — generic display row

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-vault-item.js`
- Test: `apps/vanilla-oyl/src/components/oyl-vault-item.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-vault-item.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineVaultItem } from './oyl-vault-item.js'

beforeAll(() => defineVaultItem())

/** @param {string} label @param {ReadonlyArray<string | null | undefined>} lines @param {() => void} [onDelete] */
function item(label, lines, onDelete = () => {}) {
  const el = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
  el.label = label
  el.lines = lines
  el.onDelete = onDelete
  document.body.append(el)
  return el
}

describe('<oyl-vault-item>', () => {
  it('renders the label and non-empty lines, filtering falsy', () => {
    const el = item('Passport', ['passport', null, 'Expires 2026-08-30'])
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const text = root.textContent ?? ''
    expect(text).toContain('Passport')
    expect(text).toContain('passport')
    expect(text).toContain('Expires 2026-08-30')
    expect(root.querySelectorAll('.line')).toHaveLength(2)
    el.remove()
  })

  it('inline-confirm delete: Delete → Yes calls onDelete; No reverts', () => {
    const onDelete = vi.fn()
    const el = item('Espresso', ['Kitchen'], onDelete)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-no"]')).click()
    expect(root.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm-yes"]')).click()
    expect(onDelete).toHaveBeenCalledTimes(1)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-item.test.js`
Expected: FAIL (`Cannot find module './oyl-vault-item.js'`).

- [ ] **Step 3: Write the implementation**

Create `apps/vanilla-oyl/src/components/oyl-vault-item.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .line { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .actions { grid-column: 2; align-self: center; display: inline-flex; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylVaultItem extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {string} */
    this.label = ''
    /** @type {ReadonlyArray<string | null | undefined>} */
    this.lines = []
    /** @type {() => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const main = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = this.label
    main.append(title)
    for (const text of this.lines) {
      if (!text) continue
      const l = document.createElement('div')
      l.className = 'line'
      l.textContent = text
      main.append(l)
    }

    const actions = document.createElement('div')
    actions.className = 'actions'
    this._renderDelete(actions)

    row.append(main, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderDelete(mount) {
    mount.replaceChildren()
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(),
        restore: () => this._renderDelete(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(del)
  }
}

/** Register the element (idempotent). */
export function defineVaultItem() {
  if (!customElements.get('oyl-vault-item')) customElements.define('oyl-vault-item', OylVaultItem)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-item.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (expect clean)

```bash
git add apps/vanilla-oyl/src/components/oyl-vault-item.js apps/vanilla-oyl/src/components/oyl-vault-item.test.js
git commit -m "feat(vanilla-oyl): oyl-vault-item display row (shared inlineConfirm delete)"
```

---

## Task 4: `src/components/oyl-vault-composer.js` — Document | Possession add form

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-vault-composer.js`
- Test: `apps/vanilla-oyl/src/components/oyl-vault-composer.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-vault-composer.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { Document, Possession } from '@oyl/all-of-oyl'
import { defineVaultComposer } from './oyl-vault-composer.js'

beforeAll(() => defineVaultComposer())

/** @param {{ addDocument?: (d: any) => Promise<any>, addPossession?: (p: any) => Promise<any> }} store */
function composer(store) {
  const el = /** @type {import('./oyl-vault-composer.js').OylVaultComposer} */ (document.createElement('oyl-vault-composer'))
  el.store = /** @type {any} */ (store)
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))
const submit = (/** @type {any} */ el) => q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('<oyl-vault-composer>', () => {
  it('adds a document with name + kind + expiry', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addDocument: async (d) => { added.push(d); return d } })
    q(el, 'input[name="name"]').value = 'Passport'
    q(el, 'input[name="kind"]').value = 'passport'
    q(el, 'input[name="expiresOn"]').value = '2026-08-30'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Document)
    expect(added[0].name).toBe('Passport')
    expect(added[0].kind).toBe('passport')
    expect(added[0].expiresOn?.value).toBe('2026-08-30')
    el.remove()
  })

  it('shows an error and does not add when a required field is empty', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addDocument: async (d) => { added.push(d); return d } })
    q(el, 'input[name="name"]').value = 'Passport' // kind left empty
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('adds a possession with a Money price from amount + currency', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addPossession: async (p) => { added.push(p); return p } })
    q(el, 'button[data-type="possession"]').click()
    q(el, 'input[name="name"]').value = 'Espresso machine'
    q(el, 'input[name="amount"]').value = '649'
    q(el, 'select[name="currency"]').value = 'USD'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Possession)
    expect(added[0].name).toBe('Espresso machine')
    expect(added[0].purchasePrice?.minor).toBe(64900)
    expect(added[0].purchasePrice?.currency).toBe('USD')
    el.remove()
  })

  it('toggling to Possession hides the document-only fields', () => {
    const el = composer({})
    const kindField = q(el, 'input[name="kind"]').closest('.field')
    expect(kindField.hidden).toBe(false)
    q(el, 'button[data-type="possession"]').click()
    expect(kindField.hidden).toBe(true)
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-composer.test.js`
Expected: FAIL (`Cannot find module './oyl-vault-composer.js'`).

- [ ] **Step 3: Write the implementation**

Create `apps/vanilla-oyl/src/components/oyl-vault-composer.js`. (Visual conventions match `oyl-plan-composer`: `.seg`, `.field`, `.row2`, `[data-role="error"]`, `button.primary`.)

```js
import { Document, Possession, Money, DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */

const CURRENCIES = ['USD', 'EUR', 'GBP']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .price { display: grid; grid-template-columns: 1fr auto; gap: .5rem; }
  .price select { width: auto; }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylVaultComposer extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
    this._type = signal('document')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Item type')
    const docBtn = this._segButton('document', 'Document')
    const posBtn = this._segButton('possession', 'Possession')
    seg.append(docBtn, posBtn)

    const name = this._input('name', 'text')

    // Document-only fields
    const kind = this._input('kind', 'text')
    const expiresOn = this._input('expiresOn', 'date')
    const kindField = this._labeled('kind', 'Kind', kind)
    const expiresField = this._labeled('expiresOn', 'Expires (optional)', expiresOn)

    // Possession-only fields
    const location = this._input('location', 'text')
    const warrantyUntil = this._input('warrantyUntil', 'date')
    const amount = this._input('amount', 'number')
    amount.min = '0'
    amount.step = '0.01'
    const currency = document.createElement('select')
    currency.name = 'currency'
    for (const c of CURRENCIES) {
      const o = document.createElement('option')
      o.value = c
      o.textContent = c
      currency.append(o)
    }
    const purchasedOn = this._input('purchasedOn', 'date')
    const priceWrap = document.createElement('div')
    priceWrap.className = 'price'
    priceWrap.append(amount, currency)
    const locationField = this._labeled('location', 'Location (optional)', location)
    const warrantyField = this._labeled('warrantyUntil', 'Warranty until (optional)', warrantyUntil)
    const priceField = this._labeled('amount', 'Price (optional)', priceWrap)
    const purchasedField = this._labeled('purchasedOn', 'Purchased (optional)', purchasedOn)

    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')

    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Add to vault'
    actions.append(submit)

    formEl.append(
      seg,
      this._labeled('name', 'Name', name),
      kindField, expiresField,
      locationField, warrantyField, priceField, purchasedField,
      error, actions,
    )
    root.append(formEl)

    this.track(() => {
      const isDoc = this._type.get() === 'document'
      kindField.hidden = !isDoc
      expiresField.hidden = !isDoc
      locationField.hidden = isDoc
      warrantyField.hidden = isDoc
      priceField.hidden = isDoc
      purchasedField.hidden = isDoc
      docBtn.setAttribute('aria-pressed', String(isDoc))
      posBtn.setAttribute('aria-pressed', String(!isDoc))
    })

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, name, kind, expiresOn, location, warrantyUntil, amount, currency, purchasedOn, formEl })
    }, { signal: this.lifecycle })
  }

  /**
   * @param {{ error: HTMLElement, name: HTMLInputElement, kind: HTMLInputElement, expiresOn: HTMLInputElement,
   *   location: HTMLInputElement, warrantyUntil: HTMLInputElement, amount: HTMLInputElement,
   *   currency: HTMLSelectElement, purchasedOn: HTMLInputElement, formEl: HTMLFormElement }} ctx
   */
  async _submit(ctx) {
    ctx.error.textContent = ''
    try {
      if (this._type.get() === 'document') {
        const props = /** @type {{ name: string, kind: string, expiresOn?: DayKey }} */ ({ name: ctx.name.value, kind: ctx.kind.value })
        if (ctx.expiresOn.value) props.expiresOn = DayKey.of(ctx.expiresOn.value)
        await this.store.addDocument(new Document(props))
      } else {
        const props = /** @type {{ name: string, location?: string, warrantyUntil?: DayKey, purchasePrice?: Money, purchasedOn?: DayKey }} */ ({ name: ctx.name.value })
        if (ctx.location.value) props.location = ctx.location.value
        if (ctx.warrantyUntil.value) props.warrantyUntil = DayKey.of(ctx.warrantyUntil.value)
        const amt = Number(ctx.amount.value)
        if (ctx.amount.value && amt > 0) props.purchasePrice = Money.fromMajor(amt, ctx.currency.value)
        if (ctx.purchasedOn.value) props.purchasedOn = DayKey.of(ctx.purchasedOn.value)
        await this.store.addPossession(new Possession(props))
      }
      ctx.formEl.reset()
      this.onAdded()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {string} type @param {string} label @returns {HTMLButtonElement} */
  _segButton(type, label) {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.type = type
    b.textContent = label
    b.addEventListener('click', () => this._type.set(type), { signal: this.lifecycle })
    return b
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
export function defineVaultComposer() {
  if (!customElements.get('oyl-vault-composer')) customElements.define('oyl-vault-composer', OylVaultComposer)
}
```

Note for the implementer: the price field's control is a wrapper `div` (not an input), so `_labeled` only sets `id` on input/select controls — the "Price" `<label>`'s `htmlFor` points at the (id-less) wrapper harmlessly; this keeps the helper generic. The composer test reaches `input[name="amount"]` directly, so this is fine.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault-composer.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (expect clean)

```bash
git add apps/vanilla-oyl/src/components/oyl-vault-composer.js apps/vanilla-oyl/src/components/oyl-vault-composer.test.js
git commit -m "feat(vanilla-oyl): oyl-vault-composer (Document | Possession add form)"
```

---

## Task 5: `src/components/oyl-vault.js` — the Vault screen

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-vault.js`
- Test: `apps/vanilla-oyl/src/components/oyl-vault.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-vault.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { InMemoryRepository, Document, Possession, DayKey } from '@oyl/all-of-oyl'
import { createVaultStore } from '../state/vault-store.js'
import { now } from '../storage/clock.js'
import { defineVault } from './oyl-vault.js'

beforeAll(() => defineVault())

const TZ = 'UTC'
const today = () => DayKey.from(now(), TZ)

/** Build a hydrated vault store: a document at +60d and a possession warranty at +10d. */
async function seededStore() {
  const repos = {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
  await repos.documents.save(new Document({ name: 'Passport', kind: 'passport', expiresOn: today().addDays(60) }))
  await repos.possessions.save(new Possession({ name: 'Espresso', warrantyUntil: today().addDays(10) }))
  const store = createVaultStore(repos)
  await store.hydrate()
  return store
}

/** @param {any} store */
function screen(store) {
  const el = /** @type {import('./oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
  el.store = store
  el.tz = TZ
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-vault>', () => {
  it('renders the upcoming feed plus Documents and Possessions', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Upcoming')
    expect(text).toContain('Passport')
    expect(text).toContain('Espresso')
    expect(root(el).querySelectorAll('oyl-vault-item')).toHaveLength(2) // 1 doc + 1 possession
    el.remove()
  })

  it('horizon change re-filters the feed', async () => {
    const el = screen(await seededStore())
    await Promise.resolve()
    const sel = /** @type {HTMLSelectElement} */ (root(el).querySelector('select'))
    sel.value = '30'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    const feed = root(el).querySelector('.upcoming-list')?.textContent ?? ''
    expect(feed).toContain('Espresso')   // warranty +10d, inside 30
    expect(feed).not.toContain('Passport') // expiry +60d, outside 30
    el.remove()
  })

  it('adding through the store repaints the lists', async () => {
    const store = await seededStore()
    const el = screen(store)
    await Promise.resolve()
    await store.addDocument(new Document({ name: 'Will', kind: 'legal' }))
    expect((root(el).textContent ?? '')).toContain('Will')
    el.remove()
  })

  it('deleting an item calls the store and removes it', async () => {
    const store = await seededStore()
    const removeSpy = vi.spyOn(store, 'removePossession')
    const el = screen(store)
    await Promise.resolve()
    const items = /** @type {any[]} */ ([...root(el).querySelectorAll('oyl-vault-item')])
    const espresso = items.find((i) => (i.label ?? '').includes('Espresso'))
    const r = /** @type {ShadowRoot} */ (espresso.shadowRoot)
    ;/** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="delete"]')).click()
    ;/** @type {HTMLButtonElement} */ (r.querySelector('button[data-act="confirm-yes"]')).click()
    await Promise.resolve(); await Promise.resolve()
    expect(removeSpy).toHaveBeenCalled()
    el.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: FAIL (`Cannot find module './oyl-vault.js'`).

- [ ] **Step 3: Write the implementation**

Create `apps/vanilla-oyl/src/components/oyl-vault.js`:

```js
import { DayKey, DayRange } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { dueInLabel, formatMoney } from '../vault/format.js'
import { defineVaultComposer } from './oyl-vault-composer.js'
import { defineVaultItem } from './oyl-vault-item.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */
/** @typedef {import('@oyl/all-of-oyl').Document} Document */
/** @typedef {import('@oyl/all-of-oyl').Possession} Possession */

const HORIZONS = /** @type {ReadonlyArray<readonly [number, string]>} */ ([
  [30, 'Next 30 days'],
  [90, 'Next 90 days'],
  [365, 'Next year'],
])

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .2rem; }
  .upcoming-head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin: 1.6rem 0 .2rem; }
  .upcoming-head .section-label { margin: 0; }
  select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .5rem; }
  oyl-vault-composer { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .due { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: baseline; padding: .6rem 0; border-top: 1px solid var(--color-border); }
  .due .when { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; }
  .due .date { grid-column: 2; color: var(--color-muted); font-family: var(--font-mono); font-size: var(--step--1); }
  .empty { color: var(--color-muted); padding: 1rem 0; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylVault extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<number>} */
    this._horizon = /** @type {any} */ (undefined)
  }

  render() {
    defineVaultComposer()
    defineVaultItem()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._horizon = signal(90)

    const h2 = document.createElement('h2')
    h2.textContent = 'Vault'
    h2.tabIndex = -1

    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    const composer = /** @type {import('./oyl-vault-composer.js').OylVaultComposer} */ (document.createElement('oyl-vault-composer'))
    composer.store = this.store
    composer.onAdded = () => { live.textContent = 'Added to vault' }

    // Upcoming
    const upHead = document.createElement('div')
    upHead.className = 'upcoming-head'
    const upLabel = document.createElement('div')
    upLabel.className = 'section-label'
    upLabel.textContent = 'Upcoming'
    const sel = document.createElement('select')
    sel.setAttribute('aria-label', 'Horizon')
    for (const [days, label] of HORIZONS) {
      const o = document.createElement('option')
      o.value = String(days)
      o.textContent = label
      if (days === 90) o.selected = true
      sel.append(o)
    }
    sel.addEventListener('change', () => this._horizon.set(Number(sel.value)), { signal: this.lifecycle })
    upHead.append(upLabel, sel)
    const upList = document.createElement('ol')
    upList.className = 'upcoming-list'
    const upEmpty = document.createElement('div')
    upEmpty.className = 'empty'

    // Documents
    const docLabel = document.createElement('div')
    docLabel.className = 'section-label'
    docLabel.textContent = 'Documents'
    const docList = document.createElement('ol')
    const docEmpty = document.createElement('div')
    docEmpty.className = 'empty'

    // Possessions
    const posLabel = document.createElement('div')
    posLabel.className = 'section-label'
    posLabel.textContent = 'Possessions'
    const posList = document.createElement('ol')
    const posEmpty = document.createElement('div')
    posEmpty.className = 'empty'

    root.append(h2, live, composer, upHead, upList, upEmpty, docLabel, docList, docEmpty, posLabel, posList, posEmpty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const horizon = this._horizon.get()
      const range = DayRange.of(today, today.addDays(horizon))

      const feed = this.store.upcoming(range)
      upList.replaceChildren()
      for (const u of feed) upList.append(this._dueRow(u.label, dueInLabel(u.due, today), u.due.value))
      upEmpty.hidden = feed.length > 0
      upEmpty.textContent = upEmpty.hidden ? '' : `Nothing coming up in the ${horizon === 365 ? 'next year' : `next ${horizon} days`}.`

      const docs = this.store.documents()
      docList.replaceChildren()
      for (const d of docs) docList.append(this._itemEl(d.name, [d.kind, d.expiresOn ? `Expires ${d.expiresOn.value}` : null], () => { void this.store.removeDocument(d.id); live.textContent = 'Deleted' }))
      docEmpty.hidden = docs.length > 0
      docEmpty.textContent = docEmpty.hidden ? '' : 'No documents yet.'

      const poss = this.store.possessions()
      posList.replaceChildren()
      for (const p of poss) posList.append(this._itemEl(p.name, [p.location, p.warrantyUntil ? `Warranty until ${p.warrantyUntil.value}` : null, p.purchasePrice ? formatMoney(p.purchasePrice) : null], () => { void this.store.removePossession(p.id); live.textContent = 'Deleted' }))
      posEmpty.hidden = poss.length > 0
      posEmpty.textContent = posEmpty.hidden ? '' : 'No possessions yet.'
    })
  }

  /** @param {string} label @param {string} when @param {string} date @returns {HTMLLIElement} */
  _dueRow(label, when, date) {
    const li = document.createElement('li')
    li.className = 'due'
    const main = document.createElement('div')
    const name = document.createElement('div')
    name.textContent = label
    const w = document.createElement('div')
    w.className = 'when'
    w.textContent = when
    main.append(name, w)
    const d = document.createElement('div')
    d.className = 'date'
    d.textContent = date
    li.append(main, d)
    return li
  }

  /** @param {string} label @param {ReadonlyArray<string | null | undefined>} lines @param {() => void} onDelete @returns {HTMLLIElement} */
  _itemEl(label, lines, onDelete) {
    const item = /** @type {import('./oyl-vault-item.js').OylVaultItem} */ (document.createElement('oyl-vault-item'))
    item.label = label
    item.lines = lines
    item.onDelete = onDelete
    const li = document.createElement('li')
    li.append(item)
    return li
  }
}

/** Register the element (idempotent). */
export function defineVault() {
  if (!customElements.get('oyl-vault')) customElements.define('oyl-vault', OylVault)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-vault.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (expect clean)

```bash
git add apps/vanilla-oyl/src/components/oyl-vault.js apps/vanilla-oyl/src/components/oyl-vault.test.js
git commit -m "feat(vanilla-oyl): oyl-vault screen (upcoming feed + horizon + documents + possessions)"
```

---

## Task 6: Wire-up — data state, nav, route

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.js`
- Modify: `apps/vanilla-oyl/src/main.js`
- Test: `apps/vanilla-oyl/src/state/data.test.js` (add one assertion)

- [ ] **Step 1: Wire the store into `data.js`**

In `apps/vanilla-oyl/src/state/data.js`:

1. Add the import after the planner-store import:
```js
import { createVaultStore } from './vault-store.js'
```
2. Build the store after `const planner = createPlannerStore(repos.plans)`:
```js
const vault = createVaultStore(repos)
```
3. Inside `refresh()`, after `await planner.hydrate()`:
```js
    await vault.hydrate()
```
4. Add `vault` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault }
```

- [ ] **Step 2: Add a data-state assertion**

`data.test.js` already has a `fakeStorage()` helper and uses `createDataState(storage, createThemeState(storage))`. Add a focused test inside the existing `describe('data state', …)` block:
```js
  it('exposes a vault store', () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    expect(typeof ds.vault.hydrate).toBe('function')
    expect(typeof ds.vault.upcoming).toBe('function')
  })
```
(`fakeStorage` and `createThemeState` are already imported in this file — do not add new helpers.)

- [ ] **Step 3: Add the nav item**

In `apps/vanilla-oyl/src/components/oyl-nav.js`, extend `ITEMS`:
```js
const ITEMS = /** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['status', 'Status'],
  ['journal', 'Journal'],
  ['planner', 'Planner'],
  ['vault', 'Vault'],
])
```

- [ ] **Step 4: Define the element + route in `main.js`**

In `apps/vanilla-oyl/src/main.js`:

1. Add the import after `import { definePlanner } from './components/oyl-planner.js'`:
```js
import { defineVault } from './components/oyl-vault.js'
```
2. Call it in the `defineX()` block after `definePlanner()`:
```js
  defineVault()
```
3. Add the route after the `planner:` route in `router.routes`:
```js
    vault: () => {
      const view = /** @type {import('./components/oyl-vault.js').OylVault} */ (document.createElement('oyl-vault'))
      view.store = dataState.vault
      view.tz = defaultTimezone()
      return view
    },
```

- [ ] **Step 5: Run the full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run`
Expected: PASS (100 existing + 19 new ≈ 119 tests, 0 failures).

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: clean (exit 0).

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire Vault — store in data state, nav item, #/vault route"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser pass (real Chrome):** `pnpm vanilla dev` (builds lib + vendors + serves on 8041), open `http://localhost:8041/#/vault`:
  - Click **Status → Load demo data**, return to **Vault**.
  - **Upcoming** feed shows the passport expiry, the espresso warranty, and the subscription renewals; each row reads e.g. "in 2 months" + the ISO date, sorted by date.
  - Switch the horizon **90 → 30 → 365** and confirm the feed re-filters.
  - **Add** a document (name + kind, optional expiry) → it appears under Documents and (if dated within horizon) in Upcoming.
  - **Add** a possession with a price (amount + currency) → appears under Possessions with the formatted price.
  - **Delete** a document and a possession via the inline confirm (Yes/No) → row disappears; No reverts.
  - Toggle a couple of themes (classic/forest × light/dark) and confirm tokens hold.
- [ ] **Final code review** of the whole branch (subagent-driven-development final reviewer), then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** VaultStore (Task 2), format helpers (Task 1), `<oyl-vault-item>` (Task 3), `<oyl-vault-composer>` (Task 4), `<oyl-vault>` with upcoming feed + horizon `<select>` 30/90/365 default 90 + Documents + Possessions (Task 5), nav + `#/vault` route + data wiring (Task 6). All spec sections map to a task.
- **Type consistency:** store methods (`addDocument`/`removeDocument`/`addPossession`/`removePossession`/`documents`/`possessions`/`upcoming`/`hydrate`/`revision`) are used identically across store, screen, and tests. `OylVaultItem` uses `label`/`lines`/`onDelete` (NOT `title`). `inlineConfirm` selectors are `confirm-yes`/`confirm-no` (the shared helper). `Money.fromMajor(major, currency)` and `DayKey.of(value)` / `DayKey.from(now(), tz)` match the real API. `DayRange.of(start, end)` with `end ≥ start` cannot throw.
- **No placeholders:** every code step is complete. The only conditional is Task 6 Step 2 (adapt to the existing `data.test.js` fixtures) — guarded with explicit fallback code.
