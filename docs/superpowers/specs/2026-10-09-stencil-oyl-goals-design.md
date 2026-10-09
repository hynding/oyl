# `apps/stencil-oyl` Goals screen — Design

**Date:** 2026-10-09
**Status:** implemented on branch feat/stencil-oyl-goals (stacked on feat/stencil-oyl-vault; plan: `docs/superpowers/plans/2026-10-09-stencil-oyl-goals.md`)
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
  <ol class="goals"> <li key=id><oyl-progress-row itemId name met ratio tone label action onAct onRemove></li> …
  .empty  "No goals yet."
```

- One `effect` tracks the goals store and the journal revision: it mirrors `store.all()` to
  `@State() goals` and computes `progress = goals.map(g => journal.progressOf(g, today))` into
  a parallel `@State()` array (fresh objects each run — the row re-renders on in-place
  pause/resume and on new journal data).
- Row props from a goal + its progress: `name = goal.name ?? goal.metric`, `met = progress.met
  === true`, `ratio = progress.ratio`, `tone = (paused || empty) ? 'muted' : met ? 'met' :
  undefined` (vanilla's cascade: muted wins), `label = goalProgressLabel(progress,
  goal.direction, metricUnit(goal.metric))`, and the action from the **goal's pause state, not
  the progress**: `open = goal.pauses.some(r => r.to === undefined)`; `action = open ? { act:
  'resume', label: 'Resume' } : { act: 'pause', label: 'Pause' }`. (A same-day resume closes
  the range inclusively, so `progress.paused` stays `true` through today while there is no open
  pause left to resume — `Goal.resume` would throw `ILLEGAL_TRANSITION`. Vanilla derives the
  button from `progress.paused` and has this latent bug; the label still reads "Paused".)
- Callbacks: `act pause` → `store.pause(id, today)` + "Paused"; `act resume` → `store.resume(id,
  today)` + "Resumed"; `remove` → `store.remove(id)` + "Deleted"; `added` → "Goal added". Pause
  and resume are awaited in a try/catch; a rejection (the store re-hydrates and rethrows) puts
  `err.message` in the live region instead of escaping.
- `summaryLine(progress[])` (app-side): `n = count`, `met = progress.filter(p => p.met ===
  true)` (a paused progress never carries `met`), `paused = progress.filter(p => p.paused)`;
  "" when n = 0.
- Rows are `<li key={goal.id}>` (plain ids — every row prop is a primitive or a fresh literal
  derived in `render()`, so in-place pause/resume re-renders without a composite key; the key
  only keeps a row's confirm state from being recycled onto a neighbour on delete).

### `oyl-goal-form`

- `ui-select name="preset" label="Metric"` with vanilla's five presets (value = index):
  Sleep (hours) / Weight (kg) / Calories / Run minutes / Screen time (min). Choosing a preset
  sets the period select to the preset's period and the target's unit hint (`metricUnit`).
- `ui-field name="name" label="Name (optional)"`; `.row2`: `ui-field name="target"
  type="number" label="Target" hint={unit}` (no `min`/`step` — `ui-field` has neither, and
  constraint validation never sees the shadow input; decimals submit as in Finance) and
  `ui-select name="period" label="Period"` with options from the domain's `GOAL_PERIODS`.
- Submit `ui-button type="submit" variant="primary"` "Add goal" → `new Goal({ metric, target,
  direction, aggregation, period, name? })` → `store.add`, clears name + target, emits `added`.
  Domain errors (non-positive target) inline in `[data-role=error]` with the target marked.
- The form owns `presetIndex` and `period` as state (silent `ui-select` sync rule).

### `oyl-progress-row` (replaces `oyl-budget-row`)

Props `itemId`, `name` (the heading — `title` is a reserved HTMLElement name Stencil warns
on), `met?: boolean` (renders " ✓" in the accent color after the name), `ratio` (0–1),
`tone?: 'met' | 'warn' | 'muted'` (bar fill: accent / warn / muted; default `--color-muted`),
`label`, `action?: { act, label }`, `removeLabel?`.
Events `act: { act, itemId }`, `remove: itemId`. The bar is `role="progressbar"` with
`aria-valuenow`. The row applies no text transform (goal names are user text); Finance passes
`name = budget.name ?? budget.category` as-is (lowercase category, as the ledger's
`oyl-item-row` already shows it — the e2e asserts the lowercase text), `tone = progress.met
=== false ? 'warn' : 'met'` (vanilla's budget bar: accent, warn when over), `label =
budgetLabel(...)`.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `Goal`, `createGoalsStore`, `journal.progressOf` exist.
- `src/goals/format.ts`: `PRESETS` (+ `PRESET_OPTIONS` for `ui-select`), `PERIOD_OPTIONS`
  (built from the domain's `GOAL_PERIODS`, never a second literal), `metricUnit`,
  `goalProgressLabel` (ported with tests), `summaryLine`.
- `boot/routes.ts`: `goals` creates `oyl-goals` with `store = app.dataState.goals`, `journal =
  app.dataState.journal`, `tz`; `goals` leaves `NOT_YET`; the routing spec's placeholder deep link
  moves to `/insights` in the same commit (`insights` stays a placeholder).
- Goals are **backed**, so the e2e asserts persistence (vanilla's tests do too).

## Verification

- **Unit:** `metricUnit`, `goalProgressLabel` (ported), `summaryLine`, `PRESETS` shape.
- **Specs:** `oyl-progress-row` (name/met check/bar width + role/tone class/label/action +
  remove — the budget-row spec re-expressed); `oyl-goal-form` (presets, preset → period + unit
  hint, submit builds a `Goal` with the preset's metric/direction/aggregation + chosen period/
  target/name, clears, `added`; non-positive target → inline error); `oyl-goals` (fake goals
  store + fake journal `progressOf`, reactive through `core()`: summary line text and absence,
  rows with name/ratio/tone/label/action per progress, `act pause|resume` → store with today +
  announcement and the action flipping after the store mutates, a goal whose pause closed today
  (progress paused, no open range) offers Pause, a store rejection lands in the live region,
  `remove` → store + "Deleted", `added` announces, empty text); `oyl-finance` spec updated for `oyl-progress-row`.
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
| Same-day resume keeps the goal paused through today | Domain semantics (vanilla's e2e comment); the e2e asserts Resume stays visible after reload, as vanilla's does. The action button follows the goal's open pause (see anatomy) so a closed-today range offers Pause, not a Resume that would throw — a deliberate divergence from vanilla. |
| `emptyPeriods: 'met'` goals (seeded/imported only) | Tone follows vanilla's cascade: muted beats met. The form never sets `emptyPeriods`. |

## Amendments during implementation

1. The pre-build review's findings (action from the goal's open pause, `name` instead of the reserved `title` prop, no text transform on the shared row, no `min`/`step` on `ui-field`, `PERIOD_OPTIONS` from `GOAL_PERIODS`, vanilla's tone cascade) were folded in before any code.
2. `oyl-goal-form` passes the readonly option lists straight to `ui-select` (`options` is `readonly SelectOption[]`).
3. Finance's budget rows derive `name`/`ratio`/`tone`/`label` in `render()` from `budgetStatus`; `oyl-budget-row` is gone.
