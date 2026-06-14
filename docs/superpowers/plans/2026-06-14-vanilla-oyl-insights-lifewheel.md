# vanilla-oyl Insights Slice 2 (Life-wheel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `review().areas` as a per-area "Life areas" section on `#/insights` — by loading the activities/life-areas/projects catalogs into the data state and feeding them to `review()`.

**Architecture:** `data.js` loads the three catalogs (plain arrays) in `refresh()` and `reviewOn` passes them to `review()` instead of `[]`. A new `areaStatsLabel` helper + a "Life areas" section in `<oyl-insights>` render each `AreaRollup` (named areas always, unassigned only with signal, goals bar guarded against 0/0). Read-only; no new signals, nav, routes, or stores.

**Tech Stack:** Vanilla JS + JSDoc (strict checkJs), Vitest + happy-dom, `@oyl/all-of-oyl` (`review`/`AreaRollup`/`LifeArea`/`Activity`/`Project`).

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-insights-lifewheel-design.md` (decisions R-B–R-G).

---

## Conventions

- `.js` + JSDoc strict + checkJs. **No `innerHTML`**. STATIC imports. `@oyl/all-of-oyl` → TS source (no build for tests/typecheck).
- Bar widths via `style.setProperty('inline-size', …)` (round-trips in happy-dom). Screen content is in the screen's own shadow root → assert via `shadowRoot.textContent`.
- Scoped tests: `pnpm --filter @oyl/vanilla-oyl exec vitest run <pattern>`. Typecheck: `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit`.
- TDD per task: failing test → run (fail) → implement → run (pass) → typecheck → commit.

## File structure

**Modified:** `insights/format.js`, `state/data.js`, `components/oyl-insights.js` (+ extend their tests). No new files; no nav/route/store changes.

---

## Task 1: `insights/format.js` — `areaStatsLabel`

**Files:** Modify `apps/vanilla-oyl/src/insights/format.js`; test `apps/vanilla-oyl/src/insights/format.test.js`.

- [ ] **Step 1: Add the failing test.** In `format.test.js`, change the import to add `areaStatsLabel`:
```js
import { money, reviewGoalLabel, areaStatsLabel } from './format.js'
```
Append:
```js
describe('areaStatsLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').AreaRollup>} [o] @returns {any} */
  const a = (o = {}) => ({ name: 'Health', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0, ...o })
  it('composes present parts and pluralizes', () => {
    expect(areaStatsLabel(a({ goalsMet: 2, goalsTotal: 3, activityMinutes: 120, projectsTouched: 1 }))).toBe('2/3 goals · 120 min · 1 project')
    expect(areaStatsLabel(a({ projectsTouched: 2 }))).toBe('2 projects')
    expect(areaStatsLabel(a())).toBe('Nothing tracked')
  })
})
```

- [ ] **Step 2: Run → FAIL** (`areaStatsLabel is not a function`): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/insights/format.test.js`

- [ ] **Step 3: Implement.** Append to `apps/vanilla-oyl/src/insights/format.js`:
```js
/** @typedef {import('@oyl/all-of-oyl').AreaRollup} AreaRollup */

/** "2/3 goals · 120 min · 1 project" from the present parts; "Nothing tracked" when all empty. @param {AreaRollup} a @returns {string} */
export function areaStatsLabel(a) {
  const parts = []
  if (a.goalsTotal > 0) parts.push(`${a.goalsMet}/${a.goalsTotal} goals`)
  if (a.activityMinutes > 0) parts.push(`${Math.round(a.activityMinutes)} min`)
  if (a.projectsTouched > 0) parts.push(`${a.projectsTouched} project${a.projectsTouched === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Nothing tracked'
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/insights/format.js apps/vanilla-oyl/src/insights/format.test.js
git commit -m "feat(vanilla-oyl): insights areaStatsLabel (life-wheel per-area stats)"
```

---

## Task 2: `state/data.js` — load catalogs + feed `review()`

**Files:** Modify `apps/vanilla-oyl/src/state/data.js`; test `apps/vanilla-oyl/src/state/data.test.js`.

- [ ] **Step 1: Add the failing test.** In `data.test.js`, add an import (the file already imports `periodWindowOf`, `DayKey`, `createDataState`, `createThemeState`, `defaultTimezone`, `fakeStorage`):
```js
import { loadDemoData } from '../storage/seed.js'
```
Append inside `describe('data state', …)`:
```js
  it('reviewOn includes named life areas from the loaded catalogs', async () => {
    const storage = fakeStorage()
    const ds = createDataState(storage, createThemeState(storage))
    await loadDemoData(storage)
    await ds.refresh()
    const day = DayKey.from(new Date(), defaultTimezone())
    const r = ds.reviewOn(periodWindowOf('month', day))
    expect(r.areas.map((a) => a.name)).toContain('Health')
  })
```

- [ ] **Step 2: Run → FAIL** (`review()` gets empty `areas`, so no 'Health'): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/state/data.test.js`

- [ ] **Step 3: Implement** in `apps/vanilla-oyl/src/state/data.js`.

**3a.** After `const goals = createGoalsStore(repos.goals)`, add the catalog arrays:
```js
  /** @type {readonly import('@oyl/all-of-oyl').LifeArea[]} */
  let lifeAreas = []
  /** @type {readonly import('@oyl/all-of-oyl').Activity[]} */
  let activities = []
  /** @type {readonly import('@oyl/all-of-oyl').Project[]} */
  let projects = []
```

**3b.** In `refresh()`, after `await goals.hydrate()`, add the catalog loads:
```js
    lifeAreas = await repos.lifeAreas.list()
    activities = await repos.activities.list()
    projects = await repos.projects.list()
```

**3c.** Replace the `reviewOn` function's body + doc. Replace:
```js
  /**
   * Compose the domain review for a period. Reactive: journal.peek()/planner.peek()/goals.all()
   * each touch their revision, so a reactive reader (the insights screen) re-runs on any change.
   * Slice 1 passes empty activities/areas — only the life-wheel (a later slice) needs the catalogs.
   * @param {import('@oyl/all-of-oyl').DayRange} range @returns {import('@oyl/all-of-oyl').Review}
   */
  function reviewOn(range) {
    return review({
      journal: journal.peek(),
      planner: planner.peek(),
      goals: goals.all(),
      activities: /** @type {any[]} */ ([]),
      areas: /** @type {any[]} */ ([]),
      period: range,
    })
  }
```
with:
```js
  /**
   * Compose the domain review for a period. Reactive: journal.peek()/planner.peek()/goals.all()
   * each touch their revision, so a reactive reader (the insights screen) re-runs on any change.
   * The activities/areas/projects catalogs feed the life-wheel (review().areas); they reload in
   * refresh() alongside the hydrates, so a catalog change always coincides with a tracked revision.
   * @param {import('@oyl/all-of-oyl').DayRange} range @returns {import('@oyl/all-of-oyl').Review}
   */
  function reviewOn(range) {
    return review({
      journal: journal.peek(),
      planner: planner.peek(),
      goals: goals.all(),
      activities,
      areas: lifeAreas,
      projects,
      period: range,
    })
  }
```

- [ ] **Step 4: Run → PASS** (existing + 1 new).
- [ ] **Step 5: Typecheck → clean.** (`repos.lifeAreas.list()` is `any[]`, assignable to the typed `let`s; `review()` takes `readonly` arrays.)
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/state/data.js apps/vanilla-oyl/src/state/data.test.js
git commit -m "feat(vanilla-oyl): load catalogs + feed them to data.reviewOn (life-wheel)"
```

---

## Task 3: `components/oyl-insights.js` — the "Life areas" section

**Files:** Modify `apps/vanilla-oyl/src/components/oyl-insights.js`; test `apps/vanilla-oyl/src/components/oyl-insights.test.js`.

- [ ] **Step 1: Add the failing tests.** In `oyl-insights.test.js`:
Append a new test inside `describe('<oyl-insights>', …)` (the shared `review()` helper keeps `areas: []`, so the Slice-1 tests are untouched):
```js
  it('renders the Life areas section (named always; unassigned only with signal; guards 0/0)', async () => {
    const el = screen(() => review({ areas: [
      { areaId: 'a1', name: 'Health', goalsMet: 2, goalsTotal: 3, activityMinutes: 120, projectsTouched: 1 },
      { areaId: 'a2', name: 'Family', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
      { name: 'unassigned', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0 },
    ] }))
    await Promise.resolve()
    const text = root(el).textContent ?? ''
    expect(text).toContain('Health')
    expect(text).toContain('2/3 goals')
    expect(text).toContain('Family')
    expect(text).toContain('Nothing tracked')      // Family has no signal
    expect(text).not.toContain('Unassigned')        // unassigned w/o signal → filtered out
    const fills = /** @type {HTMLElement[]} */ ([...root(el).querySelectorAll('.area-bar .fill')])
    expect(fills).toHaveLength(1)                    // only Health (goalsTotal>0) gets a bar
    for (const f of fills) expect(f.style.getPropertyValue('inline-size')).not.toContain('NaN')
    el.remove()
  })
```
And in the existing **'omits delta chips …'** empty-states test, add one assertion (its `areas` defaults to `[]`):
```js
    expect(text).toContain('No areas tracked')
```

- [ ] **Step 2: Run → FAIL** (no "Life areas" section): `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-insights.test.js`

- [ ] **Step 3: Implement** — four edits to `apps/vanilla-oyl/src/components/oyl-insights.js`:

**3a.** Replace the format import:
```js
import { money, reviewGoalLabel } from '../insights/format.js'
```
with:
```js
import { money, reviewGoalLabel, areaStatsLabel } from '../insights/format.js'
```

**3b.** In the `sheet(...)` template, after the `.muted { … }` rule, add:
```css
  .area { padding: .5rem 0; border-top: 1px solid var(--color-border); }
  .area .head { display: flex; justify-content: space-between; gap: 1rem; }
  .area-bar { block-size: .35rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; margin-block-start: .35rem; }
  .area-bar .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
```

**3c.** After the activity section containers (the `const actEmpty = this._empty()` line), add:
```js
    const areaLabel = this._label('Life areas')
    const areaList = document.createElement('div')
    const areaEmpty = this._empty()
```
and append them to the root — replace the existing `root.append(...)` line:
```js
    root.append(h2, head, totals, completionLabel, completion, goalsLabel, goalsList, goalsEmpty, spendLabel, spendList, spendEmpty, actLabel, actList, actEmpty)
```
with:
```js
    root.append(h2, head, totals, completionLabel, completion, goalsLabel, goalsList, goalsEmpty, spendLabel, spendList, spendEmpty, actLabel, actList, actEmpty, areaLabel, areaList, areaEmpty)
```

**3d.** At the END of the `this.track(() => { … })` callback — immediately after the activity block (the `actEmpty.textContent = …` line) and before the callback's closing `})` — insert:
```js

      // Life areas (R-C: named always; unassigned only with signal. R-G: catalog order, no sort.)
      const areas = r.areas.filter((a) => a.areaId !== undefined || a.goalsTotal > 0 || a.activityMinutes > 0 || a.projectsTouched > 0)
      areaList.replaceChildren()
      for (const a of areas) {
        const wrap = document.createElement('div')
        wrap.className = 'area'
        const head2 = document.createElement('div')
        head2.className = 'head'
        const name = document.createElement('span')
        name.textContent = a.areaId === undefined ? 'Unassigned' : a.name
        const stats = document.createElement('span')
        stats.textContent = areaStatsLabel(a)
        head2.append(name, stats)
        wrap.append(head2)
        if (a.goalsTotal > 0) { // R-B: no bar when no goals (avoids 0/0 NaN)
          const bar = document.createElement('div')
          bar.className = 'area-bar'
          const fill = document.createElement('div')
          fill.className = 'fill'
          fill.style.setProperty('inline-size', `${Math.round((a.goalsMet / a.goalsTotal) * 100)}%`)
          bar.append(fill)
          wrap.append(bar)
        }
        areaList.append(wrap)
      }
      areaEmpty.hidden = areas.length > 0
      areaEmpty.textContent = areas.length > 0 ? '' : 'No areas tracked'
```

- [ ] **Step 4: Run → PASS** (existing + 1 new; the empty test now also asserts "No areas tracked"). Then full suite: `pnpm --filter @oyl/vanilla-oyl exec vitest run` and report the total.
- [ ] **Step 5: Typecheck → clean.**
- [ ] **Step 6: Commit.**
```bash
git add apps/vanilla-oyl/src/components/oyl-insights.js apps/vanilla-oyl/src/components/oyl-insights.test.js
git commit -m "feat(vanilla-oyl): oyl-insights Life areas section (per-area rollup rows)"
```

---

## Final acceptance (after all tasks)

- [ ] **Full gates:** `pnpm --filter @oyl/vanilla-oyl exec vitest run` (all green: 183 prior + ~3 new ≈ 186) + `pnpm --filter @oyl/vanilla-oyl exec tsc --noEmit` (clean).
- [ ] **Browser (real Chrome):** `pnpm vanilla dev` (builds + vendors + serves on 8041; **hard-reload**), open `#/insights`, Load demo data:
  - A **Life areas** section (after Activity) lists, in catalog order, **Health** (goals bar + "x/y goals · N min"), **Family** / **Money** / **Career** as "Nothing tracked", and **Unassigned** ("x/2 goals" — it carries the two unassigned goals).
  - No broken/`NaN` bars on the goal-less areas.
  - Switch Week/Month → the rollup recomputes.
  - Reset data (Status) → the section shows "No areas tracked".
- [ ] **Final code review** of the branch, then **finishing-a-development-branch**.

---

## Self-review notes (author)

- **Spec coverage:** `areaStatsLabel` (T1); catalog loading + `reviewOn` feed (T2); the Life areas section with the named-always/unassigned-if-signal filter (R-C), the `goalsTotal>0` bar guard (R-B), catalog order preserved (R-G), pluralized projects (R-F) (T3).
- **Type consistency:** `LifeArea`/`Activity`/`Project`/`AreaRollup` all exported; catalog `let`s typed `readonly …[]`, fed to `review()`'s `readonly` params; `areaStatsLabel(AreaRollup)` matches the screen's usage.
- **No regressions:** the shared `review()` test helper keeps `areas: []`, so the Slice-1 screen tests are untouched (the new section renders "No areas tracked" under them, now asserted in the empty test). Reactivity unchanged (catalogs reload inside the same `refresh()` that bumps the tracked revisions).
- **Test robustness:** bar width asserted via `getPropertyValue('inline-size')` (+ a `not.toContain('NaN')` guard for R-B); data test uses `loadDemoData` so the catalog feed is real, not constructor-guessed.
- **Placeholder scan:** clean — every code step is complete and copy-pasteable.
