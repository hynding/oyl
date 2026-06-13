# vanilla-oyl Journal Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Journal "Today" screen for `apps/vanilla-oyl` — log/review notes & measurements for a day, with day navigation and inline delete — on a reusable `JournalStore` that resolves repository↔aggregate write-path coherence.

**Architecture:** An app-level `JournalStore` wraps the entries `Repository` + an in-memory domain `Journal`, with persist-first surgical writes and a `revision` signal for reactivity (full re-hydrate only on boot/seed/import/multi-tab). Web Components (`<oyl-nav>`, `<oyl-journal>`, `<oyl-log-form>`, `<oyl-entry-row>`) on the existing `OylElement` base render the screen; a `#/journal` route and shell `nav` slot wire it in.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`Journal`/`Note`/`Measurement`/`DayKey`/`InMemoryRepository`), the foundation's signals reactive core + Web Component base.

**Spec:** `docs/superpowers/specs/2026-06-13-vanilla-oyl-journal-screen-design.md`

---

## Conventions carried from the foundation (apply throughout)

- Run app tests scoped: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Full: `pnpm --filter @oyl/vanilla-oyl exec vitest run`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- App code is `.js` + JSDoc under strict + checkJs. **No `innerHTML`** — build DOM with `createElement`/`textContent`.
- Web Components extend `OylElement` (shadow root; `this.track(fn)` reactive effect auto-disposed on disconnect; `this.lifecycle` AbortSignal for `addEventListener`; `static styles = [sheet(css)]`). Register via idempotent `defineX()` guarded by `customElements.get(name)`.
- **Externally-assigned component fields** (set by the host before connect) use the constructor double-cast idiom to satisfy `strictPropertyInitialization`:
  `this.prop = /** @type {T} */ (/** @type {unknown} */ (undefined))`.
- Test fakes for `Storage` need JSDoc `@param` annotations on their methods (strict `noImplicitAny`).
- `@oyl/all-of-oyl` resolves to TS source in tests/typecheck (no build needed); the browser uses the vendored `dist/` (already built).

## File structure

**New (`apps/vanilla-oyl/src/`):**
- `state/journal-store.js` — `createJournalStore(entriesRepo, tz)` (the write-path).
- `journal/format.js` — pure display helpers (day heading, relative label, clock time, measurement unit).
- `components/oyl-nav.js` — shared header nav.
- `components/oyl-entry-row.js` — one entry + inline-confirm delete.
- `components/oyl-log-form.js` — the composer (note/measurement).
- `components/oyl-journal.js` — the screen container.
- Matching `*.test.js` for each (except `main.js`).

**Modified:**
- `state/data.js` — build the journal store, hydrate it in `refresh()`.
- `components/oyl-shell.js` — add a `nav` slot in the header.
- `main.js` — define the new elements, mount `<oyl-nav>`, add the `#/journal` route.

---

# Phase 1 — JournalStore (the write-path)

### Task 1: `createJournalStore`

**Files:**
- Create: `apps/vanilla-oyl/src/state/journal-store.test.js`
- Create: `apps/vanilla-oyl/src/state/journal-store.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/state/journal-store.test.js`:

```js
import { describe, expect, it, vi } from 'vitest'
import { InMemoryRepository, Note, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from './journal-store.js'
import { effect } from '../lib/reactive/effect.js'

const TZ = 'America/New_York'
const ISO = '2026-06-10T16:00:00Z' // 12:00 EDT → June 10 in TZ
const dayOf = () => DayKey.from(new Date(ISO), TZ)
const aNote = (text = 'hello') => new Note({ occurredAt: new Date(ISO), text })

describe('createJournalStore', () => {
  it('add persists to the repo, reflects in entriesOn, and bumps revision', async () => {
    const repo = new InMemoryRepository()
    const store = createJournalStore(repo, TZ)
    const before = store.revision.get()
    const saved = await store.add(aNote())
    expect(saved.meta?.revision).toBe(1) // repo stamped it
    expect(store.entriesOn(dayOf())).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    expect(store.revision.get()).toBeGreaterThan(before)
  })

  it('persist-first: a failing save leaves the Journal untouched and rethrows', async () => {
    const repo = {
      save: async () => { throw new Error('quota') },
      delete: async () => {},
      list: async () => [],
      get: async () => undefined,
      purge: async () => {},
    }
    const store = createJournalStore(repo, TZ)
    await expect(store.add(aNote())).rejects.toThrow('quota')
    expect(store.entriesOn(dayOf())).toHaveLength(0)
  })

  it('remove deletes from the repo and the aggregate', async () => {
    const repo = new InMemoryRepository()
    const store = createJournalStore(repo, TZ)
    const saved = await store.add(aNote())
    await store.remove(saved.id)
    expect(store.entriesOn(dayOf())).toHaveLength(0)
    expect(await repo.list()).toHaveLength(0) // soft-deleted → excluded from list()
  })

  it('hydrate rebuilds the aggregate from the repo', async () => {
    const repo = new InMemoryRepository()
    await repo.save(aNote('one'))
    await repo.save(new Note({ occurredAt: new Date(ISO), text: 'two' }))
    const store = createJournalStore(repo, TZ)
    expect(store.entriesOn(dayOf())).toHaveLength(0) // not hydrated yet
    await store.hydrate()
    expect(store.entriesOn(dayOf())).toHaveLength(2)
  })

  it('an effect reading entriesOn re-runs when a mutation bumps revision', async () => {
    const repo = new InMemoryRepository()
    const store = createJournalStore(repo, TZ)
    const seen = /** @type {number[]} */ ([])
    effect(() => seen.push(store.entriesOn(dayOf()).length))
    await store.add(aNote())
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run journal-store`
Expected: FAIL — cannot resolve `./journal-store.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/state/journal-store.js`:

```js
import { Journal } from '@oyl/all-of-oyl'
import { signal } from '../lib/reactive/signal.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */
/** @typedef {import('@oyl/all-of-oyl').Repository<Entry>} EntriesRepo */

/**
 * App-level reactive wrapper over the entries Repository + an in-memory domain Journal.
 * Persist-first surgical writes; a `revision` signal makes reads reactive. The domain
 * Journal stays a plain aggregate. Full re-hydrate only on boot/seed/import/multi-tab.
 * @param {EntriesRepo} entriesRepo
 * @param {string} tz  IANA timezone
 */
export function createJournalStore(entriesRepo, tz) {
  let journal = new Journal(tz)
  let n = 0
  const revision = signal(0)

  return {
    revision,

    /** Persist an entry, then reflect it in the aggregate. @param {Entry} entry @returns {Promise<Entry>} */
    async add(entry) {
      const saved = await entriesRepo.save(entry) // throws before the Journal is touched
      journal.add(saved)
      revision.set((n += 1))
      return saved
    },

    /** Soft-delete an entry and drop it from the aggregate (idempotent). @param {Id} id */
    async remove(id) {
      await entriesRepo.delete(id)
      journal.remove(id)
      revision.set((n += 1))
    },

    /** The day's entries (auto-tracks revision, so effects re-run on any mutation). @param {DayKey} day @returns {readonly Entry[]} */
    entriesOn(day) {
      revision.get()
      return journal.entriesOn(day)
    },

    /** Rebuild the aggregate from the repository. Boot/seed/import/multi-tab only. */
    async hydrate() {
      const fresh = new Journal(tz)
      for (const e of await entriesRepo.list()) fresh.add(e)
      journal = fresh
      revision.set((n += 1))
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run journal-store`
Expected: PASS — 5 cases.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: exit 0. (If `Repository<Entry>` isn't exported as a usable type, fall back to typing `entriesRepo` as `import('@oyl/all-of-oyl').LocalStorageRepository<any>` — both satisfy the `save/delete/list` calls.)

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js
git commit -m "feat(vanilla-oyl): JournalStore — persist-first repo↔Journal write-path with revision signal"
```

---

# Phase 2 — data.js wiring

### Task 2: Build the journal store in `createDataState` + hydrate on refresh

**Files:**
- Modify: `apps/vanilla-oyl/src/state/data.js`
- Modify: `apps/vanilla-oyl/src/state/data.test.js`

- [ ] **Step 1: Add the failing test**

Append to `apps/vanilla-oyl/src/state/data.test.js` (inside the existing `describe('data state', ...)` block; add imports `Note`, `DayKey` from `@oyl/all-of-oyl` and `defaultTimezone` from `../storage/clock.js` at the top):

```js
  it('exposes a journal store hydrated from the entries repo on refresh', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.entries.save(new Note({ occurredAt: new Date(iso), text: 'hi' }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    expect(ds.journal.entriesOn(day)).toHaveLength(1)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run state/data`
Expected: FAIL — `ds.journal` is undefined.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/state/data.js`:

Add imports near the top:
```js
import { createJournalStore } from './journal-store.js'
import { defaultTimezone } from '../storage/clock.js'
```

Inside `createDataState`, after `const repos = makeRepositories(storage)`, add:
```js
  const journal = createJournalStore(repos.entries, defaultTimezone())
```

In `refresh()`, after `counts.set(await collectionCounts(repos))`, add:
```js
    await journal.hydrate()
```

Add `journal` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run state/data`
Expected: PASS (the new case + the existing data-state case).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: all PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): build + hydrate the journal store in data state"
```

---

# Phase 3 — pure display helpers

### Task 3: `journal/format.js`

**Files:**
- Create: `apps/vanilla-oyl/src/journal/format.test.js`
- Create: `apps/vanilla-oyl/src/journal/format.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/journal/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { relativeDayLabel, formatDayHeading, formatClockTime, measurementUnit } from './format.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('journal format helpers', () => {
  it('relativeDayLabel: today/yesterday/tomorrow else empty', () => {
    const today = DayKey.of('2026-06-10')
    expect(relativeDayLabel(today, today)).toBe('Today')
    expect(relativeDayLabel(today.addDays(-1), today)).toBe('Yesterday')
    expect(relativeDayLabel(today.addDays(1), today)).toBe('Tomorrow')
    expect(relativeDayLabel(today.addDays(-3), today)).toBe('')
  })

  it('formatDayHeading: "Weekday, Mon D"', () => {
    const day = DayKey.of('2026-06-10')
    expect(formatDayHeading(day)).toBe(`${WEEKDAYS[day.weekday() - 1]}, Jun 10`)
  })

  it('formatClockTime: HH:MM-ish from a Date', () => {
    expect(formatClockTime(new Date('2026-06-10T08:05:00'))).toMatch(/\d{1,2}:\d{2}/)
  })

  it('measurementUnit: known keys map to a unit, unknown to empty', () => {
    expect(measurementUnit('body.weight_kg')).toBe('kg')
    expect(measurementUnit('sleep.hours')).toBe('h')
    expect(measurementUnit('screen.minutes')).toBe('min')
    expect(measurementUnit('mood.score')).toBe('')
    expect(measurementUnit('custom.whatever')).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run journal/format`
Expected: FAIL — cannot resolve `./format.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/journal/format.js`:

```js
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today"/"Yesterday"/"Tomorrow" relative to `today`, else "". @param {DayKey} day @param {DayKey} today @returns {string} */
export function relativeDayLabel(day, today) {
  if (day.equals(today)) return 'Today'
  if (day.equals(today.addDays(-1))) return 'Yesterday'
  if (day.equals(today.addDays(1))) return 'Tomorrow'
  return ''
}

/** "Wednesday, Jun 10" from a DayKey (value is "YYYY-MM-DD"). @param {DayKey} day @returns {string} */
export function formatDayHeading(day) {
  const parts = day.value.split('-')
  const month = Number(parts[1])
  const dom = Number(parts[2])
  return `${WEEKDAYS[day.weekday() - 1]}, ${MONTHS[month - 1]} ${dom}`
}

/** Locale clock time (HH:MM) for an instant. @param {Date} date @returns {string} */
export function formatClockTime(date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Display unit for known measurement metric keys ("" when unknown). @param {string} metric @returns {string} */
export function measurementUnit(metric) {
  const units = /** @type {Record<string, string>} */ ({
    'body.weight_kg': 'kg',
    'sleep.hours': 'h',
    'screen.minutes': 'min',
  })
  return units[metric] ?? ''
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run journal/format`
Expected: PASS — 4 cases. (`day.value` and `day.weekday()` are existing DayKey members.)

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/journal/format.js apps/vanilla-oyl/src/journal/format.test.js
git commit -m "feat(vanilla-oyl): pure journal display helpers (day label, heading, time, unit)"
```

---

# Phase 4 — navigation

### Task 4: `<oyl-nav>` + shell `nav` slot

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-nav.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-nav.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.test.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-nav.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { signal } from '../lib/reactive/signal.js'
import { defineNav } from './oyl-nav.js'

beforeAll(() => defineNav())

describe('<oyl-nav>', () => {
  it('marks the active route and updates when the route changes', async () => {
    const route = signal('status')
    const el = /** @type {import('./oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
    el.routeSignal = route
    document.body.append(el)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    const statusLink = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="status"]'))
    const journalLink = /** @type {HTMLAnchorElement} */ (root.querySelector('a[data-route="journal"]'))
    expect(statusLink.getAttribute('aria-current')).toBe('page')
    expect(journalLink.hasAttribute('aria-current')).toBe(false)
    expect(journalLink.getAttribute('href')).toBe('#/journal')

    route.set('journal')
    await Promise.resolve()
    expect(journalLink.getAttribute('aria-current')).toBe('page')
    expect(statusLink.hasAttribute('aria-current')).toBe(false)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-nav`
Expected: FAIL — cannot resolve `./oyl-nav.js`.

- [ ] **Step 3: Implement `<oyl-nav>`**

Create `apps/vanilla-oyl/src/components/oyl-nav.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string>} RouteSignal */

const ITEMS = /** @type {ReadonlyArray<[string, string]>} */ ([
  ['status', 'Status'],
  ['journal', 'Journal'],
])

const styles = sheet(`
  nav { display: flex; gap: .25rem; }
  a {
    text-decoration: none; color: var(--color-muted); font-weight: 550;
    padding: .35rem .7rem; border-radius: 999px; min-block-size: 44px;
    display: inline-flex; align-items: center;
  }
  a:hover { color: var(--color-text); }
  a[aria-current] { color: var(--color-text); background: color-mix(in oklch, var(--color-accent) 14%, transparent); }
`)

export class OylNav extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {RouteSignal} */
    this.routeSignal = /** @type {RouteSignal} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const nav = document.createElement('nav')
    nav.setAttribute('aria-label', 'Primary')
    const links = ITEMS.map(([route, label]) => {
      const a = document.createElement('a')
      a.href = `#/${route}`
      a.textContent = label
      a.dataset.route = route
      nav.append(a)
      return a
    })
    root.append(nav)
    this.track(() => {
      const active = this.routeSignal.get()
      for (const a of links) {
        if (a.dataset.route === active) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
      }
    })
  }
}

/** Register the element (idempotent). */
export function defineNav() {
  if (!customElements.get('oyl-nav')) customElements.define('oyl-nav', OylNav)
}
```

- [ ] **Step 4: Add the `nav` slot to the shell**

In `apps/vanilla-oyl/src/components/oyl-shell.js`, in `render()`, create a nav slot and include it in the header (between `h1` and `toolbar`). Replace the header-assembly lines so they read:

```js
    const header = document.createElement('header')
    const h1 = document.createElement('h1')
    h1.textContent = 'OYL'
    const navSlot = document.createElement('slot')
    navSlot.setAttribute('name', 'nav')
    const toolbar = document.createElement('slot')
    toolbar.setAttribute('name', 'toolbar')
    header.append(h1, navSlot, toolbar)
```

(The `main` slot and the rest of `render()` stay unchanged.)

- [ ] **Step 5: Update the shell test for the nav slot**

In `apps/vanilla-oyl/src/components/oyl-shell.test.js`, add one assertion inside the existing render test, after the toolbar-slot assertion:

```js
    expect(root.querySelector('slot[name="nav"]')).toBeTruthy()
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-nav oyl-shell`
Expected: PASS — nav (1) + shell (1, now asserting the nav slot).

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0), then:

```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/components/oyl-nav.test.js apps/vanilla-oyl/src/components/oyl-shell.js apps/vanilla-oyl/src/components/oyl-shell.test.js
git commit -m "feat(vanilla-oyl): <oyl-nav> + shell nav slot"
```

---

# Phase 5 — entry row

### Task 5: `<oyl-entry-row>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-entry-row.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-entry-row.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-entry-row.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { Note, Measurement } from '@oyl/all-of-oyl'
import { defineEntryRow } from './oyl-entry-row.js'

beforeAll(() => defineEntryRow())

function row(entry, onDelete = () => {}) {
  const el = /** @type {import('./oyl-entry-row.js').OylEntryRow} */ (document.createElement('oyl-entry-row'))
  el.entry = entry
  el.onDelete = onDelete
  document.body.append(el)
  return el
}

describe('<oyl-entry-row>', () => {
  it('renders a note with text and tags', () => {
    const el = row(new Note({ occurredAt: new Date('2026-06-10T08:14:00Z'), text: 'Calm morning', tags: ['gratitude'] }))
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)
    const text = root.textContent ?? ''
    expect(text).toContain('Calm morning')
    expect(text).toContain('gratitude')
    expect(text.toLowerCase()).toContain('note')
    el.remove()
  })

  it('renders a measurement as metric = value', () => {
    const el = row(new Measurement({ occurredAt: new Date('2026-06-10T07:30:00Z'), metric: 'body.weight_kg', value: 81.4 }))
    const text = /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''
    expect(text).toContain('body.weight_kg')
    expect(text).toContain('81.4')
    el.remove()
  })

  it('inline-confirm delete: Delete → Yes calls onDelete(id); No reverts', () => {
    const note = new Note({ occurredAt: new Date('2026-06-10T08:14:00Z'), text: 'x' })
    const onDelete = vi.fn()
    const el = row(note, onDelete)
    const root = /** @type {ShadowRoot} */ (el.shadowRoot)

    /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    // No reverts
    /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="cancel"]')).click()
    expect(root.querySelector('button[data-act="delete"]')).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    // Delete → Yes confirms
    /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="delete"]')).click()
    /** @type {HTMLButtonElement} */ (root.querySelector('button[data-act="confirm"]')).click()
    expect(onDelete).toHaveBeenCalledWith(note.id)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-entry-row`
Expected: FAIL — cannot resolve `./oyl-entry-row.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-entry-row.js`:

```js
import { Note, Measurement } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { formatClockTime, measurementUnit } from '../journal/format.js'

/** @typedef {import('@oyl/all-of-oyl').Entry} Entry */
/** @typedef {import('@oyl/all-of-oyl').Id} Id */

const styles = sheet(`
  :host { display: block; container-type: inline-size; border-top: 1px solid var(--color-border); }
  .row { display: grid; grid-template-columns: 4.2rem 1fr auto; gap: .25rem 1rem; align-items: baseline; padding: .85rem 0; }
  .time { font-family: var(--font-mono); font-size: .85rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }
  .kind { font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--color-muted); font-weight: 700; }
  .text { color: var(--color-text); }
  .measure { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .annot { color: var(--color-muted); font-size: .85rem; font-style: italic; margin-block-start: .25rem; }
  .tags { display: flex; gap: .35rem; flex-wrap: wrap; margin-block-start: .3rem; }
  .chip { font-size: .72rem; font-weight: 600; color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); border-radius: 999px; padding: .12rem .55rem; }
  button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; border-radius: var(--radius-1); padding: .25rem .5rem; }
  .del { color: var(--color-muted); font-size: .85rem; }
  .del:hover { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 12%, transparent); }
  .confirm { display: inline-flex; gap: .3rem; align-items: center; font-size: .85rem; color: var(--color-danger); }
  .confirm .yes { color: white; background: var(--color-danger); font-weight: 600; }
  .confirm .no { color: var(--color-muted); background: color-mix(in oklch, var(--color-text) 8%, transparent); }
  @container (max-width: 26rem) { .row { grid-template-columns: 1fr auto; } .time { grid-column: 1; } }
`)

export class OylEntryRow extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {Entry} */
    this.entry = /** @type {Entry} */ (/** @type {unknown} */ (undefined))
    /** @type {(id: Id) => void} */
    this.onDelete = () => {}
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const row = document.createElement('div')
    row.className = 'row'

    const time = document.createElement('span')
    time.className = 'time'
    time.textContent = formatClockTime(this.entry.occurredAt)

    const body = document.createElement('div')
    const kind = document.createElement('div')
    kind.className = 'kind'
    const content = document.createElement('div')

    if (this.entry instanceof Note) {
      kind.textContent = 'Note'
      content.className = 'text'
      content.textContent = this.entry.text
      body.append(kind, content)
      if (this.entry.tags.length) {
        const tags = document.createElement('div')
        tags.className = 'tags'
        for (const t of this.entry.tags) {
          const chip = document.createElement('span')
          chip.className = 'chip'
          chip.textContent = t
          tags.append(chip)
        }
        body.append(tags)
      }
    } else if (this.entry instanceof Measurement) {
      kind.textContent = 'Measurement'
      content.className = 'text measure'
      const unit = measurementUnit(this.entry.metric)
      content.textContent = `${this.entry.metric} = ${this.entry.value}${unit ? ' ' + unit : ''}`
      body.append(kind, content)
    } else {
      kind.textContent = 'Entry'
      body.append(kind)
    }

    if (this.entry.note) {
      const annot = document.createElement('div')
      annot.className = 'annot'
      annot.textContent = this.entry.note
      body.append(annot)
    }

    const actions = document.createElement('div')
    this._renderDelete(actions)

    row.append(time, body, actions)
    root.append(row)
  }

  /** @param {HTMLElement} mount */
  _renderDelete(mount) {
    mount.replaceChildren()
    const del = document.createElement('button')
    del.className = 'del'
    del.dataset.act = 'delete'
    del.textContent = 'Delete'
    del.addEventListener('click', () => this._renderConfirm(mount), { signal: this.lifecycle })
    mount.append(del)
  }

  /** @param {HTMLElement} mount */
  _renderConfirm(mount) {
    mount.replaceChildren()
    const group = document.createElement('span')
    group.className = 'confirm'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', 'Confirm delete')
    const label = document.createElement('span')
    label.textContent = 'Delete?'
    const yes = document.createElement('button')
    yes.className = 'yes'
    yes.dataset.act = 'confirm'
    yes.textContent = 'Yes'
    yes.addEventListener('click', () => this.onDelete(this.entry.id), { signal: this.lifecycle })
    const no = document.createElement('button')
    no.className = 'no'
    no.dataset.act = 'cancel'
    no.textContent = 'No'
    no.addEventListener('click', () => this._renderDelete(mount), { signal: this.lifecycle })
    group.append(label, yes, no)
    mount.append(group)
  }
}

/** Register the element (idempotent). */
export function defineEntryRow() {
  if (!customElements.get('oyl-entry-row')) customElements.define('oyl-entry-row', OylEntryRow)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-entry-row`
Expected: PASS — 3 cases.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0), then:

```bash
git add apps/vanilla-oyl/src/components/oyl-entry-row.js apps/vanilla-oyl/src/components/oyl-entry-row.test.js
git commit -m "feat(vanilla-oyl): <oyl-entry-row> with inline-confirm delete"
```

---

# Phase 6 — composer

### Task 6: `<oyl-log-form>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-log-form.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-log-form.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-log-form.test.js`:

```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { DayKey, Note, Measurement } from '@oyl/all-of-oyl'
import { defineLogForm } from './oyl-log-form.js'

beforeAll(() => defineLogForm())

function form(store, day = DayKey.of('2026-06-10')) {
  const el = /** @type {import('./oyl-log-form.js').OylLogForm} */ (document.createElement('oyl-log-form'))
  el.store = store
  el.getDay = () => day
  document.body.append(el)
  return el
}
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)
const q = (el, sel) => /** @type {any} */ (root(el).querySelector(sel))

describe('<oyl-log-form>', () => {
  it('logs a note via store.add with the typed text and tags', async () => {
    const added = []
    const store = { add: async (e) => { added.push(e); return e } }
    const el = form(store)
    q(el, 'textarea[name="text"]').value = 'Long run by the river'
    q(el, 'input[name="tags"]').value = 'gratitude exercise'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    expect(added).toHaveLength(1)
    expect(added[0]).toBeInstanceOf(Note)
    expect(added[0].text).toBe('Long run by the river')
    expect([...added[0].tags]).toEqual(['gratitude', 'exercise'])
    el.remove()
  })

  it('logs a measurement when the type is switched', async () => {
    const added = []
    const store = { add: async (e) => { added.push(e); return e } }
    const el = form(store)
    q(el, 'button[data-type="measurement"]').click()
    q(el, 'select[name="metric"]').value = 'body.weight_kg'
    q(el, 'input[name="value"]').value = '81.4'
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    expect(added[0]).toBeInstanceOf(Measurement)
    expect(added[0].metric).toBe('body.weight_kg')
    expect(added[0].value).toBe(81.4)
    el.remove()
  })

  it('renders a domain error inline and does not call store.add on invalid input', async () => {
    const store = { add: vi.fn(async (e) => e) }
    const el = form(store)
    // empty text → Note constructor throws INVALID_QUANTITY
    q(el, 'textarea[name="text"]').value = ''
    q(el, 'form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    await Promise.resolve()
    expect(store.add).not.toHaveBeenCalled()
    expect((root(el).querySelector('[data-role="error"]')?.textContent ?? '').length).toBeGreaterThan(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-log-form`
Expected: FAIL — cannot resolve `./oyl-log-form.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-log-form.js`:

```js
import { Note, Measurement } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'

/** @typedef {import('../state/journal-store.js').createJournalStore} _CJS */
/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */
/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

const METRICS = ['body.weight_kg', 'sleep.hours', 'mood.score', 'screen.minutes', 'custom']

const styles = sheet(`
  form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: 1rem; }
  .seg { display: inline-flex; background: color-mix(in oklch, var(--color-text) 6%, transparent); border-radius: 999px; padding: .2rem; gap: .15rem; margin-block-end: .85rem; }
  .seg button { font: inherit; border: 0; background: none; cursor: pointer; padding: .3rem .9rem; border-radius: 999px; font-size: .85rem; font-weight: 550; color: var(--color-muted); }
  .seg button[aria-pressed="true"] { background: var(--color-surface); color: var(--color-text); }
  label { display: block; font-size: .85rem; color: var(--color-muted); margin-block-end: .25rem; }
  textarea, input, select { width: 100%; font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .6rem .7rem; }
  textarea { resize: vertical; min-block-size: 3.2rem; }
  .field { margin-block-end: .7rem; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: .7rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .35rem; margin-block-start: .4rem; }
  .chip { font-size: .72rem; font-weight: 600; color: var(--color-accent); background: color-mix(in oklch, var(--color-accent) 14%, transparent); border-radius: 999px; padding: .12rem .55rem; }
  .chip.bad { color: var(--color-danger); background: color-mix(in oklch, var(--color-danger) 14%, transparent); }
  .actions { display: flex; justify-content: flex-end; margin-block-start: .9rem; }
  button.primary { background: var(--color-accent); color: white; border: 0; border-radius: var(--radius-1); padding: .5rem 1.1rem; font: inherit; font-weight: 600; cursor: pointer; }
  [data-role="error"]:not(:empty) { color: var(--color-danger); font-size: .85rem; margin-block-start: .5rem; }
`)

export class OylLogForm extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {() => DayKey} */
    this.getDay = () => /** @type {DayKey} */ (/** @type {unknown} */ (undefined))
    /** @type {() => void} */
    this.onLogged = () => {}
    this._type = signal('note')
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const formEl = document.createElement('form')

    // type toggle
    const seg = document.createElement('div')
    seg.className = 'seg'
    seg.setAttribute('role', 'group')
    seg.setAttribute('aria-label', 'Entry type')
    const noteBtn = this._segButton('note', 'Note')
    const measBtn = this._segButton('measurement', 'Measurement')
    seg.append(noteBtn, measBtn)

    // note fields
    const noteFields = document.createElement('div')
    const text = this._labeled('text', 'What happened?', this._textarea('text', 'A line about your day…'))
    const tagsInput = this._input('tags', 'text')
    const tags = this._labeled('tags', 'Tags (optional, lowercase words)', tagsInput)
    const chips = document.createElement('div')
    chips.className = 'chips'
    tagsInput.addEventListener('input', () => this._renderChips(chips, tagsInput.value), { signal: this.lifecycle })
    noteFields.append(text, tags, chips)

    // measurement fields
    const measFields = document.createElement('div')
    measFields.hidden = true
    const metricSel = document.createElement('select')
    metricSel.name = 'metric'
    for (const m of METRICS) {
      const o = document.createElement('option')
      o.value = m
      o.textContent = m === 'custom' ? 'custom.…' : m
      metricSel.append(o)
    }
    const customInput = this._input('custom', 'text')
    customInput.placeholder = 'custom.your_metric'
    customInput.hidden = true
    metricSel.addEventListener('change', () => { customInput.hidden = metricSel.value !== 'custom' }, { signal: this.lifecycle })
    const valueInput = this._input('value', 'number')
    valueInput.setAttribute('inputmode', 'decimal')
    const row2 = document.createElement('div')
    row2.className = 'row2'
    row2.append(this._labeled('metric', 'Metric', metricSel), this._labeled('value', 'Value', valueInput))
    measFields.append(row2, this._labeled('custom', 'Custom metric key', customInput))

    // shared datetime
    const when = this._input('when', 'datetime-local')

    // error + submit
    const error = document.createElement('div')
    error.dataset.role = 'error'
    error.setAttribute('aria-live', 'polite')
    const actions = document.createElement('div')
    actions.className = 'actions'
    const submit = document.createElement('button')
    submit.type = 'submit'
    submit.className = 'primary'
    submit.textContent = 'Log it'
    actions.append(submit)

    formEl.append(seg, noteFields, measFields, this._labeled('when', 'When', when), error, actions)
    root.append(formEl)

    // reactive: show the right field set + default the datetime to the selected day
    this.track(() => {
      const note = this._type.get() === 'note'
      noteFields.hidden = !note
      measFields.hidden = note
      noteBtn.setAttribute('aria-pressed', String(note))
      measBtn.setAttribute('aria-pressed', String(!note))
    })
    this._syncWhen(when)

    formEl.addEventListener('submit', (e) => {
      e.preventDefault()
      void this._submit({ error, when, metricSel, customInput, valueInput, formEl })
    }, { signal: this.lifecycle })
    formEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); formEl.requestSubmit() }
    }, { signal: this.lifecycle })
  }

  /** @param {HTMLInputElement} when */
  _syncWhen(when) {
    const day = this.getDay()
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    when.value = `${day.value}T${hh}:${mm}`
  }

  /** @param {{error: HTMLElement, when: HTMLInputElement, metricSel: HTMLSelectElement, customInput: HTMLInputElement, valueInput: HTMLInputElement, formEl: HTMLFormElement}} ctx */
  async _submit(ctx) {
    ctx.error.textContent = ''
    const occurredAt = new Date(ctx.when.value)
    try {
      /** @type {import('@oyl/all-of-oyl').Entry} */
      let entry
      if (this._type.get() === 'note') {
        const text = /** @type {HTMLTextAreaElement} */ (this.shadowRoot.querySelector('textarea[name="text"]')).value
        const raw = /** @type {HTMLInputElement} */ (this.shadowRoot.querySelector('input[name="tags"]')).value
        const tags = raw.split(/[\s,]+/).filter(Boolean)
        entry = new Note({ occurredAt, text, tags })
      } else {
        const metric = ctx.metricSel.value === 'custom' ? ctx.customInput.value : ctx.metricSel.value
        entry = new Measurement({ occurredAt, metric, value: Number(ctx.valueInput.value) })
      }
      await this.store.add(entry)
      ctx.formEl.reset()
      this._syncWhen(ctx.when)
      const chips = this.shadowRoot.querySelector('.chips')
      if (chips) chips.replaceChildren()
      this.onLogged()
    } catch (err) {
      ctx.error.textContent = err instanceof Error ? err.message : String(err)
    }
  }

  /** @param {HTMLElement} mount @param {string} raw */
  _renderChips(mount, raw) {
    mount.replaceChildren()
    for (const t of raw.split(/[\s,]+/).filter(Boolean)) {
      const ok = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)
      const chip = document.createElement('span')
      chip.className = ok ? 'chip' : 'chip bad'
      chip.textContent = t
      mount.append(chip)
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

  /** @param {string} name @param {string} placeholder @returns {HTMLTextAreaElement} */
  _textarea(name, placeholder) {
    const t = document.createElement('textarea')
    t.name = name
    t.placeholder = placeholder
    return t
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
    if ('id' in control) control.id = forName
    wrap.append(label, control)
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineLogForm() {
  if (!customElements.get('oyl-log-form')) customElements.define('oyl-log-form', OylLogForm)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-log-form`
Expected: PASS — 3 cases. (happy-dom supports `form.requestSubmit`/`reset`; if `requestSubmit` is missing, the Cmd+Enter path is browser-verified — the submit-event tests don't depend on it.)

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (exit 0), then:

```bash
git add apps/vanilla-oyl/src/components/oyl-log-form.js apps/vanilla-oyl/src/components/oyl-log-form.test.js
git commit -m "feat(vanilla-oyl): <oyl-log-form> composer (note/measurement, inline validation)"
```

---

# Phase 7 — screen container

### Task 7: `<oyl-journal>`

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-journal.test.js`
- Create: `apps/vanilla-oyl/src/components/oyl-journal.js`

- [ ] **Step 1: Write the failing test**

Create `apps/vanilla-oyl/src/components/oyl-journal.test.js`:

```js
import { describe, expect, it, beforeAll } from 'vitest'
import { InMemoryRepository, Note, DayKey } from '@oyl/all-of-oyl'
import { createJournalStore } from '../state/journal-store.js'
import { defineJournal } from './oyl-journal.js'

const TZ = 'America/New_York'
beforeAll(() => defineJournal())

function screen(store, tz = TZ) {
  const el = /** @type {import('./oyl-journal.js').OylJournal} */ (document.createElement('oyl-journal'))
  el.store = store
  el.tz = tz
  document.body.append(el)
  return el
}
const text = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).textContent ?? ''
const rows = (el) => /** @type {ShadowRoot} */ (el.shadowRoot).querySelectorAll('oyl-entry-row')

describe('<oyl-journal>', () => {
  it('renders today’s entries and updates reactively when the store changes', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    const el = screen(store)
    expect(rows(el)).toHaveLength(0)
    expect(text(el).toLowerCase()).toContain('nothing') // empty state
    await store.add(new Note({ occurredAt: new Date(), text: 'logged now' }))
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    el.remove()
  })

  it('navigating to the previous day shows a different (empty) set', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Note({ occurredAt: new Date(), text: 'today' }))
    const el = screen(store)
    await Promise.resolve()
    expect(rows(el)).toHaveLength(1)
    /** @type {HTMLButtonElement} */ (el.shadowRoot.querySelector('button[data-nav="prev"]')).click()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })

  it('deleting an entry removes its row', async () => {
    const store = createJournalStore(new InMemoryRepository(), TZ)
    await store.add(new Note({ occurredAt: new Date(), text: 'bye' }))
    const el = screen(store)
    await Promise.resolve()
    const row = /** @type {any} */ (el.shadowRoot.querySelector('oyl-entry-row'))
    /** @type {HTMLButtonElement} */ (row.shadowRoot.querySelector('button[data-act="delete"]')).click()
    /** @type {HTMLButtonElement} */ (row.shadowRoot.querySelector('button[data-act="confirm"]')).click()
    await Promise.resolve()
    await Promise.resolve()
    expect(rows(el)).toHaveLength(0)
    el.remove()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-journal`
Expected: FAIL — cannot resolve `./oyl-journal.js`.

- [ ] **Step 3: Implement**

Create `apps/vanilla-oyl/src/components/oyl-journal.js`:

```js
import { DayKey } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { relativeDayLabel, formatDayHeading } from '../journal/format.js'
import { defineLogForm } from './oyl-log-form.js'
import { defineEntryRow } from './oyl-entry-row.js'

/** @typedef {ReturnType<typeof import('../state/journal-store.js').createJournalStore>} JournalStore */

const styles = sheet(`
  :host { display: block; max-inline-size: 680px; margin-inline: auto; padding: clamp(1rem, 4vw, 2rem) 1rem 4rem; }
  .daynav { display: flex; align-items: center; justify-content: center; gap: .4rem; margin-block-end: 1.4rem; }
  .daynav button { font: inherit; color: var(--color-muted); border: 0; background: none; cursor: pointer; inline-size: 2.1rem; block-size: 2.1rem; border-radius: 999px; font-size: 1.1rem; }
  .daynav button:hover:not(:disabled) { background: color-mix(in oklch, var(--color-text) 6%, transparent); color: var(--color-text); }
  .daynav button:disabled { opacity: .35; cursor: default; }
  .day { text-align: center; min-inline-size: 13rem; }
  h2 { font-size: var(--step-2); font-weight: 640; letter-spacing: -.02em; line-height: 1.1; }
  .rel { color: var(--color-muted); font-size: .85rem; margin-block-start: .15rem; }
  oyl-log-form { display: block; margin-block-end: 1.6rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  .empty { text-align: center; color: var(--color-muted); padding: 2.5rem 1rem; }
  .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
`)

export class OylJournal extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {JournalStore} */
    this.store = /** @type {JournalStore} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<DayKey>} */
    this._day = /** @type {any} */ (undefined)
  }

  render() {
    defineLogForm()
    defineEntryRow()
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._day = signal(DayKey.from(now(), this.tz), (a, b) => a.equals(b))

    // day nav
    const daynav = document.createElement('div')
    daynav.className = 'daynav'
    const prev = this._navButton('prev', '‹', 'Previous day')
    const next = this._navButton('next', '›', 'Next day')
    const dayBox = document.createElement('div')
    dayBox.className = 'day'
    const h2 = document.createElement('h2')
    h2.tabIndex = -1
    const rel = document.createElement('div')
    rel.className = 'rel'
    dayBox.append(h2, rel)
    daynav.append(prev, dayBox, next)

    // live region
    const live = document.createElement('div')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')

    // composer
    const formEl = /** @type {import('./oyl-log-form.js').OylLogForm} */ (document.createElement('oyl-log-form'))
    formEl.store = this.store
    formEl.getDay = () => this._day.get()
    formEl.onLogged = () => { live.textContent = 'Entry added' }

    const list = document.createElement('ol')
    const empty = document.createElement('div')
    empty.className = 'empty'

    root.append(daynav, live, formEl, list, empty)

    // arrow-key day nav (ignore when typing in a field)
    this.addEventListener('keydown', (e) => {
      const t = /** @type {HTMLElement} */ (e.composedPath()[0])
      const tag = t && t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') this._go(-1, h2, live)
      else if (e.key === 'ArrowRight') this._go(1, h2, live)
    }, { signal: this.lifecycle })

    prev.addEventListener('click', () => this._go(-1, h2, live), { signal: this.lifecycle })
    next.addEventListener('click', () => this._go(1, h2, live), { signal: this.lifecycle })

    // reactive render of header + list (tracks _day and store.revision via entriesOn)
    this.track(() => {
      const day = this._day.get()
      const today = DayKey.from(now(), this.tz)
      h2.textContent = formatDayHeading(day)
      const label = relativeDayLabel(day, today)
      rel.textContent = label
      prev.disabled = false
      // "today" is reachable via the rel label being non-Today; disable next beyond today? future days allowed → keep enabled
      const entries = [...this.store.entriesOn(day)].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      list.replaceChildren()
      for (const entry of entries) {
        const row = /** @type {import('./oyl-entry-row.js').OylEntryRow} */ (document.createElement('oyl-entry-row'))
        row.entry = entry
        row.onDelete = (id) => { void this.store.remove(id); live.textContent = 'Entry deleted' }
        const li = document.createElement('li')
        li.append(row)
        list.append(li)
      }
      empty.hidden = entries.length > 0
      empty.textContent = entries.length > 0 ? '' : `Nothing logged for ${formatDayHeading(day)}. Add a note or a measurement above.`
    })
  }

  /** @param {number} delta @param {HTMLElement} h2 @param {HTMLElement} live */
  _go(delta, h2, live) {
    this._day.set(this._day.get().addDays(delta))
    h2.focus()
    live.textContent = `Showing ${formatDayHeading(this._day.get())}`
  }

  /** @param {string} dir @param {string} glyph @param {string} label @returns {HTMLButtonElement} */
  _navButton(dir, glyph, label) {
    const b = document.createElement('button')
    b.dataset.nav = dir
    b.textContent = glyph
    b.setAttribute('aria-label', label)
    return b
  }
}

/** Register the element (idempotent). */
export function defineJournal() {
  if (!customElements.get('oyl-journal')) customElements.define('oyl-journal', OylJournal)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run oyl-journal`
Expected: PASS — 3 cases. (The delete test reaches into the nested row's shadow root; the two `await Promise.resolve()` flush the remove's microtask + the revision-driven re-render.)

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`
Expected: all PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-journal.js apps/vanilla-oyl/src/components/oyl-journal.test.js
git commit -m "feat(vanilla-oyl): <oyl-journal> screen — day nav, reactive list, empty state, a11y"
```

---

# Phase 8 — wiring

### Task 8: Route + nav mount in `main.js`

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

- [ ] **Step 1: Add imports**

In `apps/vanilla-oyl/src/main.js`, add to the component imports block:
```js
import { defineNav } from './components/oyl-nav.js'
import { defineJournal } from './components/oyl-journal.js'
```
(`<oyl-journal>` registers `oyl-log-form`/`oyl-entry-row` itself, so they need no import here — but importing `defineJournal` is enough.)

- [ ] **Step 2: Register + mount nav**

In `boot()`, alongside the other `defineX()` calls, add:
```js
  defineNav()
  defineJournal()
```

After the `toggle` is created and before `shell.append(...)`, add the nav (fed the route signal) and include it in the append:
```js
  const navEl = /** @type {import('./components/oyl-nav.js').OylNav} */ (document.createElement('oyl-nav'))
  navEl.slot = 'nav'
  navEl.routeSignal = routeState.route
```
Change the shell append to include it:
```js
  shell.append(navEl, toggle, router)
```

- [ ] **Step 3: Add the journal route**

In the `router.routes = { ... }` object, add a `journal` entry next to `status`:
```js
    journal: () => {
      const view = /** @type {import('./components/oyl-journal.js').OylJournal} */ (document.createElement('oyl-journal'))
      view.store = dataState.journal
      view.tz = defaultTimezone()
      return view
    },
```
Add the import for `defaultTimezone` if not already present:
```js
import { defaultTimezone } from './storage/clock.js'
```

- [ ] **Step 4: Typecheck + full suite**

Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit && pnpm --filter @oyl/vanilla-oyl exec vitest run`
Expected: tsc exit 0; all tests PASS. Also `grep -n innerHTML apps/vanilla-oyl/src/main.js` → empty.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire #/journal route + <oyl-nav> into the shell"
```

---

# Phase 9 — acceptance

### Task 9: Browser acceptance pass

**Files:** none (manual verification).

- [ ] **Step 1: Build + serve**

Run: `pnpm --filter @oyl/vanilla-oyl build:lib` then `pnpm --filter @oyl/vanilla-oyl dev` (serves on 8041). (`build:lib` re-vendors `@oyl/all-of-oyl` — needed because the browser uses the built `dist/`, and `Journal`/`Note`/`Measurement` are already exported from it.)

- [ ] **Step 2: Walk the journal acceptance list at `http://localhost:8041/#/journal`**

Confirm each:
- Nav shows Status · Journal; clicking Journal routes to the screen, Journal marked active.
- Day header reads today with the "Today" label; the composer is present.
- Log a **note** (text + a tag like `gratitude`) → it appears instantly as a row with the tag chip; composer clears and keeps focus.
- Log a **measurement** (`body.weight_kg` = `81.4`) → appears as `body.weight_kg = 81.4 kg`.
- Enter an invalid tag (e.g. `Not A Slug`) → chip turns red; submitting surfaces the domain error inline; the draft is preserved.
- Backdate via the `When` field to yesterday → the entry lands under the previous day (navigate ‹ to confirm).
- **Delete** a row → `Delete? Yes No`; No reverts; Yes removes the row.
- Day nav: ‹ / › and the **←/→ arrow keys** change the day; empty days show the friendly empty state.
- Toggle Theme/Mode → the screen re-themes (Classic/Forest × light/dark) with no flash.
- Reload → entries persist (localStorage); open a second tab, log there, watch this tab update (multi-tab via the storage listener + `refresh()` re-hydrate).

- [ ] **Step 3: a11y spot-check**

Tab through: composer controls have labels; the day `<h2>` receives focus on day change; the live region announces add/delete/day-change; focus rings visible. (Optional: run the `chrome-devtools-mcp:a11y-debugging` skill.)

- [ ] **Step 4: Final verification + (optional) merge**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit && pnpm --filter @oyl/all-of-oyl test`
Expected: all green. Then use `superpowers:finishing-a-development-branch` to integrate.

---

## Self-review notes (addressed in this plan)

- **Spec coverage:** JournalStore persist-first + revision + hydrate (T1); data.js build+hydrate (T2); pure helpers/relative label (T3); `<oyl-nav>` + shell slot (T4); `<oyl-entry-row>` inline-confirm delete (T5); `<oyl-log-form>` note/measurement + inline validation + chips + datetime (T6); `<oyl-journal>` day nav + reactive list + empty state + arrow keys + live region (T7); route + nav wiring (T8); browser acceptance incl. multi-tab + theming (T9). Out-of-scope items (edit, trash/undo, other entry kinds, insights, range view, bottom-bar nav) are not implemented, per the spec.
- **Type consistency:** `store`/`getDay`/`onLogged`/`onDelete`/`entry`/`routeSignal`/`tz` props and the `data-act`/`data-nav`/`data-route`/`data-type` hooks and `[data-role="error"]` selector are used identically across the component implementations and their tests. `JournalStore` = `ReturnType<typeof createJournalStore>` everywhere.
- **Known carried-forward limitations:** OylElement reconnect double-render (views are created fresh per navigation — fine); happy-dom doesn't honor `{signal}`/`requestSubmit`/View Transitions (logic unit-tested; those behaviors browser-verified in T9).
