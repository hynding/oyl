# vanilla-oyl Vault Slice 3 (Contacts & Gift Ideas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Vault screen — add Contacts (staleness + Log-contact + birthday occasion) and a flat Gift Ideas section — without touching nav, routes, or `data.js`.

**Architecture:** `VaultStore` already hydrates contacts + gift-ideas; this slice exposes `addContact`/`removeContact` (cascade-deletes gift ideas)/`contacts()`/`recordContact` (stateful) and `addGiftIdea`/`removeGiftIdea`/`giftIdeas()`. A new `<oyl-contact-row>` (Log + Delete) mirrors `<oyl-subscription-row>`; a new `<oyl-gift-idea-form>` adds ideas (guarded when no contacts); gift-idea rows reuse `<oyl-vault-item>`. The composer gains a 4th wrapping segment. Renew/record are single-click; delete is inline-confirm.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Contact`/`GiftIdea`/`Cadence`/`DayKey`/`Id`), Slice 1/2 vault patterns + shared `inlineConfirm`.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-vault-contacts-design.md` (refinements R1–R10).

---

## Conventions (carried from Slices 1 & 2)

- `.js` + JSDoc strict + checkJs. **No `innerHTML`** — `createElement`/`textContent`.
- `OylElement` (`this.track`, `this.lifecycle`, `static styles = [sheet(css)]`); idempotent `defineX()`.
- Externally-assigned fields use the double-cast default; callback fields default to no-ops.
- STATIC domain imports. `@oyl/all-of-oyl` resolves to TS source — no build for tests/typecheck.
- ASI/null hazard: named locals with casts (`const b = /** @type {HTMLButtonElement} */ (root.querySelector(...)); b.click()`), never bare `(…).click()`. Indexed access (`list[0]`) is `T | undefined` under strict — cast in tests where needed.
- Shared `inlineConfirm({ mount, prompt, lifecycle, onYes, restore })` → `data-act="confirm-yes"` / `"confirm-no"`.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `components/oyl-contact-row.js`, `components/oyl-gift-idea-form.js` (+ tests).
**Modified:** `vault/format.js`, `state/vault-store.js`, `components/oyl-vault-composer.js`, `components/oyl-vault.js` (+ extend tests).
**Untouched:** `main.js`, `oyl-nav.js`, `state/data.js`, routing.

---

## Task 1: `vault/format.js` — `stalenessLabel`, `monthDayLabel`, shared `relativeSpan`

**Files:** Modify `apps/vanilla-oyl/src/vault/format.js`; test `apps/vanilla-oyl/src/vault/format.test.js`.

- [ ] **Step 1: Add failing tests.** In `format.test.js`, change the import line to:
```js
import { dueInLabel, formatMoney, monthlyTotalLabel, stalenessLabel, monthDayLabel } from './format.js'
```
Append (the file already imports `DayKey`):
```js
describe('stalenessLabel', () => {
  it('phrases never / today / yesterday / longer gaps', () => {
    expect(stalenessLabel(undefined)).toBe('Never contacted')
    expect(stalenessLabel(0)).toBe('Last contacted today')
    expect(stalenessLabel(1)).toBe('Last contacted yesterday')
    expect(stalenessLabel(95)).toBe('Last contacted 3 months ago')
  })
})

describe('monthDayLabel', () => {
  it('formats month and day, ignoring the year', () => {
    expect(monthDayLabel(DayKey.of('1990-06-20'))).toBe('Jun 20')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`stalenessLabel is not a function`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/vault/format.test.js`

- [ ] **Step 3: Implement.** In `apps/vanilla-oyl/src/vault/format.js`:

Replace the `SYMBOLS` line:
```js
const SYMBOLS = /** @type {Record<string, string>} */ ({ USD: '$', EUR: '€', GBP: '£' })
```
with:
```js
const SYMBOLS = /** @type {Record<string, string>} */ ({ USD: '$', EUR: '€', GBP: '£' })
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Magnitude phrase for a positive day count: "5 days" / "3 weeks" / "2 months". @param {number} n @returns {string} */
function relativeSpan(n) {
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`
  if (n < 60) return `${Math.round(n / 7)} weeks`
  return `${Math.round(n / 30)} months`
}
```
Replace the tail of `dueInLabel`:
```js
  const n = Math.abs(days)
  const phrase = n < 14 ? `${n} days` : n < 60 ? `${Math.round(n / 7)} weeks` : `${Math.round(n / 30)} months`
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
```
with:
```js
  const phrase = relativeSpan(Math.abs(days))
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
```
Append at end of file:
```js
/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted". @param {number | undefined} days @returns {string} */
export function stalenessLabel(days) {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${relativeSpan(days)} ago`
}

/** "Jun 20" — month/day only (birthdays ignore the year). @param {DayKey} day @returns {string} */
export function monthDayLabel(day) {
  return `${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}
```

- [ ] **Step 4: Run → PASS** (new + existing `dueInLabel`/`monthlyTotalLabel` regression).
- [ ] **Step 5: Typecheck → clean.** `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/vault/format.js apps/vanilla-oyl/src/vault/format.test.js
git commit -m "feat(vanilla-oyl): vault stalenessLabel + monthDayLabel (shared relativeSpan)"
```

---

## Task 2: `state/vault-store.js` — contact + gift-idea methods (cascade delete)

**Files:** Modify `apps/vanilla-oyl/src/state/vault-store.js`; test `apps/vanilla-oyl/src/state/vault-store.test.js`.

- [ ] **Step 1: Add failing tests.** Extend the import in `vault-store.test.js`:
```js
import { InMemoryRepository, Document, Possession, Subscription, Cadence, Money, DayKey, DayRange, Contact, GiftIdea } from '@oyl/all-of-oyl'
```
Add a helper near the other helpers:
```js
/** @param {string} [name] @param {Record<string, unknown>} [opts] */
const contact = (name = 'Sam', opts = {}) => new Contact({ name, ...opts })
```
Append inside `describe('createVaultStore', …)`:
```js
  it('addContact persists and reflects in contacts()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    await store.addContact(contact())
    expect(store.contacts()).toHaveLength(1)
    expect(await r.contacts.list()).toHaveLength(1)
  })

  it('recordContact sets staleness to 0', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const saved = await store.addContact(contact('Sam', { lastContactedOn: today.addDays(-30) }))
    await store.recordContact(saved.id, today)
    const c = /** @type {Contact} */ (store.contacts()[0])
    expect(c.staleness(today)).toBe(0)
  })

  it('removeContact cascade-deletes only that contact\'s gift ideas', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const a = await store.addContact(contact('A'))
    const b = await store.addContact(contact('B'))
    await store.addGiftIdea(new GiftIdea({ text: 'for A', contactId: a.id }))
    await store.addGiftIdea(new GiftIdea({ text: 'for B', contactId: b.id }))
    await store.removeContact(a.id)
    expect(store.contacts().map((c) => c.name)).toEqual(['B'])
    expect(store.giftIdeas().map((g) => g.text)).toEqual(['for B'])
    expect(await r.giftIdeas.list()).toHaveLength(1)
  })

  it('addGiftIdea / removeGiftIdea / giftIdeas()', async () => {
    const r = repos()
    const store = createVaultStore(r)
    const c = await store.addContact(contact())
    const g = await store.addGiftIdea(new GiftIdea({ text: 'kettle', contactId: c.id }))
    expect(store.giftIdeas()).toHaveLength(1)
    await store.removeGiftIdea(g.id)
    expect(store.giftIdeas()).toHaveLength(0)
  })
```
(`today` and `repos()` already exist in the file.)

- [ ] **Step 2: Run → FAIL** (`store.addContact is not a function`).

- [ ] **Step 3: Implement.** In `apps/vanilla-oyl/src/state/vault-store.js`:

Add typedefs after `/** @typedef {import('@oyl/all-of-oyl').Id} Id */`:
```js
/** @typedef {import('@oyl/all-of-oyl').Contact} Contact */
/** @typedef {import('@oyl/all-of-oyl').GiftIdea} GiftIdea */
```
Insert the WRITE methods into the returned object, right after the `renew` method's closing `},` (the line immediately before `/** @returns {readonly Document[]} */`):
```js
    /** @param {Contact} c @returns {Promise<Contact>} */
    async addContact(c) {
      const saved = await repos.contacts.save(c)
      vault.addContact(saved)
      revision.set((n += 1))
      return saved
    },
    /** Remove a contact and CASCADE-delete its gift ideas (domain Vault doesn't cascade). @param {Id} id */
    async removeContact(id) {
      for (const g of vault.giftIdeasFor(id)) {
        await repos.giftIdeas.delete(g.id)
        vault.removeGiftIdea(g.id)
      }
      await repos.contacts.delete(id)
      vault.removeContact(id)
      revision.set((n += 1))
    },
    /**
     * Record contact (stateful: mutate lastContactedOn in place, persist, re-hydrate —
     * rollback-on-failure, like renew). @param {Id} id @param {DayKey} on
     */
    async recordContact(id, on) {
      const c = vault.contacts().find((x) => x.id === id)
      if (!c) return
      c.recordContact(on)
      try {
        await repos.contacts.save(c)
      } catch (err) {
        await hydrate()
        throw err
      }
      await hydrate()
    },
    /** @param {GiftIdea} g @returns {Promise<GiftIdea>} */
    async addGiftIdea(g) {
      const saved = await repos.giftIdeas.save(g)
      vault.addGiftIdea(saved)
      revision.set((n += 1))
      return saved
    },
    /** @param {Id} id */
    async removeGiftIdea(id) {
      await repos.giftIdeas.delete(id)
      vault.removeGiftIdea(id)
      revision.set((n += 1))
    },
```
Insert the READ methods right after the `monthlySubscriptionTotals()` method's closing `},`:
```js
    /** @returns {readonly Contact[]} */
    contacts() {
      revision.get()
      return vault.contacts()
    },
    /** @returns {readonly GiftIdea[]} */
    giftIdeas() {
      revision.get()
      return vault.giftIdeas()
    },
```

- [ ] **Step 4: Run → PASS** (existing + 4 new).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/vault-store.js apps/vanilla-oyl/src/state/vault-store.test.js
git commit -m "feat(vanilla-oyl): VaultStore contact + gift-idea methods (cascade removeContact)"
```

---

## Task 3: `components/oyl-contact-row.js` — new component

**Files:** Create `apps/vanilla-oyl/src/components/oyl-contact-row.js`; test `apps/vanilla-oyl/src/components/oyl-contact-row.test.js`. Mirrors `oyl-subscription-row.js` (two actions in one `.actions` mount; Log single-click; Delete via `inlineConfirm`).

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-contact-row.test.js`:
```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Contact, Cadence, DayKey } from '@oyl/all-of-oyl'
import { defineContactRow } from './oyl-contact-row.js'

beforeAll(() => defineContactRow())
const today = DayKey.of('2026-06-13')
/** @param {Record<string, unknown>} [opts] */
const mkContact = (opts = {}) => new Contact({
  name: 'Sam', lastContactedOn: today.addDays(-95),
  occasions: [{ name: 'birthday', anchor: DayKey.of('1990-06-20'), cadence: Cadence.of(1, 'years') }],
  ...opts,
})

/** @param {any} contact @param {{ onLog?: (id: any) => void, onDelete?: (id: any) => void }} [h] */
function row(contact, h = {}) {
  const el = /** @type {import('./oyl-contact-row.js').OylContactRow} */ (document.createElement('oyl-contact-row'))
  el.contact = contact
  el.today = today
  el.onLog = h.onLog ?? (() => {})
  el.onDelete = h.onDelete ?? (() => {})
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-contact-row>', () => {
  it('renders name, staleness, and a birthday line', () => {
    const el = row(mkContact())
    const text = root(el).textContent ?? ''
    expect(text).toContain('Sam')
    expect(text).toContain('Last contacted')
    expect(text).toContain('Birthday Jun 20')
    el.remove()
  })

  it('never-contacted shows "Never contacted"', () => {
    const el = row(mkContact({ lastContactedOn: undefined }))
    expect(root(el).textContent ?? '').toContain('Never contacted')
    el.remove()
  })

  it('Log contact calls onLog(id)', () => {
    const onLog = vi.fn()
    const c = mkContact()
    const el = row(c, { onLog })
    const b = /** @type {HTMLButtonElement} */ (root(el).querySelector('button[data-act="log"]'))
    b.click()
    expect(onLog).toHaveBeenCalledWith(c.id)
    el.remove()
  })

  it('Delete uses inline confirm: Yes calls onDelete(id), No reverts', () => {
    const onDelete = vi.fn()
    const c = mkContact()
    const el = row(c, { onDelete })
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
    expect(onDelete).toHaveBeenCalledWith(c.id)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-contact-row.js`:
```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { inlineConfirm } from './confirm.js'
import { stalenessLabel, monthDayLabel } from '../vault/format.js'

/** @typedef {import('@oyl/all-of-oyl').Contact} Contact */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 1fr auto; gap: .25rem 1rem; align-items: start; padding: .85rem 0; }
  .title { color: var(--color-text); }
  .line { color: var(--color-muted); font-size: var(--step--1); margin-block-start: .2rem; }
  .actions { grid-column: 2; align-self: center; display: inline-flex; gap: .2rem; }
  button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; font-size: .85rem; }
  button:hover { background: color-mix(in oklch, var(--color-text) 8%, transparent); color: var(--color-text); }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
`)

export class OylContactRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Contact} */
    this.contact = /** @type {Contact} */ (/** @type {unknown} */ (undefined))
    /** @type {DayKey} */
    this.today = /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onLog = () => {}
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
    title.textContent = this.contact.name
    main.append(title)
    const stale = document.createElement('div')
    stale.className = 'line'
    stale.textContent = stalenessLabel(this.contact.staleness(this.today))
    main.append(stale)
    for (const o of this.contact.occasions) {
      const occ = document.createElement('div')
      occ.className = 'line'
      occ.textContent = `${o.name.charAt(0).toUpperCase()}${o.name.slice(1)} ${monthDayLabel(o.anchor)}`
      main.append(occ)
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
    const log = document.createElement('button')
    log.dataset.act = 'log'
    log.textContent = 'Log contact'
    log.addEventListener('click', () => this.onLog(this.contact.id), { signal: this.lifecycle })
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => {
      inlineConfirm({
        mount,
        prompt: 'Delete?',
        lifecycle: this.lifecycle,
        onYes: () => this.onDelete(this.contact.id),
        restore: () => this._renderActions(mount),
      })
    }, { signal: this.lifecycle })
    mount.append(log, del)
  }
}

/** Register the element (idempotent). */
export function defineContactRow() {
  if (!customElements.get('oyl-contact-row')) customElements.define('oyl-contact-row', OylContactRow)
}
```

- [ ] **Step 4: Run → PASS** (4 tests).
- [ ] **Step 5: Typecheck → clean.** (Confirm `stalenessLabel`/`monthDayLabel` are exported from `../vault/format.js` and `inlineConfirm` matches `oyl-subscription-row.js`.)
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-contact-row.js apps/vanilla-oyl/src/components/oyl-contact-row.test.js
git commit -m "feat(vanilla-oyl): oyl-contact-row (staleness + birthday, Log + inline-confirm Delete)"
```

---

## Task 4: `components/oyl-gift-idea-form.js` — new component

**Files:** Create `apps/vanilla-oyl/src/components/oyl-gift-idea-form.js`; test `apps/vanilla-oyl/src/components/oyl-gift-idea-form.test.js`. Builds DOM once; `track()` only refreshes the contact `<select>` + toggles the guard (R8). Tests use the **real** `createVaultStore` so `revision` reactivity actually drives `track()`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-gift-idea-form.test.js`:
```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Contact, GiftIdea } from '@oyl/all-of-oyl'
import { createVaultStore } from '../state/vault-store.js'
import { defineGiftIdeaForm } from './oyl-gift-idea-form.js'

beforeAll(() => defineGiftIdeaForm())

function realStore() {
  const repos = {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
  return createVaultStore(repos)
}
/** @param {any} store */
function form(store) {
  const el = /** @type {import('./oyl-gift-idea-form.js').OylGiftIdeaForm} */ (document.createElement('oyl-gift-idea-form'))
  el.store = store
  document.body.append(el)
  return el
}
/** @param {any} el @param {string} sel */
const q = (el, sel) => /** @type {any} */ (el.shadowRoot.querySelector(sel))
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('<oyl-gift-idea-form>', () => {
  it('adds a gift idea for the selected contact', async () => {
    const store = realStore()
    const sam = await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'input[name="giftText"]').value = 'kettle'
    q(el, 'select[name="giftContact"]').value = sam.id
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    const ideas = store.giftIdeas()
    expect(ideas).toHaveLength(1)
    expect(ideas[0].text).toBe('kettle')
    expect(ideas[0].contactId).toBe(sam.id)
    el.remove()
  })

  it('empty text shows an error and does not add', async () => {
    const store = realStore()
    await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await settle()
    expect(store.giftIdeas()).toHaveLength(0)
    expect((q(el, '[data-role="error"]').textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })

  it('with no contacts shows the hint and hides the form', async () => {
    const el = form(realStore())
    await settle()
    expect(q(el, '.hint').hidden).toBe(false)
    expect(q(el, 'form').hidden).toBe(true)
    el.remove()
  })

  it('(R8) preserves typed text across a reactive refresh', async () => {
    const store = realStore()
    await store.addContact(new Contact({ name: 'Sam' }))
    const el = form(store)
    await settle()
    q(el, 'input[name="giftText"]').value = 'half-typed'
    await store.addContact(new Contact({ name: 'Alex' })) // bumps revision → form track re-runs
    await settle()
    expect(q(el, 'input[name="giftText"]').value).toBe('half-typed')
    expect(q(el, 'select[name="giftContact"]').options).toHaveLength(2)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-gift-idea-form.js`:
```js
import { GiftIdea, Id } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {ReturnType<typeof import('../state/vault-store.js').createVaultStore>} VaultStore */

const styles = sheet(`
  form { display: grid; grid-template-columns: 1fr auto auto; gap: .5rem; align-items: start; }
  input, select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .5rem .6rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1rem; font: inherit; font-weight: 600; cursor: pointer; }
  .hint { color: var(--color-muted); font-size: var(--step--1); padding: .5rem 0; }
  [data-role="error"]:not(:empty) { grid-column: 1 / -1; color: var(--color-danger); font-size: .85rem; }
`)

export class OylGiftIdeaForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {VaultStore} */
    this.store = /** @type {VaultStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onAdded = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = 'Add a contact first.'

    const formEl = document.createElement('form')
    const text = document.createElement('input')
    text.name = 'giftText'
    text.type = 'text'
    text.placeholder = 'Gift idea'
    const select = document.createElement('select')
    select.name = 'giftContact'
    select.setAttribute('aria-label', 'Contact')
    const add = document.createElement('button')
    add.type = 'submit'
    add.className = 'primary'
    add.textContent = 'Add'
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')
    formEl.append(text, select, add, error)

    root.append(hint, formEl)

    formEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      error.textContent = ''
      try {
        const idea = new GiftIdea({ text: text.value, contactId: Id.of(select.value) })
        await this.store.addGiftIdea(idea)
        text.value = ''
        this.onAdded()
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : String(err)
      }
    }, { signal: this.lifecycle })

    // R8: build DOM once; only refresh the <select> options + toggle the guard here.
    this.track(() => {
      const contacts = this.store.contacts()
      const has = contacts.length > 0
      hint.hidden = has
      formEl.hidden = !has
      const prev = select.value
      select.replaceChildren()
      for (const c of contacts) {
        const o = document.createElement('option')
        o.value = c.id
        o.textContent = c.name
        select.append(o)
      }
      if (contacts.some((c) => c.id === prev)) select.value = prev
    })
  }
}

/** Register the element (idempotent). */
export function defineGiftIdeaForm() {
  if (!customElements.get('oyl-gift-idea-form')) customElements.define('oyl-gift-idea-form', OylGiftIdeaForm)
}
```

- [ ] **Step 4: Run → PASS** (4 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-gift-idea-form.js apps/vanilla-oyl/src/components/oyl-gift-idea-form.test.js
git commit -m "feat(vanilla-oyl): oyl-gift-idea-form (guarded, text-preserving across refresh)"
```

---

## Task 5: `components/oyl-vault-composer.js` — 4th Contact segment (+ R10 price fix)

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-vault-composer.js`; test `apps/vanilla-oyl/src/components/oyl-vault-composer.test.js`.

- [ ] **Step 1: Add failing tests.** Extend the import to add `Contact`:
```js
import { Document, Possession, Subscription, Contact } from '@oyl/all-of-oyl'
```
Extend the `composer` helper JSDoc:
```js
/** @param {{ addDocument?: (d: any) => Promise<any>, addPossession?: (p: any) => Promise<any>, addSubscription?: (s: any) => Promise<any>, addContact?: (c: any) => Promise<any> }} store */
```
Append inside `describe('<oyl-vault-composer>', …)`:
```js
  it('adds a contact with a birthday occasion and last-contacted', async () => {
    const added = /** @type {any[]} */ ([])
    const el = composer({ addContact: async (c) => { added.push(c); return c } })
    q(el, 'button[data-type="contact"]').click()
    q(el, 'input[name="name"]').value = 'Sam'
    q(el, 'input[name="birthday"]').value = '1990-06-20'
    q(el, 'input[name="lastContacted"]').value = '2026-03-01'
    submit(el)
    await Promise.resolve(); await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Contact)
    expect(added[0].name).toBe('Sam')
    expect(added[0].lastContactedOn?.value).toBe('2026-03-01')
    expect(added[0].occasions).toHaveLength(1)
    expect(added[0].occasions[0].name).toBe('birthday')
    expect(added[0].occasions[0].anchor.value).toBe('1990-06-20')
    el.remove()
  })

  it('toggling to Contact shows birthday/last-contacted and hides other fields incl. price (R10)', () => {
    const el = composer({})
    q(el, 'button[data-type="contact"]').click()
    expect(q(el, 'input[name="birthday"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="lastContacted"]').closest('.field').hidden).toBe(false)
    expect(q(el, 'input[name="kind"]').closest('.field').hidden).toBe(true)
    expect(q(el, 'input[name="amount"]').closest('.field').hidden).toBe(true) // R10: price hidden in contact mode
    expect(q(el, 'input[name="cadenceN"]').closest('.field').hidden).toBe(true)
    el.remove()
  })
```

- [ ] **Step 2: Run → FAIL** (no `button[data-type="contact"]`).

- [ ] **Step 3: Implement** — these edits to `apps/vanilla-oyl/src/components/oyl-vault-composer.js`:

**3a.** Import — replace `import { Document, Possession, Subscription, Money, Cadence, DayKey } from '@oyl/all-of-oyl'` with:
```js
import { Document, Possession, Subscription, Contact, Money, Cadence, DayKey } from '@oyl/all-of-oyl'
```
**3b.** Segment wraps — replace the `.seg { display: inline-flex; …` rule's opening with `display: inline-flex; flex-wrap: wrap;`:
```js
  .seg { display: inline-flex; flex-wrap: wrap; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
```
**3c.** Add the Contact segment button — replace:
```js
    seg.append(docBtn, posBtn, subBtn)
```
with:
```js
    const contactBtn = document.createElement('button')
    contactBtn.type = 'button'
    contactBtn.dataset.type = 'contact'
    contactBtn.textContent = 'Contact'
    seg.append(docBtn, posBtn, subBtn, contactBtn)
```
**3d.** Contact fields — immediately after the line `    const categoryField = this._labeled('category', 'Category', category)`, insert:
```js

    // Contact-only fields
    const birthday = this._input('birthday', 'date')
    const lastContacted = this._input('lastContacted', 'date')
    const birthdayField = this._labeled('birthday', 'Birthday (optional)', birthday)
    const lastContactedField = this._labeled('lastContacted', 'Last contacted (optional)', lastContacted)
```
**3e.** Append the fields — replace:
```js
      cadenceField, anchorField, categoryField,
      error, actions,
```
with:
```js
      cadenceField, anchorField, categoryField,
      birthdayField, lastContactedField,
      error, actions,
```
**3f.** `applyType` (+ R10 price fix) — replace the whole `applyType` definition and the three button listeners:
```js
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
with:
```js
    const priceLabel = /** @type {HTMLLabelElement} */ (priceField.querySelector('label'))
    /** @param {string} type */
    const applyType = (type) => {
      const isDoc = type === 'document'
      const isPos = type === 'possession'
      const isSub = type === 'subscription'
      const isContact = type === 'contact'
      kindField.hidden = !isDoc
      expiresField.hidden = !isDoc
      locationField.hidden = !isPos
      warrantyField.hidden = !isPos
      purchasedField.hidden = !isPos
      priceField.hidden = !(isPos || isSub) // shared by possession + subscription; hidden for doc + contact
      priceLabel.textContent = isSub ? 'Amount' : 'Price (optional)'
      cadenceField.hidden = !isSub
      anchorField.hidden = !isSub
      categoryField.hidden = !isSub
      birthdayField.hidden = !isContact
      lastContactedField.hidden = !isContact
      docBtn.setAttribute('aria-pressed', String(isDoc))
      posBtn.setAttribute('aria-pressed', String(isPos))
      subBtn.setAttribute('aria-pressed', String(isSub))
      contactBtn.setAttribute('aria-pressed', String(isContact))
    }
    applyType(this._type.get())
    docBtn.addEventListener('click', () => { this._type.set('document'); applyType('document') }, { signal: this.lifecycle })
    posBtn.addEventListener('click', () => { this._type.set('possession'); applyType('possession') }, { signal: this.lifecycle })
    subBtn.addEventListener('click', () => { this._type.set('subscription'); applyType('subscription') }, { signal: this.lifecycle })
    contactBtn.addEventListener('click', () => { this._type.set('contact'); applyType('contact') }, { signal: this.lifecycle })
```
**3g.** Submit ctx — replace the `void this._submit({ … formEl })` line with:
```js
      void this._submit({ error, name, kind, expiresOn, location, warrantyUntil, amount, currency, purchasedOn, cadenceN, cadenceUnit, anchor, category, birthday, lastContacted, formEl })
```
**3h.** `_submit` jsdoc — replace:
```js
   *   cadenceUnit: HTMLSelectElement, anchor: HTMLInputElement, category: HTMLSelectElement,
   *   formEl: HTMLFormElement }} ctx
```
with:
```js
   *   cadenceUnit: HTMLSelectElement, anchor: HTMLInputElement, category: HTMLSelectElement,
   *   birthday: HTMLInputElement, lastContacted: HTMLInputElement, formEl: HTMLFormElement }} ctx
```
**3i.** `_submit` branch — replace the subscription `} else {` block:
```js
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
```
with:
```js
      } else if (this._type.get() === 'subscription') {
        const sub = new Subscription({
          name: ctx.name.value,
          amount: Money.fromMajor(Number(ctx.amount.value), ctx.currency.value),
          cadence: Cadence.of(Number(ctx.cadenceN.value), /** @type {any} */ (ctx.cadenceUnit.value)),
          anchor: DayKey.of(ctx.anchor.value),
          category: ctx.category.value,
        })
        await this.store.addSubscription(sub)
      } else {
        const props = /** @type {{ name: string, lastContactedOn?: DayKey, occasions?: { name: string, anchor: DayKey, cadence: Cadence }[] }} */ ({ name: ctx.name.value })
        if (ctx.lastContacted.value) props.lastContactedOn = DayKey.of(ctx.lastContacted.value)
        if (ctx.birthday.value) props.occasions = [{ name: 'birthday', anchor: DayKey.of(ctx.birthday.value), cadence: Cadence.of(1, 'years') }]
        await this.store.addContact(new Contact(props))
      }
```

- [ ] **Step 4: Run → PASS** (existing 7 + 2 new). The R10 test (price hidden in contact mode) guards the latent bug.
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-vault-composer.js apps/vanilla-oyl/src/components/oyl-vault-composer.test.js
git commit -m "feat(vanilla-oyl): vault composer Contact segment (birthday occasion; R10 price-hide fix)"
```

---

## Task 6: `components/oyl-vault.js` — Contacts + Gift Ideas sections

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-vault.js`; test `apps/vanilla-oyl/src/components/oyl-vault.test.js`.

**Important:** gift-idea rows reuse `<oyl-vault-item>`, so the existing test's `oyl-vault-item` count assertion would break if gift ideas were added to the shared `seededStore`. Seed contacts/gift-ideas in a **separate** `contactStore()` fixture and leave `seededStore` untouched.

- [ ] **Step 1: Add failing tests.** Extend the import:
```js
import { InMemoryRepository, Document, Possession, Subscription, Contact, GiftIdea, Cadence, Money, DayKey } from '@oyl/all-of-oyl'
```
Add a fixture + a settle helper (after the existing `seededStore`):
```js
/** A store seeded with one contact (Sam) + one gift idea for Sam. Kept separate from
 *  seededStore so gift-idea <oyl-vault-item>s don't perturb that fixture's item count. */
async function contactStore() {
  const repos = {
    documents: /** @type {any} */ (new InMemoryRepository()),
    possessions: /** @type {any} */ (new InMemoryRepository()),
    subscriptions: /** @type {any} */ (new InMemoryRepository()),
    contacts: /** @type {any} */ (new InMemoryRepository()),
    giftIdeas: /** @type {any} */ (new InMemoryRepository()),
  }
  const sam = new Contact({ name: 'Sam', lastContactedOn: today().addDays(-95), occasions: [{ name: 'birthday', anchor: DayKey.of('1990-06-20'), cadence: Cadence.of(1, 'years') }] })
  await repos.contacts.save(sam)
  await repos.giftIdeas.save(new GiftIdea({ text: 'kettle', contactId: sam.id }))
  const store = createVaultStore(/** @type {any} */ (repos))
  await store.hydrate()
  return store
}
const settle = () => new Promise((r) => setTimeout(r, 0))
```
Append inside `describe('<oyl-vault>', …)`:
```js
  it('renders the Contacts section with staleness and the Gift ideas section', async () => {
    const el = screen(await contactStore())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Contacts')
    expect(text).toContain('Sam')
    expect(text).toContain('Last contacted')
    expect(text).toContain('Gift ideas')
    expect(text).toContain('kettle')
    expect(text).toContain('For Sam')
    expect(root(el).querySelectorAll('oyl-contact-row')).toHaveLength(1)
    el.remove()
  })

  it('Log contact advances staleness; deleting a contact cascades to its gift idea', async () => {
    const el = screen(await contactStore())
    await Promise.resolve()
    const crow = /** @type {any} */ (root(el).querySelector('oyl-contact-row'))
    const logBtn = /** @type {HTMLButtonElement} */ (crow.shadowRoot.querySelector('button[data-act="log"]'))
    logBtn.click()
    await settle()
    const crowAfter = /** @type {any} */ (root(el).querySelector('oyl-contact-row'))
    expect(crowAfter.shadowRoot.textContent).toContain('Last contacted today')

    const delBtn = /** @type {HTMLButtonElement} */ (crowAfter.shadowRoot.querySelector('button[data-act="delete"]'))
    delBtn.click()
    const yes = /** @type {HTMLButtonElement} */ (crowAfter.shadowRoot.querySelector('button[data-act="confirm-yes"]'))
    yes.click()
    await settle()
    const text = root(el).textContent ?? ''
    expect(text).not.toContain('Sam')
    expect(text).not.toContain('kettle') // cascade-deleted with the contact
    el.remove()
  })
```

- [ ] **Step 2: Run → FAIL** (no Contacts/Gift ideas sections).

- [ ] **Step 3: Implement** — edits to `apps/vanilla-oyl/src/components/oyl-vault.js`:

**3a.** Imports — after the `defineSubscriptionRow` import add:
```js
import { defineContactRow } from './oyl-contact-row.js'
import { defineGiftIdeaForm } from './oyl-gift-idea-form.js'
```
**3b.** Style — after the `.monthly-total { … }` rule add:
```js
  oyl-gift-idea-form { display: block; margin: .4rem 0 .8rem; }
```
**3c.** Registrars — replace:
```js
    defineVaultComposer()
    defineVaultItem()
    defineSubscriptionRow()
```
with:
```js
    defineVaultComposer()
    defineVaultItem()
    defineSubscriptionRow()
    defineContactRow()
    defineGiftIdeaForm()
```
**3d.** Section elements — immediately after the subscriptions elements block (after `const subsEmpty = document.createElement('div')` / `subsEmpty.className = 'empty'`), insert:
```js

    const conLabel = document.createElement('div')
    conLabel.className = 'section-label'
    conLabel.textContent = 'Contacts'
    const conList = document.createElement('ol')
    const conEmpty = document.createElement('div')
    conEmpty.className = 'empty'

    const giftLabel = document.createElement('div')
    giftLabel.className = 'section-label'
    giftLabel.textContent = 'Gift ideas'
    const giftForm = /** @type {import('./oyl-gift-idea-form.js').OylGiftIdeaForm} */ (document.createElement('oyl-gift-idea-form'))
    giftForm.store = this.store
    giftForm.onAdded = () => { live.textContent = 'Gift idea added' }
    const giftList = document.createElement('ol')
    const giftEmpty = document.createElement('div')
    giftEmpty.className = 'empty'
```
**3e.** `root.append(...)` — replace the existing append line with the same nodes plus the new ones:
```js
    root.append(h2, live, composer, upHead, upList, upEmpty, docLabel, docList, docEmpty, posLabel, posList, posEmpty, subHead, subsList, subsEmpty, conLabel, conList, conEmpty, giftLabel, giftForm, giftList, giftEmpty)
```
**3f.** Repaint — at the END of the `this.track(() => { … })` callback, immediately before its closing `})` (after the `subsEmpty.textContent = …` line), insert (reusing the `today` already declared above in the subscriptions block):
```js

      const contacts = this.store.contacts()
      conList.replaceChildren()
      for (const c of contacts) {
        const crow = /** @type {import('./oyl-contact-row.js').OylContactRow} */ (document.createElement('oyl-contact-row'))
        crow.contact = c
        crow.today = today
        crow.onLog = (id) => { void this.store.recordContact(id, today); live.textContent = 'Logged' }
        crow.onDelete = (id) => { void this.store.removeContact(id); live.textContent = 'Deleted' }
        const li = document.createElement('li')
        li.append(crow)
        conList.append(li)
      }
      conEmpty.hidden = contacts.length > 0
      conEmpty.textContent = conEmpty.hidden ? '' : 'No contacts yet.'

      const nameById = new Map(contacts.map((c) => [c.id, c.name]))
      const ideas = this.store.giftIdeas()
      giftList.replaceChildren()
      for (const g of ideas) {
        giftList.append(this._itemEl(g.text, [`For ${nameById.get(g.contactId) ?? 'Unknown contact'}`], () => { void this.store.removeGiftIdea(g.id); live.textContent = 'Deleted' }))
      }
      giftEmpty.hidden = ideas.length > 0
      giftEmpty.textContent = giftEmpty.hidden ? '' : 'No gift ideas yet.'
```

- [ ] **Step 4: Run → PASS** (existing 6 + 2 new). Then full suite: `pnpm --filter @oyl/vanilla-oyl exec vitest run` — report the total.
- [ ] **Step 5: Typecheck → clean.** `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-vault.js apps/vanilla-oyl/src/components/oyl-vault.test.js
git commit -m "feat(vanilla-oyl): vault screen Contacts + Gift Ideas sections"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green: 136 prior + ~20 new ≈ 156) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload** the tab so updated modules load), open `#/vault`, Load demo data:
  - **Contacts** lists **Sam** with a "Last contacted … months ago" line + "Birthday Jun 20"; **Log contact** flips it to "Last contacted today".
  - **Gift ideas** lists "kettle / For Sam".
  - Add a contact (Contact segment: name + birthday) → appears in Contacts and (birthday) in the Upcoming feed; add a gift idea for them via the section form → appears under Gift ideas.
  - **Delete Sam** → Sam *and* "kettle" disappear (cascade); with no contacts, the gift-idea form shows "Add a contact first".
- [ ] **Final code review** of the branch (subagent-driven-development final reviewer), then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** `stalenessLabel`/`monthDayLabel`/`relativeSpan` (T1); store add/remove(cascade)/contacts/recordContact + gift-idea methods (T2); `<oyl-contact-row>` (T3); `<oyl-gift-idea-form>` build-once+R8 (T4); composer 4th segment + R10 price fix + R6 wrap (T5); Contacts + Gift Ideas sections + cascade end-to-end (T6). R1 (cascade), R2 (row = staleness + static birthday, no relative occasion), R3 (shared relativeSpan), R4 (guard), R5 (no last-contacted default), R7 (recordContact stateful), R8/R9/R10 all covered.
- **Type consistency:** store methods used identically across store/screen/tests. Row props `contact`/`today`/`onLog`/`onDelete`. `Contact`/`GiftIdea`/`Cadence.of(1,'years')`/`Id.of` match the real API. `inlineConfirm` selectors `confirm-yes`/`confirm-no`.
- **Test fixtures:** `contactStore()` is separate from `seededStore()` so gift-idea `oyl-vault-item`s don't break the existing "2 items" assertion; the gift-idea-form test uses the **real** `createVaultStore` so `revision` reactivity drives `track()` (a plain fake `contacts()` wouldn't); a `settle()` (`setTimeout(0)`) flushes the async record/delete → re-hydrate → repaint chain before DOM assertions.
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
