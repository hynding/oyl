# Vanilla-OYL Insights / Review Screen — Slice 2 (Life-wheel) — Design

**Status:** approved (per-area rows chosen; recommendations R-B–R-F baked in)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Predecessor:** Insights Slice 1 (the review dashboard minus the life-wheel), merged. Spec: `2026-06-14-vanilla-oyl-insights-screen-design.md`.

---

## What this is

The final Insights slice: render `review().areas` — the per-area life-wheel rollup that Slice 1 ignored. This is the *only* part of `review()` that reads the **activities / life-areas / projects** catalogs, so Slice 2 loads those three catalogs into the data state and renders a **"Life areas"** section (per-area rows) on `<oyl-insights>`.

Read-only; no catalog CRUD (areas/activities/projects come from the seed/import — this app doesn't author them yet).

### Decisions (settled)

1. **Per-area rows** (not a radial SVG wheel) — consistent with the rest of the dashboard; a radial viz is a possible later polish.
2. **(R-C) Show all named areas always; the `unassigned` bucket only when it has signal.** The wheel is about *balance*, so an empty Family/Money area is a meaningful gap, not noise. The unassigned bucket (areaId undefined) renders only if `goalsTotal > 0 || activityMinutes > 0 || projectsTouched > 0`, displayed capitalized as **"Unassigned"**. A named area with no signal shows its name + a muted **"Nothing tracked"**. Section empty state **"No areas tracked"** when the filter leaves nothing.
3. **(R-B) Guard `goalsTotal === 0`.** The goals-met bar *and* the "X/Y goals" text render only when `goalsTotal > 0` — otherwise `goalsMet / goalsTotal` is `0/0 = NaN` (broken bar). Areas without goals (Family/Money/Career) show no goals bar.
4. **(R-D) `areaStatsLabel(rollup)` in `insights/format.js`** composes the present parts; the goals-met **bar** (guarded ratio) stays in the screen.
5. **(R-F) Pluralize** "1 project" / "2 projects".
6. **No new signals (R-A confirmed):** catalogs are plain arrays loaded in `refresh()`; they change only on boot/seed/import/multi-tab, which also re-hydrates journal/planner/goals (bumping the revisions the insights screen already tracks) — so the dashboard recomputes and picks up new catalogs.
7. **(R-G) Render in catalog order — no sorting.** `review()` returns rollups in the order `lifeAreas` were passed (+ unassigned last). Preserve that order; do NOT sort by activity/goals-met — a wheel-of-life is a *stable* set of areas, and reordering defeats the balance read.

### Out of scope

- Catalog CRUD (authoring areas/activities/projects); radial/spider chart; drill-down; the Finance project.

---

## Domain API this consumes (verified)

- `review({ …, activities, areas, projects, period })` → `Review.areas: readonly AreaRollup[]`.
- `AreaRollup = { areaId?: Id, name: string, goalsMet: number, goalsTotal: number, activityMinutes: number, projectsTouched: number }`. `review()` returns one rollup per passed area (in order) plus a trailing `{ areaId: undefined, name: 'unassigned', … }`.
- `@oyl/all-of-oyl` exports `AreaRollup` (type). The `lifeAreas`/`activities`/`projects` codecs are already in `COLLECTIONS`, so `repos.lifeAreas`/`repos.activities`/`repos.projects` exist.
- Seed catalogs (for acceptance): areas Health / Family / Career / Money; activities Run + Meditate → Health; goals Eat lighter + Run weekly → Health (Sleep/Trim unassigned); project "Spring reset" → Career.

---

## Architecture

### 1. `src/state/data.js` — load catalogs + pass them to `review()`

Hold three plain arrays in `createDataState`, initialized empty:
```js
  /** @type {readonly import('@oyl/all-of-oyl').LifeArea[]} */
  let lifeAreas = []
  /** @type {readonly import('@oyl/all-of-oyl').Activity[]} */
  let activities = []
  /** @type {readonly import('@oyl/all-of-oyl').Project[]} */
  let projects = []
```
Load them in `refresh()` (alongside the existing hydrates):
```js
    lifeAreas = await repos.lifeAreas.list()
    activities = await repos.activities.list()
    projects = await repos.projects.list()
```
Update `reviewOn` to pass them (replacing the Slice-1 empty arrays):
```js
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
Reactivity unchanged: `peek()`/`all()` touch the journal/planner/goals revisions; catalogs only change inside the same `refresh()` that re-hydrates those aggregates, so any catalog change coincides with a revision bump the screen tracks. (No `data.js` return-shape change — `reviewOn` already exported.)

### 2. `src/insights/format.js` — `areaStatsLabel`

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

### 3. `src/components/oyl-insights.js` — the "Life areas" section

Add static skeleton (built once in `render()`, after the Activity section): a `.section-label` "Life areas", an `areaList` container, and an `areaEmpty` muted element. Append them to the root after the activity nodes.

In the existing `track()`, after the activity block, append:
```js
const areas = r.areas.filter((a) => a.areaId !== undefined || a.goalsTotal > 0 || a.activityMinutes > 0 || a.projectsTouched > 0)
areaList.replaceChildren()
for (const a of areas) {
  const wrap = document.createElement('div')
  wrap.className = 'area'
  const head = document.createElement('div')
  head.className = 'head'
  const name = document.createElement('span')
  name.textContent = a.areaId === undefined ? 'Unassigned' : a.name
  const stats = document.createElement('span')
  stats.textContent = areaStatsLabel(a)
  head.append(name, stats)
  wrap.append(head)
  if (a.goalsTotal > 0) {                       // R-B: no bar when no goals (avoids 0/0 NaN)
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
Import `areaStatsLabel` from `../insights/format.js`. Styles to add to the sheet:
```css
  .area { padding: .5rem 0; border-top: 1px solid var(--color-border); }
  .area .head { display: flex; justify-content: space-between; gap: 1rem; }
  .area-bar { block-size: .35rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; margin-block-start: .35rem; }
  .area-bar .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
```
(`fill` width via `setProperty('inline-size', …)` so it round-trips in happy-dom — same as the goal row.)

---

## Data flow

```
boot/seed/import → refresh() re-hydrates journal/planner/goals (revisions bump) + reloads lifeAreas/activities/projects
insights screen track() → reviewOn(range) → review({ …, activities, areas: lifeAreas, projects }) → r.areas
  → filter (named always + unassigned-if-signal) → per-area rows (name + areaStatsLabel + goals bar when goalsTotal>0)
```

## Error handling

- `goalsTotal === 0` guarded (no NaN bar). `review()` is pure/read-only; empty catalogs → `areas` is just the unassigned rollup (filtered out if empty → "No areas tracked").

## Testing (Vitest + happy-dom)

- **`insights/format.test.js`** (extend): `areaStatsLabel` — full row `{goalsMet:2,goalsTotal:3,activityMinutes:120,projectsTouched:1}` → `'2/3 goals · 120 min · 1 project'`; `{projectsTouched:2}` → `'2 projects'`; all-zero → `'Nothing tracked'`.
- **`data.test.js`** (extend): after `loadDemoData(storage)` + `ds.refresh()`, `ds.reviewOn(periodWindowOf('month', today)).areas` `.map(a => a.name)` contains `'Health'` (catalogs feed `review()`). (Import `loadDemoData` from `../storage/seed.js`.)
- **`oyl-insights.test.js`** (extend): keep the shared `review()` helper's `areas: []` (so Slice-1 tests are untouched). New test feeds `review({ areas: [ {areaId:'a1',name:'Health',goalsMet:2,goalsTotal:3,activityMinutes:120,projectsTouched:1}, {areaId:'a2',name:'Family',goalsMet:0,goalsTotal:0,activityMinutes:0,projectsTouched:0}, {name:'unassigned',goalsMet:0,goalsTotal:0,activityMinutes:0,projectsTouched:0} ] })` and asserts: text contains "Health", "2/3 goals", "Family", "Nothing tracked"; does NOT contain "Unassigned" (no signal → filtered); no `.area .fill` `inline-size` contains "NaN" (R-B). Add to the existing empty-states test: `expect(text).toContain('No areas tracked')` (its `areas: []`).

## File structure

```
apps/vanilla-oyl/src/
  state/data.js                 (modify: load lifeAreas/activities/projects; reviewOn passes them)
  insights/format.js            (modify: add areaStatsLabel)
  components/oyl-insights.js     (modify: add the Life areas section)
  + extend data / format / oyl-insights tests
```
No nav/route/store changes — `#/insights` already exists; catalogs load through the existing `repos` + `refresh()`.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/insights`:
- A **Life areas** section lists (in catalog order) **Health** (goals bar + "x/y goals · N min"), **Family** / **Money** / **Career** as "Nothing tracked" (the seed has no June task linked to "Spring reset", so Career's `projectsTouched` is 0), and **Unassigned** (it carries the two unassigned goals → has signal → shown, e.g. "x/2 goals").
- No broken/`NaN` bars on the goal-less areas.
- Switch Week/Month → the rollup recomputes.
- Reset data → "No areas tracked".
