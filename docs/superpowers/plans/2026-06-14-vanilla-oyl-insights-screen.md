# vanilla-oyl Insights/Review Screen (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only `#/insights` dashboard (minus the life-wheel) rendering the domain `review()` for a chosen period: totals + neutral deltas, goals + streaks, top spending, activity totals, plan completion rate.

**Architecture:** `journalStore.peek()` / `plannerStore.peek()` expose the live domain aggregates (reactive, data-layer-only). `data.reviewOn(range)` composes `review({ journal, planner, goals, activities:[], areas:[], period })` — subscribing to all three revisions. `<oyl-insights>` receives the bound `reviewOn` + `tz`, builds a static skeleton once, and repaints section contents in one `track()`. No catalog plumbing (life-wheel is Slice 2).

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`review`/`Review`/`periodWindowOf`/`DayKey`/`Measurement`/`Goal`), foundation signals + Web Component base.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-insights-screen-design.md` (decisions R1–R11).

---

## Conventions (carried from prior screens)

- `.js` + JSDoc strict + checkJs. **No `innerHTML`**. `OylElement` (`this.track`, `this.lifecycle`, `static styles=[sheet(css)]`); idempotent `defineX()`.
- Double-cast defaults for externally-assigned fields. STATIC imports. `@oyl/all-of-oyl` → TS source (no build for tests/typecheck).
- **Assert via the element's own `shadowRoot` content**; this screen has no child components, so `shadowRoot.textContent` is fine. Named locals + casts for `.click()`; indexed access is `T | undefined` under strict — cast in tests.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**New:** `insights/format.js`, `components/oyl-insights.js` (+ tests).
**Modified:** `state/journal-store.js`, `state/planner-store.js`, `state/data.js`, `components/oyl-nav.js`, `main.js` (+ extend their tests).

---

## Task 1: `insights/format.js` — `money` + `reviewGoalLabel`

**Files:** Create `apps/vanilla-oyl/src/insights/format.js`; test `apps/vanilla-oyl/src/insights/format.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/insights/format.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { money, reviewGoalLabel } from './format.js'

describe('money', () => {
  it('formats major-unit numbers as currency', () => {
    expect(money(42.5)).toBe('$42.50')
    expect(money(0)).toBe('$0.00')
    expect(money(1234)).toBe('$1234.00')
  })
})

describe('reviewGoalLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
  const p = (o = {}) => ({ current: 0, target: 10, ratio: 0, paused: false, empty: false, ...o })
  it('prioritizes paused, then empty, then met, else percent', () => {
    expect(reviewGoalLabel(p({ paused: true }))).toBe('Paused')
    expect(reviewGoalLabel(p({ empty: true }))).toBe('No data')
    expect(reviewGoalLabel(p({ met: true }))).toBe('Met')
    expect(reviewGoalLabel(p({ ratio: 0.8 }))).toBe('80%')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module './format.js'`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/insights/format.test.js`

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/insights/format.js`:
```js
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */

/** "$42.50" (major-unit, single-currency). @param {number} n @returns {string} */
export function money(n) {
  return `$${n.toFixed(2)}`
}

/** A goal's review label from its progress alone (GoalReview lacks direction/unit). @param {GoalProgress} p @returns {string} */
export function reviewGoalLabel(p) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data'
  if (p.met === true) return 'Met'
  return `${Math.round(p.ratio * 100)}%`
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/insights/format.js apps/vanilla-oyl/src/insights/format.test.js
git commit -m "feat(vanilla-oyl): insights format helpers (money, reviewGoalLabel)"
```

---

## Task 2: `peek()` on journal + planner stores

**Files:** Modify `apps/vanilla-oyl/src/state/journal-store.js` + its test; `apps/vanilla-oyl/src/state/planner-store.js` + its test.

- [ ] **Step 1: Add the failing tests.**
In `journal-store.test.js`, append inside `describe('createJournalStore', …)` (the file imports `Note`, `DayKey`; `aNote`/`dayOf` helpers exist):
```js
  it('peek exposes the live Journal aggregate', async () => {
    const repo = /** @type {InMemoryRepository<Entry>} */ (new InMemoryRepository())
    const store = createJournalStore(repo, TZ)
    await store.add(aNote())
    expect(store.peek().entriesOn(dayOf())).toHaveLength(1)
  })
```
In `planner-store.test.js`, add `InMemoryRepository` to the import (it currently imports `LocalStorageRepository, COLLECTIONS, Task, Cadence, DayKey`):
```js
import { InMemoryRepository, LocalStorageRepository, COLLECTIONS, Task, Cadence, DayKey } from '@oyl/all-of-oyl'
```
and append inside its `describe`:
```js
  it('peek exposes the live Planner aggregate', async () => {
    const store = createPlannerStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Task({ title: 'x', due: DayKey.of('2026-06-16') }))
    expect(store.peek().all()).toHaveLength(1)
  })
```

- [ ] **Step 2: Run → FAIL** (`store.peek is not a function`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/journal-store.test.js src/state/planner-store.test.js`

- [ ] **Step 3: Implement.**
In `apps/vanilla-oyl/src/state/journal-store.js`, add to the returned object right after the `progressOf` method's closing `},`:
```js
    /** Live Journal aggregate for read-only insights — touches revision. @returns {Journal} */
    peek() {
      revision.get()
      return journal
    },
```
In `apps/vanilla-oyl/src/state/planner-store.js`, add to the returned object right after the `hydrate,` line:
```js
    /** Live Planner aggregate for read-only insights — touches revision. @returns {Planner} */
    peek() {
      revision.get()
      return planner
    },
```
(`Journal`/`Planner` are imported as values in each file and usable as JSDoc types — no new typedef needed.)

- [ ] **Step 4: Run → PASS** (both files green, existing + 1 new each).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/journal-store.js apps/vanilla-oyl/src/state/journal-store.test.js apps/vanilla-oyl/src/state/planner-store.js apps/vanilla-oyl/src/state/planner-store.test.js
git commit -m "feat(vanilla-oyl): journalStore/plannerStore peek() (live aggregate for insights)"
```

---

## Task 3: `data.reviewOn(range)`

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`; test `apps/vanilla-oyl/src/state/data.test.js`.

- [ ] **Step 1: Add the failing test.** In `data.test.js`, extend the import:
```js
import { Note, Measurement, Goal, DayKey, Task, periodWindowOf } from '@oyl/all-of-oyl'
```
Append inside `describe('data state', …)`:
```js
  it('reviewOn composes a review for a period', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    const iso = '2026-06-10T16:00:00Z'
    await ds.repos.goals.save(new Goal({ name: 'Sleep', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' }))
    await ds.repos.entries.save(new Measurement({ occurredAt: new Date(iso), metric: 'sleep.hours', value: 7 }))
    await ds.refresh()
    const day = DayKey.from(new Date(iso), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('day', day))
    expect(r.goals).toHaveLength(1)
    expect(r.goals[0]?.progress.current).toBe(7)
    expect(r.totals).toBeDefined()
  })
```

- [ ] **Step 2: Run → FAIL** (`ds.reviewOn is not a function`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`

- [ ] **Step 3: Implement** in `apps/vanilla-oyl/src/state/data.js`.
Add to the imports (top of file):
```js
import { review } from '@oyl/all-of-oyl'
```
Add this function inside `createDataState` (after `readDiagnostics`, before the `return`):
```js
  /**
   * Compose the domain review for a period. Reactive: journal.peek()/planner.peek()/goals.all()
   * each touch their revision, so a reactive reader (the insights screen) re-runs on any change.
   * Slice 1 passes empty activities/areas — only the life-wheel (Slice 2) needs the catalogs.
   * @param {import('@oyl/all-of-oyl').DayRange} range @returns {import('@oyl/all-of-oyl').Review}
   */
  function reviewOn(range) {
    return review({
      journal: journal.peek(),
      planner: planner.peek(),
      goals: goals.all(),
      activities: [],
      areas: [],
      period: range,
    })
  }
```
Add `reviewOn` to the returned object:
```js
  return { repos, counts, schema, refresh, readDiagnostics, journal, planner, vault, goals, reviewOn }
```

- [ ] **Step 4: Run → PASS** (existing + 1 new).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): data.reviewOn (composes domain review reactively)"
```

---

## Task 4: `components/oyl-insights.js` — the dashboard screen

**Files:** Create `apps/vanilla-oyl/src/components/oyl-insights.js`; test `apps/vanilla-oyl/src/components/oyl-insights.test.js`.

- [ ] **Step 1: Create the test** `apps/vanilla-oyl/src/components/oyl-insights.test.js`:
```js
import { describe, expect, it, beforeAll, vi } from 'vitest'
import { defineInsights } from './oyl-insights.js'

beforeAll(() => defineInsights())

/** @param {Record<string, unknown>} [over] @returns {any} */
const review = (over = {}) => ({
  period: null,
  goals: [{ goalId: 'g1', name: 'Sleep enough', progress: { current: 7, target: 7, ratio: 1, met: true, paused: false, empty: false }, streak: 3 }],
  topSpending: [{ category: 'groceries', total: 42.5 }],
  activityTotals: [{ slug: 'run', count: 0, minutes: 100 }],
  completionRate: 0.5,
  totals: { spending: 42.5, activityMinutes: 100, calories: 1800 },
  previousTotals: { spending: 40, activityMinutes: 80, calories: 1800 },
  deltas: { spending: 2.5, activityMinutes: 20, calories: 0 },
  areas: [],
  ...over,
})

/** @param {any} reviewOn */
function screen(reviewOn) {
  const el = /** @type {import('./oyl-insights.js').OylInsights} */ (document.createElement('oyl-insights'))
  el.reviewOn = reviewOn
  el.tz = 'UTC'
  document.body.append(el)
  return el
}
/** @param {any} el */
const root = (el) => /** @type {ShadowRoot} */ (el.shadowRoot)

describe('<oyl-insights>', () => {
  it('renders totals, deltas, goals+streak, spending, activity, completion', async () => {
    const el = screen(() => review())
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('$42.50')   // spending total
    expect(text).toContain('100')      // active minutes
    expect(text).toContain('Sleep enough')
    expect(text).toContain('Met')
    expect(text).toContain('🔥 3')
    expect(text).toContain('groceries')
    expect(text).toContain('run')
    expect(text).toContain('100 min')
    expect(text).toContain('50%')      // completion
    expect(root(el).querySelectorAll('.stat .d').length).toBeGreaterThan(0) // spending/minutes deltas present
    el.remove()
  })

  it('omits delta chips when deltas are 0 and renders empty states', async () => {
    const el = screen(() => review({
      goals: [], topSpending: [], activityTotals: [],
      completionRate: undefined,
      totals: { spending: 0, activityMinutes: 0, calories: 0 },
      deltas: { spending: 0, activityMinutes: 0, calories: 0 },
    }))
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('No goals yet')
    expect(text).toContain('Nothing this period')
    expect(text).toContain('—')                       // completion undefined
    expect(root(el).querySelector('.stat .d')).toBeNull() // no delta chips
    el.remove()
  })

  it('re-queries reviewOn when the period changes', async () => {
    const reviewOn = vi.fn(() => review())
    const el = screen(reviewOn)
    await Promise.resolve()
    const before = reviewOn.mock.calls.length
    const sel = /** @type {HTMLSelectElement} */ (root(el).querySelector('select'))
    sel.value = 'week'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    expect(reviewOn.mock.calls.length).toBeGreaterThan(before)
    el.remove()
  })
})
```

- [ ] **Step 2: Run → FAIL** (Cannot find module).

- [ ] **Step 3: Create** `apps/vanilla-oyl/src/components/oyl-insights.js`:
```js
import { DayKey, periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { signal } from '../lib/reactive/signal.js'
import { sheet } from './sheet.js'
import { now } from '../storage/clock.js'
import { money, reviewGoalLabel } from '../insights/format.js'

/** @typedef {import('@oyl/all-of-oyl').Review} Review */
/** @typedef {(range: import('@oyl/all-of-oyl').DayRange) => Review} ReviewOn */

const PERIODS = /** @type {ReadonlyArray<readonly [string, string]>} */ ([
  ['month', 'This month'],
  ['week', 'This week'],
])

const styles = sheet(`
  :host { display: block; }
  h2 { font-size: var(--step-2); margin-block-end: var(--space-4); }
  .head { display: flex; justify-content: flex-end; margin-block-end: 1rem; }
  select { font: inherit; color: var(--color-text); background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-1); padding: .3rem .5rem; }
  .section-label { font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; color: var(--color-muted); margin: 1.6rem 0 .4rem; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: .8rem; }
  .stat { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-2); padding: .8rem; }
  .stat .k { color: var(--color-muted); font-size: var(--step--1); }
  .stat .v { font-size: var(--step-1); font-variant-numeric: tabular-nums; margin-block-start: .2rem; }
  .stat .d { color: var(--color-muted); font-size: var(--step--1); font-variant-numeric: tabular-nums; margin-block-start: .1rem; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 1rem; padding: .4rem 0; border-top: 1px solid var(--color-border); }
  .completion { font-variant-numeric: tabular-nums; }
  .muted { color: var(--color-muted); padding: .5rem 0; }
`)

export class OylInsights extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {ReviewOn} */
    this.reviewOn = /** @type {ReviewOn} */ (/** @type {unknown} */ (undefined))
    /** @type {string} */
    this.tz = 'UTC'
    /** @type {import('../lib/reactive/signal.js').Signal<string>} */
    this._period = /** @type {any} */ (undefined)
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this._period = signal('month')

    const h2 = document.createElement('h2')
    h2.textContent = 'Insights'
    h2.tabIndex = -1

    const head = document.createElement('div')
    head.className = 'head'
    const sel = document.createElement('select')
    sel.setAttribute('aria-label', 'Period')
    for (const [val, label] of PERIODS) {
      const o = document.createElement('option')
      o.value = val
      o.textContent = label
      sel.append(o)
    }
    sel.addEventListener('change', () => this._period.set(sel.value), { signal: this.lifecycle })
    head.append(sel)

    const totals = document.createElement('div')
    totals.className = 'totals'
    const completionLabel = this._label('Plan completion')
    const completion = document.createElement('div')
    completion.className = 'completion'
    const goalsLabel = this._label('Goals')
    const goalsList = document.createElement('ol')
    const goalsEmpty = this._empty()
    const spendLabel = this._label('Top spending')
    const spendList = document.createElement('ol')
    const spendEmpty = this._empty()
    const actLabel = this._label('Activity')
    const actList = document.createElement('ol')
    const actEmpty = this._empty()

    root.append(h2, head, totals, completionLabel, completion, goalsLabel, goalsList, goalsEmpty, spendLabel, spendList, spendEmpty, actLabel, actList, actEmpty)

    this.track(() => {
      const today = DayKey.from(now(), this.tz)
      const range = periodWindowOf(/** @type {any} */ (this._period.get()), today)
      const r = this.reviewOn(range)

      totals.replaceChildren(
        this._stat('Spending', money(r.totals.spending), r.deltas.spending, true),
        this._stat('Active min', String(Math.round(r.totals.activityMinutes)), r.deltas.activityMinutes, false),
        this._stat('Calories', String(Math.round(r.totals.calories)), r.deltas.calories, false),
      )

      completion.textContent = r.completionRate === undefined ? '—' : `${Math.round(r.completionRate * 100)}%`

      goalsList.replaceChildren()
      for (const g of r.goals) {
        const meta = reviewGoalLabel(g.progress) + (g.streak > 0 ? ` · 🔥 ${g.streak}` : '')
        goalsList.append(this._row(g.name ?? 'Goal', meta))
      }
      goalsEmpty.hidden = r.goals.length > 0
      goalsEmpty.textContent = goalsEmpty.hidden ? '' : 'No goals yet'

      spendList.replaceChildren()
      for (const s of r.topSpending) spendList.append(this._row(s.category, money(s.total)))
      spendEmpty.hidden = r.topSpending.length > 0
      spendEmpty.textContent = spendEmpty.hidden ? '' : 'Nothing this period'

      actList.replaceChildren()
      for (const a of r.activityTotals) {
        const parts = []
        if (a.minutes) parts.push(`${Math.round(a.minutes)} min`)
        if (a.count) parts.push(`${a.count}×`)
        actList.append(this._row(a.slug, parts.join(' · ')))
      }
      actEmpty.hidden = r.activityTotals.length > 0
      actEmpty.textContent = actEmpty.hidden ? '' : 'Nothing this period'
    })
  }

  /** @param {string} text @returns {HTMLElement} */
  _label(text) {
    const d = document.createElement('div')
    d.className = 'section-label'
    d.textContent = text
    return d
  }

  /** @returns {HTMLElement} */
  _empty() {
    const d = document.createElement('div')
    d.className = 'muted'
    return d
  }

  /** @param {string} k @param {string} v @returns {HTMLLIElement} */
  _row(k, v) {
    const li = document.createElement('li')
    const ke = document.createElement('span')
    ke.textContent = k
    const ve = document.createElement('span')
    ve.textContent = v
    li.append(ke, ve)
    return li
  }

  /** @param {string} k @param {string} v @param {number} delta @param {boolean} isMoney @returns {HTMLElement} */
  _stat(k, v, delta, isMoney) {
    const wrap = document.createElement('div')
    wrap.className = 'stat'
    const ke = document.createElement('div')
    ke.className = 'k'
    ke.textContent = k
    const ve = document.createElement('div')
    ve.className = 'v'
    ve.textContent = v
    wrap.append(ke, ve)
    if (delta !== 0) {
      const de = document.createElement('div')
      de.className = 'd'
      const mag = isMoney ? money(Math.abs(delta)) : String(Math.round(Math.abs(delta)))
      de.textContent = `${delta > 0 ? '↑' : '↓'} ${mag}`
      wrap.append(de)
    }
    return wrap
  }
}

/** Register the element (idempotent). */
export function defineInsights() {
  if (!customElements.get('oyl-insights')) customElements.define('oyl-insights', OylInsights)
}
```

- [ ] **Step 4: Run → PASS** (3 tests).
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-insights.js apps/vanilla-oyl/src/components/oyl-insights.test.js
git commit -m "feat(vanilla-oyl): oyl-insights dashboard (totals/deltas, goals, spending, activity, completion)"
```

---

## Task 5: Wire-up — nav item + route

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-nav.js`, `apps/vanilla-oyl/src/main.js`.

- [ ] **Step 1: Nav.** In `apps/vanilla-oyl/src/components/oyl-nav.js`, add to `ITEMS` after the `['goals', 'Goals']` entry:
```js
  ['insights', 'Insights'],
```
(The `nav` rule already has `flex-wrap: wrap` from the Goals slice.)

- [ ] **Step 2: `main.js`.**
1. Import after `import { defineGoals } from './components/oyl-goals.js'`:
```js
import { defineInsights } from './components/oyl-insights.js'
```
2. In the `defineX()` block after `defineGoals()`:
```js
  defineInsights()
```
3. In `router.routes`, after the `goals:` entry:
```js
    insights: () => {
      const view = /** @type {import('./components/oyl-insights.js').OylInsights} */ (document.createElement('oyl-insights'))
      view.reviewOn = dataState.reviewOn
      view.tz = defaultTimezone()
      return view
    },
```

- [ ] **Step 3: Full suite + typecheck.**
Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run` — expect all green (175 prior + ~10 new ≈ 185).
Run: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` — clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/main.js
git commit -m "feat(vanilla-oyl): wire Insights — nav item + #/insights route"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload** the tab), open `#/insights`, Load demo data:
  - With **This month**: totals show spending ($), active minutes, calories, each with a delta chip vs the previous month (when nonzero); a Goals list with progress + any 🔥 streaks; Top spending categories; Activity totals; a completion %.
  - Switch to **This week** → figures recompute for the current ISO week.
  - Log an entry in `#/journal`, return to `#/insights` → totals reflect it (live, no reload).
  - Reset data (Status) → every section shows its empty state ("No goals yet", "Nothing this period", "—") with no delta chips.
- [ ] **Final code review** of the branch, then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** format helpers (T1); peek() accessors (T2, R1); data.reviewOn (T3, R2 empty catalogs); the dashboard (T4 — totals+neutral deltas R3, streak>0 R4, empties R5, period week/month R6, reviewGoalLabel R7, static skeleton R8, rounding R9, zero-delta omission R10); wiring with bound reviewOn (T5, R11).
- **Type consistency:** `journalStore.peek()→Journal`, `plannerStore.peek()→Planner`, `data.reviewOn(range)→Review`, screen `reviewOn`/`tz` props, `money`/`reviewGoalLabel` signatures. `periodWindowOf('week'|'month', day)` + `DayKey.from(now(), tz)`.
- **Test robustness:** screen tests use a canned `Review` via a fake `reviewOn` (no real stores needed for rendering); period-change asserted via a `vi.fn` reviewOn; all content in the screen's own shadow root (no nested components → `shadowRoot.textContent` is valid); data.reviewOn integration test uses a real data state + a day-period to bound the goal.
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
