# `apps/stencil-oyl` Goals screen — Design

**Date:** 2026-10-09
**Status:** draft (branch `feat/stencil-oyl-goals`, stacked on `feat/stencil-oyl-vault`)
**Program:** Stencil front-end — sub-project 8 (sixth redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 7 (the collapsed-form
pattern, `oyl-item-row`'s action convention) and refactors 6's `oyl-budget-row`.

## Purpose

Replace the `/goals` placeholder: goals created from metric presets, each tracked against the
journal with a progress bar, pausable/resumable, deletable. Same domain behavior as vanilla's
`oyl-goals` (`createGoalsStore` + `journal.progressOf` unchanged); new look, a summary line, and
one shared progress row that Finance's budgets move onto.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Layout | **Collapsed "New goal" `<details>`** above the list (the Finance/Vault section pattern); the list is the screen. |
| Rows | **Generalize `oyl-budget-row` into `oyl-progress-row`**: title (+ optional met check), `ratio`, `tone`, `label`, optional `action` → `act`, inline Delete → `remove`. Budgets migrate onto it in this sub-project; `oyl-budget-row` is deleted. |
| Summary | **One line under the heading**: "{met} of {n} met today · {paused} paused" (the paused part only when > 0; hidden when there are no goals). |

## Screen anatomy

```
<oyl-goals store journal tz>
  h2[tabindex=-1] "Goals"     sr-only aria-live
  .summary[data-role=summary]  "2 of 3 met today · 1 paused"     (absent without goals)
  <details><summary>New goal</summary><oyl-goal-form store onAdded></details>
  <ol class="goals"> <li><oyl-progress-row itemId title met ratio tone label action onAct onRemove></li> …
  .empty  "No goals yet."
```

- One `effect` tracks the goals store and the journal revision: it mirrors `store.all()` to
  `@State() goals` and computes `progress = goals.map(g => journal.progressOf(g, today))` into
  a parallel `@State()` array (fresh objects each run — the row re-renders on in-place
  pause/resume and on new journal data).
- Row props from a goal + its progress: `title = goal.name ?? goal.metric`, `met = progress.met
  === true`, `ratio = progress.ratio`, `tone = met ? 'met' : (paused || empty) ? 'muted' :
  undefined`, `label = goalProgressLabel(progress, goal.direction, metricUnit(goal.metric))`,
  `action = paused ? { act: 'resume', label: 'Resume' } : { act: 'pause', label: 'Pause' }`.
- Callbacks: `act pause` → `store.pause(id, today)` + "Paused"; `act resume` → `store.resume(id,
  today)` + "Resumed"; `remove` → `store.remove(id)` + "Deleted"; `added` → "Goal added".
- `summaryLine(progress[])` (app-side): `n = count`, `met = progress.filter(p => p.met ===
  true)`, `paused = progress.filter(p => p.paused)`; "" when n = 0.

### `oyl-goal-form`

- `ui-select name="preset" label="Metric"` with vanilla's five presets (value = index):
  Sleep (hours) / Weight (kg) / Calories / Run minutes / Screen time (min). Choosing a preset
  sets the period select to the preset's period and the target's unit hint (`metricUnit`).
- `ui-field name="name" label="Name (optional)"`; `.row2`: `ui-field name="target"
  type="number" label="Target" hint={unit}` and `ui-select name="period" label="Period"`
  (day/week/month).
- Submit `ui-button type="submit" variant="primary"` "Add goal" → `new Goal({ metric, target,
  direction, aggregation, period, name? })` → `store.add`, clears name + target, emits `added`.
  Domain errors (non-positive target) inline in `[data-role=error]` with the target marked.
- The form owns `presetIndex` and `period` as state (silent `ui-select` sync rule).

### `oyl-progress-row` (replaces `oyl-budget-row`)

Props `itemId`, `title`, `met?: boolean` (renders " ✓" in the accent color after the title),
`ratio` (0–1), `tone?: 'met' | 'warn' | 'muted'` (bar fill: accent / warn / muted; default
muted-ish `--color-muted`), `label`, `action?: { act, label }`, `removeLabel?`.
Events `act: { act, itemId }`, `remove: itemId`. The bar is `role="progressbar"` with
`aria-valuenow`. Finance passes `tone = progress.met === false ? 'warn' : 'met'` for budgets
(vanilla's budget bar: accent, warn when over), `label = budgetLabel(...)`.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `Goal`, `createGoalsStore`, `journal.progressOf` exist.
- `src/goals/format.ts`: `PRESETS`, `PERIODS`, `metricUnit`, `goalProgressLabel` (ported with
  tests), `summaryLine`.
- `boot/routes.ts`: `goals` creates `oyl-goals` with `store = app.dataState.goals`, `journal =
  app.dataState.journal`, `tz`; `goals` leaves `NOT_YET`; the routing spec's placeholder deep link
  moves to `/insights` in the same commit (`insights` stays a placeholder).
- Goals are **backed**, so the e2e asserts persistence (vanilla's tests do too).

## Verification

- **Unit:** `metricUnit`, `goalProgressLabel` (ported), `summaryLine`, `PRESETS` shape.
- **Specs:** `oyl-progress-row` (title/met check/bar width + role/tone class/label/action +
  remove — the budget-row spec re-expressed); `oyl-goal-form` (presets, preset → period + unit
  hint, submit builds a `Goal` with the preset's metric/direction/aggregation + chosen period/
  target/name, clears, `added`; non-positive target → inline error); `oyl-goals` (fake goals
  store + fake journal `progressOf`, reactive through `core()`: summary line text and absence,
  rows with title/ratio/tone/label/action per progress, `act pause|resume` → store with today +
  announcement and the action flipping after the store mutates, `remove` → store + "Deleted",
  `added` announces, empty text); `oyl-finance` spec updated for `oyl-progress-row`.
- **e2e:** `tests-stencil/goals.spec.ts` = vanilla's three goals tests on stencil selectors
  (`oyl-goals details summary`, `oyl-goal-form ui-select[name=preset] select`, `ui-field[name=…]
  input`, `oyl-goals ol.goals oyl-progress-row`, `[data-act=pause|resume|delete]`, `deepText` +
  `expect.poll`), plus the summary line; `finance.spec.ts` switches `oyl-budget-row` →
  `oyl-progress-row`.
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl and vanilla untouched.

## Out of scope

- Custom metrics beyond the presets; editing goals; goal history/streaks; Insights.

## Risks

| Risk | Mitigation |
|---|---|
| Pause/resume mutate the goal in place | The effect recomputes `progress` as fresh objects and the row's `action`/`label`/`tone` derive from it in render, so the row re-renders (the Finance `status` lesson). |
| Replacing `oyl-budget-row` ripples into Finance | Its spec and the Finance screen spec/e2e are updated in the same task; the budget bar keeps its exact semantics (`warn` when over). |
| Same-day resume keeps the goal paused through today | Domain semantics (vanilla's e2e comment); the e2e asserts Resume stays visible after reload, as vanilla's does. |
