# Vanilla-OYL Goals Screen — Design

**Status:** approved (recommendations R1–R6 baked in)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** First sub-project of the decomposed "Goals / Insights" area (Insights/Review and a Finance project — budgets + the deferred `SubscriptionCharge → Transaction` seam — come later). Builds on the Journal/Planner/Vault screens.

---

## What this is

A `#/goals` screen: list goals with their **current-period progress**, add and delete goals, and pause/resume judgment. Progress is derived live from the Journal (a `Goal` targets a metric key and aggregates journal entries), so the screen composes the existing `JournalStore` with a new `GoalsStore`. Add/delete only — no editing. Pause/resume is the open-ended "vacation" toggle.

The demo seed has four goals (calories, run, sleep, weight — one already paused), so the screen renders real progress + a paused state immediately.

### Decisions (settled — R1–R6)

1. **(R1) Metric via a curated preset `<select>`, not free-text.** A `Goal.metric` is a `MetricKey` from an open namespaced vocabulary; free-text is error-prone. The composer offers a fixed preset list, each bundling metric + default `aggregation` + default `direction` + default `period` + display unit.
2. **(R2) `GoalsStore` is journal-agnostic; the journal store gains a `progressOf` passthrough.** Goal progress is derived from journal entries, so it must recompute when *either* goals or journal entries change. We add `journalStore.progressOf(goal, day)` (reads the journal `revision`, returns `goal.progressOn(journal, day)`) rather than leaking the mutable `Journal`. The screen tracks `goalsStore.revision` (list + pause state) AND calls `journalStore.progressOf` (entries) — no store-to-store coupling.
3. **(R3) Pause/resume in scope, minimal.** Single-click open-ended pause (`goal.pause(today)`) / resume (`goal.resume(today)`), as stateful store mutations (mutate in place → persist → re-hydrate, rollback-on-failure — the renew/recordContact pattern). Ranged pauses deferred.
4. **(R4) Add/delete only** — no editing (consistent with vault); pause/resume covers the main "adjust" need.
5. **(R5) Progress row with distinct states.** Render `ratio` as a bar with met (accent + ✓) / in-progress (neutral) / **paused** (muted "Paused") / **empty** (muted "No data this period"); `atLeast` reads "12 / 20 h", `atMost` reads "1800 of 2200 kcal used".
6. **(R6) Target unit hint** beside the target input, from the preset.
7. **(R7) Target input `step="any"`** — accept decimal targets without number-input validity errors.
8. **(R8) No failure state for `met === false`** — only `met === true` is highlighted (accent + ✓); in-progress/over-budget render neutral, the label carries the nuance.
9. **(R9) `GoalsStore.all()` returns a copy** — consistent with the domain stores; internal array stays unmutated.
10. **(R10) Nav wraps** — `flex-wrap: wrap` added as the bar reaches 5–6 items.

### Out of scope (future)

- Editing goals; ranged/scheduled pauses.
- Streaks, area grouping, life-wheel, deltas (the Insights/Review screen).
- Budgets + finance (the Finance sub-project).
- Free-text / custom metric keys.

---

## Domain API this consumes (verified)

- `new Goal({ id?, name?, metric: string, target: number (>0), direction: 'atLeast'|'atMost', period: 'day'|'week'|'month', aggregation?: 'sum'|'avg'|'last', emptyPeriods?, areaId? })`. Throws `INVALID_QUANTITY` on empty name / non-positive target.
- `goal.progressOn(journal, day): GoalProgress` = `{ current, target, ratio (0–1), met?, paused, empty }` — judges the period window containing `day`.
- `goal.pause(from: DayKey, to?: DayKey)` (open-ended when `to` omitted); `goal.resume(on: DayKey)` (throws if no open pause); `goal.pauses: readonly {from, to?}[]`.
- `GOAL_PERIODS = ['day','week','month']`; `periodWindowOf` is internal to `progressOn`.
- `@oyl/all-of-oyl` exports `Goal`, `GoalDirection`, `GoalProgress`, `GoalPeriod`, `GOAL_PERIODS`. The journal aggregate (`AggregateKind = 'sum'|'avg'|'last'`) drives `progressOn`.
- The `goals` codec is already in `COLLECTIONS`; `repos.goals` exists and `data.js` already hydrates nothing for it yet (added here).

---

## Architecture

### 1. `src/state/journal-store.js` — add `progressOf`

The store already wraps a private `journal` (`let journal = new Journal(tz)`) + a `revision` signal. Add one read method to the returned object:
```js
    /** Current-period progress of a goal, judged at `day`. Reactive to journal entries. @param {Goal} goal @param {DayKey} day @returns {GoalProgress} */
    progressOf(goal, day) {
      revision.get()
      return goal.progressOn(journal, day)
    },
```
Add `Goal`/`GoalProgress` typedefs. This is the only journal-store change.

### 2. `src/state/goals-store.js` — `createGoalsStore(goalsRepo)`

Journal-agnostic. Persist-first add/remove (vault pattern); pause/resume are stateful mutations (planner-cancel pattern):
```js
export function createGoalsStore(goalsRepo) {
  let goals = []          // domain Goal[] (the aggregate here is just the list)
  let n = 0
  const revision = signal(0)

  async function hydrate() { goals = await goalsRepo.list(); revision.set((n += 1)) }

  return {
    revision, hydrate,
    /** @param {Goal} g */ async add(g) { const saved = await goalsRepo.save(g); goals = [...goals, saved]; revision.set((n += 1)); return saved },
    /** @param {Id} id */ async remove(id) { await goalsRepo.delete(id); goals = goals.filter((x) => x.id !== id); revision.set((n += 1)) },
    /** @param {Id} id @param {DayKey} on */ async pause(id, on) {
      const g = goals.find((x) => x.id === id); if (!g) return
      g.pause(on)
      try { await goalsRepo.save(g) } catch (err) { await hydrate(); throw err }
      await hydrate()
    },
    /** @param {Id} id @param {DayKey} on */ async resume(id, on) {
      const g = goals.find((x) => x.id === id); if (!g) return
      g.resume(on)
      try { await goalsRepo.save(g) } catch (err) { await hydrate(); throw err }
      await hydrate()
    },
    /** @returns {readonly Goal[]} */ all() { revision.get(); return [...goals] }, // R9: copy, matching the domain stores
  }
}
```
(Unlike journal/vault there's no domain "Goals" aggregate — the list *is* the collection. `pause`/`resume` mutate a `Goal` in place then persist + re-hydrate, so the re-hydrated instances stay canonical.)

### 3. `src/goal/format.js` — presentation helpers

```js
const UNITS = { 'sleep.hours': 'h', 'body.weight_kg': 'kg', 'nutrition.calories': 'kcal', 'activity.run.minutes': 'min', 'screen.minutes': 'min' }

/** Display unit for a goal metric ("" when unknown). @param {string} metric @returns {string} */
export function metricUnit(metric) { return UNITS[metric] ?? '' }

/** Compact number: integer as-is, else 1 decimal. @param {number} n @returns {string} */
function compact(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1) }

/**
 * Progress text honoring direction + state. paused/empty take precedence.
 * atLeast → "12 / 20 h"; atMost → "1800 of 2200 kcal used".
 * @param {GoalProgress} p @param {GoalDirection} direction @param {string} unit @returns {string}
 */
export function goalProgressLabel(p, direction, unit) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data this period'
  const u = unit ? ` ${unit}` : ''
  return direction === 'atMost' ? `${compact(p.current)} of ${compact(p.target)}${u} used` : `${compact(p.current)} / ${compact(p.target)}${u}`
}
```

### 4. `src/components/oyl-goal-composer.js` — `<oyl-goal-composer>`

Properties `store` (GoalsStore), `onAdded`. A module-level preset table:
```js
const PRESETS = [
  { label: 'Sleep (hours)',     metric: 'sleep.hours',          direction: 'atLeast', aggregation: 'sum',  period: 'day' },
  { label: 'Weight (kg)',       metric: 'body.weight_kg',       direction: 'atMost',  aggregation: 'last', period: 'day' },
  { label: 'Calories',          metric: 'nutrition.calories',   direction: 'atMost',  aggregation: 'sum',  period: 'day' },
  { label: 'Run minutes',       metric: 'activity.run.minutes', direction: 'atLeast', aggregation: 'sum',  period: 'week' },
  { label: 'Screen time (min)', metric: 'screen.minutes',       direction: 'atMost',  aggregation: 'sum',  period: 'day' },
]
```
Fields (form, reusing the composer CSS conventions — `.field`, `[data-role="error"]`, `button.primary`):
- **Metric** `<select name="preset">` (options = preset labels, value = index). On change, update the target's unit hint + the period default.
- **Name** (optional text).
- **Target** (number, `min="0"`, **`step="any"`** so decimal targets like 81.5 kg / 7.5 h aren't rejected by number-input validity — R7) with a unit hint span (`metricUnit(preset.metric)`) beside it (R6).
- **Period** `<select name="period">` (day/week/month), defaulted from the preset on preset-change.

Submit builds:
```js
const p = PRESETS[Number(presetSel.value)]
const props = { metric: p.metric, target: Number(target.value), direction: p.direction, aggregation: p.aggregation, period: /** @type {any} */ (periodSel.value) }
if (name.value) props.name = name.value
await this.store.add(new Goal(props))
```
Validation delegated to the domain (`target` 0/NaN → `Goal` throws → caught + inline error, like the vault composer). No new error path.

### 5. `src/components/oyl-goal-row.js` — `<oyl-goal-row>`

Mirrors `oyl-subscription-row` (two actions; Delete via shared `inlineConfirm`). Properties: `goal` (Goal), `progress` (GoalProgress — passed by the screen, already computed), `onPause` / `onResume` / `onDelete` (`(id) => void`).
Render:
- **title** = `goal.name ?? goal.metric` (no coupling to the composer's preset table; seeded goals carry names, so the raw-metric fallback is rare).
- a **progress bar**: a track + a fill element whose inline `style.inlineSize = (ratio * 100) + '%'`; add a `met` class when `progress.met === true`, and a `muted` class when `paused` or `empty` (greyed track). **(R8) `met === false` is NOT a failure state** — for an in-progress `atLeast` goal `met` is false all period until the target is hit, so it must render as neutral in-progress, never red/"missed". Only `met === true` gets the accent + ✓; an over-budget `atMost` (ratio clamped to 1, `met` false) stays neutral and the label conveys the overage ("2300 of 2200 used").
- **label line**: `goalProgressLabel(progress, goal.direction, metricUnit(goal.metric))`.
- actions: **Pause** when not paused / **Resume** when `progress.paused` (single click → `onPause`/`onResume`), and **Delete** (inline-confirm).

`defineGoalRow()` idempotent.

### 6. `src/components/oyl-goals.js` — `<oyl-goals>` (screen)

Properties: `store` (GoalsStore), `journal` (JournalStore — for `progressOf`), `tz`. Renders `<h2 tabindex="-1">Goals</h2>`, an `aria-live` region, the composer, then the goals list + empty state. In `this.track()`:
```js
const today = DayKey.from(now(), this.tz)
const goals = this.store.all()
list.replaceChildren()
for (const g of goals) {
  const row = document.createElement('oyl-goal-row')
  row.goal = g
  row.progress = this.journal.progressOf(g, today) // touches journal revision → reactive to entries
  row.onPause = (id) => { void this.store.pause(id, today); live.textContent = 'Paused' }
  row.onResume = (id) => { void this.store.resume(id, today); live.textContent = 'Resumed' }
  row.onDelete = (id) => { void this.store.remove(id); live.textContent = 'Deleted' }
  const li = document.createElement('li'); li.append(row); list.append(li)
}
empty.hidden = goals.length > 0; empty.textContent = empty.hidden ? '' : 'No goals yet.'
```
Reading both `store.all()` and `journal.progressOf(...)` inside one `track()` subscribes to both revisions, so progress updates when goals change *or* entries change. Register `defineGoalComposer()` + `defineGoalRow()` in `render()`.

### 7. Wiring

- `src/state/data.js`: `import { createGoalsStore }`; `const goals = createGoalsStore(repos.goals)`; `await goals.hydrate()` in `refresh()`; add `goals` to the returned object.
- `src/components/oyl-nav.js`: add `['goals', 'Goals']` to `ITEMS`, and add `flex-wrap: wrap` to the `nav` style rule (R10 — 5 items now, 6 with Insights).
- `src/main.js`: `defineGoals()`; route `goals: () => { const v = document.createElement('oyl-goals'); v.store = dataState.goals; v.journal = dataState.journal; v.tz = defaultTimezone(); return v }`.

---

## Data flow

```
add goal (composer) → new Goal({metric,target,direction,aggregation,period,name?}) → store.add → persist-first → list repaints; progressOf computes from current journal
log a journal entry elsewhere → journal revision bumps → goals screen's progressOf re-runs → bars update
Pause/Resume (single click) → store.pause/resume(id, today) → goal.pause/resume in place → persist → re-hydrate → row flips Paused/Resumed
delete → store.remove(id) → soft-delete + list repaint
```

## Error handling

- Composer validation delegated to the domain (non-positive target → `Goal` throws → inline `[data-role="error"]`). Preset-select metric/direction/aggregation are always valid.
- `resume` on a goal with no open pause throws `ILLEGAL_TRANSITION` — but the row only shows **Resume** when `progress.paused` is true, so it can't be triggered in normal flow; the store still try/catches (rollback) like the other mutations.
- pause/resume/add/remove failures reject; the screen stays silent on failure (consistent with prior screens).

## Testing (Vitest + happy-dom)

- **`journal-store.test.js`** (extend): `progressOf` returns a goal's progress and reflects journal entries — add a measurement the goal targets, assert `progressOf(goal, day).current`/`.ratio`; with no data, `.empty === true`.
- **`goals-store.test.js`** (new): `add`/`all`/`remove` persist-first; `pause(id, today)` leaves an open pause (`all()[0].pauses` has an entry with no `to`); `resume(id, today)` closes it; a failing save rolls back (re-hydrate) and rethrows.
- **`goal/format.test.js`** (new): `metricUnit` (known + unknown → ''); `goalProgressLabel` for atLeast / atMost / paused / empty, with integer + decimal currents.
- **`oyl-goal-composer.test.js`** (new): selecting a preset + target + period builds a `Goal` with the preset's metric/direction/aggregation and chosen period/target; a non-positive target surfaces the inline error and doesn't add; the unit hint reflects the selected preset.
- **`oyl-goal-row.test.js`** (new): renders title + label + a bar sized to `ratio`; `met` state styles the bar; a paused progress shows "Paused" and a **Resume** action (calls `onResume`); a non-paused goal shows **Pause** (calls `onPause`); Delete → `confirm-yes` calls `onDelete`, `confirm-no` reverts.
- **`oyl-goals.test.js`** (new): with a seeded goals store + a journal store, renders one `oyl-goal-row` per goal with progress; pausing flips the row; deleting removes it. (Use the **real** `createJournalStore`/`createGoalsStore` so `progressOf` reactivity works; assert via the row's shadow root / props, NOT the screen's `textContent` — child content lives in the row's own shadow DOM.)

## File structure

```
apps/vanilla-oyl/src/
  state/journal-store.js          (modify: add progressOf)
  state/goals-store.js            (new)
  goal/format.js                  (new)
  components/oyl-goal-composer.js  (new)
  components/oyl-goal-row.js       (new)
  components/oyl-goals.js         (new)
  state/data.js                   (modify: wire goals store)
  components/oyl-nav.js           (modify: Goals nav item)
  main.js                         (modify: defineGoals + #/goals route)
  + new tests for store/format/components; extend journal-store test
```

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome pass: seed demo data, open `#/goals`:
- Four seeded goals render with progress bars; the weight goal (seed-paused) shows "Paused"; goals with no current-period data show "No data this period"; met goals show ✓.
- Add a goal (preset + target + period) → appears with computed progress.
- Pause a goal → flips to "Paused" + Resume; Resume → returns to live progress.
- Delete a goal via the inline confirm.
- Cross-check: a goal targeting a metric you log in `#/journal` updates its bar on return.
