# Vanilla-OYL Insights / Review Screen — Slice 1 (Dashboard, no life-wheel) — Design

**Status:** approved (recommendations R1–R7 baked in)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** Sub-project 2 of the "Goals / Insights" decomposition (Goals shipped). Insights itself splits: **Slice 1 (this) = the review dashboard minus the life-wheel; Slice 2 = the life-wheel** (needs activities/areas/projects catalogs). Builds on Journal/Planner/Vault/Goals.

---

## What this is

A read-only `#/insights` screen rendering the domain `review()` for a chosen period: spending/active-minutes/calories totals with period-over-period deltas, per-goal progress + streaks, top spending, activity totals, and planner completion rate.

**Key slicing insight:** only the **life-wheel** (`review().areas`) reads the activities/areas/projects catalogs. Every other section runs on journal + planner + goals. So Slice 1 passes `activities: []`, `areas: []` to `review()` and renders everything *except* `areas` — **no catalog plumbing needed**. (Slice 2 loads the catalogs and renders `areas`.)

Read-only: no composer, no mutations, no inline-confirm — simpler than the CRUD screens.

### Decisions (settled — R1–R7)

1. **(R1) `peek()` accessors, contained to the data layer.** `journalStore.peek()` / `plannerStore.peek()` return the *live* domain `Journal`/`Planner` (each touches its `revision` for reactivity). Named `peek` (not `snapshot` — it's the live instance, not a copy). Their ONLY caller is `data.reviewOn` in `data.js`; components never touch the raw aggregates. `review()` needs the instances and `track()` can't rebuild them from async `repos.list()`, so synchronous in-memory access is required.
2. **(R2) Spending is money in major units.** `Transaction.metrics()` emits `finance.spend.<category>` as `amount.toNumber()` (major units, single-currency by design), so `totals.spending`/`topSpending[].total`/`deltas.spending` are plain currency-unit numbers. Format spending as **`$42.50`** (single-currency `$` assumption — a user currency setting is a later refinement); calories + active-minutes are integers.
3. **(R3) Neutral deltas.** Delta polarity is metric-dependent (less spending good, more minutes good, fewer calories good), so coloring green/red would mislead. Show a direction arrow (↑/↓/·) + the formatted magnitude in a **neutral** color — no good/bad coloring.
4. **(R4) Streak shown only when > 0** (`🔥 N`); a 0-streak badge is noise.
5. **(R5) Graceful empties** in every section — `completionRate` `undefined` → "—"; no goals → "No goals yet"; empty spending/activity → muted "Nothing this period". An unseeded vault renders cleanly.
6. **(R6) Period = Week / Month** via the existing `periodWindowOf`, default **Month** (so the seed's ~2-week-old entries fall in range). No Day (too thin) or Year (needs a custom range) in v1.
7. **(R7 — corrected) `reviewGoalLabel(progress)` from `GoalProgress` alone.** `review()`'s `GoalReview` carries `{goalId, name?, progress, streak}` but **not** `direction`/`metric`/`unit`, so `goalProgressLabel` (needs direction+unit) can't be reused. The dashboard derives a label from `GoalProgress` only: paused → "Paused", empty → "No data", met → "Met", else `${round(ratio*100)}%`.

### Out of scope (Slice 2 / later)

- The **life-wheel** per-area rollup (`review().areas`) + activities/areas/projects catalog loading.
- `correlate()` insights; editing/drill-down; charts; year/custom ranges; multi-currency.

---

## Domain API this consumes (verified)

- `review(input): Review` — `input = { journal, planner, goals, activities, areas, projects?, period: DayRange }`. Returns `Review = { period, goals: GoalReview[], topSpending: {category, total}[], activityTotals: {slug, count, minutes}[], completionRate?: number, totals: ReviewTotals, previousTotals: ReviewTotals, deltas: ReviewTotals, areas }`. `ReviewTotals = { spending, activityMinutes, calories }`. `GoalReview = { goalId, name?, progress: GoalProgress, streak: number }`. Slice 1 ignores `areas`.
- `completionRate` is a **0–1 ratio** (done ÷ (done+open) among plans due in range; `undefined` when none).
- `periodWindowOf('week'|'month', day): DayRange` (ISO week Mon–Sun / calendar month).
- `@oyl/all-of-oyl` exports `review`, `Review`, `GoalReview`, `ReviewTotals`, `periodWindowOf`, `DayKey`. (`Journal`/`Planner` are already imported by their stores.)

---

## Architecture

### 1. `src/state/journal-store.js` + `src/state/planner-store.js` — `peek()`

Add to each returned object (read-only, reactive):
```js
// journal-store.js
    /** Live Journal aggregate for read-only insights — touches revision. @returns {Journal} */
    peek() { revision.get(); return journal },
```
```js
// planner-store.js  (add a /** @typedef … Planner */ if not present)
    /** Live Planner aggregate for read-only insights — touches revision. @returns {Planner} */
    peek() { revision.get(); return planner },
```

### 2. `src/state/data.js` — `reviewOn(range)`

```js
import { review } from '@oyl/all-of-oyl'
// …
  /** Compose the domain review for a period (reactive via the three peeks/all). @param {import('@oyl/all-of-oyl').DayRange} range */
  function reviewOn(range) {
    return review({
      journal: journal.peek(),     // touches journal.revision
      planner: planner.peek(),     // touches planner.revision
      goals: goals.all(),          // touches goals.revision
      activities: [],              // Slice 2 fills these
      areas: [],
      period: range,
    })
  }
  // add reviewOn to the returned object
```
Reading the three revisions means a `track()` calling `data.reviewOn(range)` re-runs when entries, plans, or goals change. No catalog loading in Slice 1.

### 3. `src/insights/format.js` — presentation helpers

```js
/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */

/** "$42.50" (major-unit, single-currency). @param {number} n @returns {string} */
export function money(n) { return `$${n.toFixed(2)}` }

/** A goal's review label from its progress alone (GoalReview lacks direction/unit). @param {GoalProgress} p @returns {string} */
export function reviewGoalLabel(p) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data'
  if (p.met === true) return 'Met'
  return `${Math.round(p.ratio * 100)}%`
}
```

### 4. `src/components/oyl-insights.js` — `<oyl-insights>` (the screen)

Properties: `data` (the data state — calls `data.reviewOn`), `tz`. A local `_period` signal (`'month'` default). Everything renders into the screen's own shadow root (no child components → tests can read `shadowRoot.textContent` directly).

Render skeleton: `<h2 tabindex="-1">Insights</h2>`, a period `<select>` (Week/Month), then section containers. One `this.track(() => { … })`:
```js
const today = DayKey.from(now(), this.tz)
const range = periodWindowOf(this._period.get(), today)   // 'week' | 'month'
const r = this.data.reviewOn(range)
// — Totals: 3 stats (Spending money(r.totals.spending), Active min r.totals.activityMinutes, Calories r.totals.calories),
//   each with a delta: arrow = d>0?'↑':d<0?'↓':'·'; magnitude = (spending? money(|d|) : String(|d|)); neutral color.
// — Completion: r.completionRate === undefined ? '—' : `${Math.round(r.completionRate*100)}%`
// — Goals: r.goals.map → `${name ?? 'Goal'} · ${reviewGoalLabel(progress)}` + (streak>0 ? ` · 🔥 ${streak}` : ''); empty → "No goals yet"
// — Top spending: r.topSpending.map → `${category} · ${money(total)}`; empty → muted "Nothing this period"
// — Activity: r.activityTotals.map → `${slug} · ${minutes ? minutes+' min' : ''}${count ? ' · '+count+'×' : ''}`; empty → muted "Nothing this period"
```
The period `<select>` change sets `_period`, re-running `track()`. A `.section-label` per section (reuse the vault/goals label style). `defineInsights()` idempotent.

### 5. Wiring

- `src/components/oyl-nav.js`: add `['insights', 'Insights']` to `ITEMS` (the nav already wraps from the Goals slice).
- `src/main.js`: `defineInsights()`; route `insights: () => { const v = document.createElement('oyl-insights'); v.data = dataState; v.tz = defaultTimezone(); return v }`.
- (No `data.js` return-shape change beyond adding `reviewOn`; the screen takes the whole `dataState`.)

---

## Data flow

```
period select change → _period signal → track() re-runs
  → range = periodWindowOf(period, today)
  → r = data.reviewOn(range)
       → review({ journal: journal.peek(), planner: planner.peek(), goals: goals.all(), activities:[], areas:[], period: range })
  → render totals/deltas, goals+streaks, spending, activity, completion
entries/plans/goals change elsewhere → their revision bumps → reviewOn re-reads → dashboard recomputes
```

## Error handling

- Pure read path; `review()` doesn't throw on empty inputs. Empty/undefined handled per R5.
- `peek()` exposes the live aggregate but is consumed only by `data.reviewOn` (which passes it to the read-only domain `review()`); no mutation path.

## Testing (Vitest + happy-dom)

- **`insights/format.test.js`** (new): `money(42.5)` → `'$42.50'`, `money(0)` → `'$0.00'`; `reviewGoalLabel` for paused/empty/met/ratio (e.g. `{ratio:0.8,...}` → `'80%'`).
- **`journal-store.test.js`** / **`planner-store.test.js`** (extend): `peek()` returns an aggregate whose methods work (e.g. `store.peek().aggregate?` / `store.peek().completionRate(range)`), and reflects added data.
- **`data.test.js`** (extend): `reviewOn(periodWindowOf('day', today))` returns a Review-shaped object; after saving a `Goal` + a matching `Measurement` and `refresh()`, `reviewOn(...).goals` has length 1 with `progress.current` set. (Use `fakeStorage` + the file's existing helpers; build the range with `periodWindowOf` + `DayKey.from(new Date(), defaultTimezone())`.)
- **`oyl-insights.test.js`** (new): with a **fake** `data = { reviewOn: (range) => REVIEW }` returning a canned `Review`, the screen renders totals (`$…`, minutes, calories), a delta arrow, a goal line with `🔥 N`, top spending, activity totals, and the completion %; changing the period `<select>` calls `reviewOn` again (assert via a spy and/or re-render). A second canned review with empty arrays + `completionRate: undefined` renders the empty states ("No goals yet", "Nothing this period", "—"). (Screen content is in its own shadow root — assert via `shadowRoot.textContent`.)

## File structure

```
apps/vanilla-oyl/src/
  state/journal-store.js        (modify: add peek)
  state/planner-store.js        (modify: add peek)
  state/data.js                 (modify: add reviewOn)
  insights/format.js            (new)
  components/oyl-insights.js     (new)
  components/oyl-nav.js         (modify: Insights nav item)
  main.js                       (modify: defineInsights + #/insights route)
  + new tests (format, oyl-insights); extend journal-store/planner-store/data tests
```

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/insights`:
- With **Month** selected, totals show the seed's spending ($), active minutes, calories, each with a delta arrow vs the previous month; goals list with progress + any streaks; top spending categories; activity totals; a completion %.
- Switch to **Week** → figures recompute for the current ISO week.
- Cross-check: log an entry in `#/journal`, return to `#/insights` → totals reflect it.
- On an unseeded vault (reset data), every section shows its empty state cleanly.
