# `apps/stencil-oyl` Goals screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/goals` placeholder in `apps/stencil-oyl` with the redesigned Goals screen (summary line, collapsed "New goal" form on `ui-select` presets, progress rows with pause/resume + inline delete), generalizing `oyl-budget-row` into a shared `oyl-progress-row` that Finance's budgets move onto. Same domain behavior as vanilla's goals; vanilla and ui-oyl untouched.

**Architecture:** `oyl-goals` runs one `effect` over the goals store + journal revision (`progressOf` tracks it) and mirrors `goals` + a parallel fresh `progress[]` into `@State`; row props (`title/met/ratio/tone/label/action`) derive in `render()`. `oyl-goal-form` owns `presetIndex` + `period` state (silent `ui-select` sync). `oyl-progress-row` is presentational: props in, `act`/`remove` out. Presets, units, labels in `src/goals/format.ts` with unit tests.

**Tech Stack:** as sub-projects 2–7.

**Spec:** `docs/superpowers/specs/2026-10-09-stencil-oyl-goals-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-goals` (stacked on `feat/stencil-oyl-vault`; spec commit `282af65`, reviewed + amended in the plan commit). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Behavior parity with vanilla's goals** (`oyl-goal-composer` presets + `Goal` construction, `oyl-goal-row` title/check/bar tone/label/actions, `oyl-goals` callbacks + announcements, empty text). New: the look, the summary line, the collapsed form, the shared row.
- **Selectors for e2e** (keep stable): `oyl-goals`, `oyl-goals [data-role="summary"]`, `oyl-goals details summary`, `oyl-goal-form ui-select[name="preset"] select`, `oyl-goal-form ui-field[name="name"|"target"] input`, `oyl-goal-form ui-select[name="period"] select`, `oyl-goal-form ui-button[type="submit"] button`, `oyl-goals ol.goals oyl-progress-row`, `oyl-progress-row [data-act="pause"|"resume"|"delete"|"confirm-yes"|"confirm-no"]`, `oyl-goals .empty`. Finance keeps `section.budgets` / `ol.budgets` and swaps `oyl-budget-row` → `oyl-progress-row`.
- **Gates per task:** `pnpm stencil test|typecheck|build`; Task 5 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed first). First `stencil test` after adding a tag may fail on stale `components.d.ts` — rerun.
- Handlers on `ui-*` hosts never close over render state; `@Event()` names avoid native ones (`act`, `remove`, `added`); forms read field values from the primitives at submit time; `ui-select` state is owned by the form; a Stencil `@State` is not tracked by an `effect` (today is read inside the effect from `now()`); discriminate on `.kind`/fields, never `instanceof`.

---

## Task 1: `src/goals/format.ts`

**Files:** `apps/stencil-oyl/src/goals/format.ts` + `format.unit.ts`

- [ ] **Step 1: failing tests** — `PRESETS` is vanilla's five `{ label, metric, direction, aggregation, period }` in order (Sleep (hours) `sleep.hours` atLeast sum day; Weight (kg) `body.weight_kg` atMost last day; Calories `nutrition.calories` atMost sum day; Run minutes `activity.run.minutes` atLeast sum week; Screen time (min) `screen.minutes` atMost sum day) and `PRESET_OPTIONS` = `{ value: String(i), label }[]` for `ui-select`; `PERIOD_OPTIONS` = `GOAL_PERIODS.map(p => ({ value: p, label: p }))` (the domain list from `@oyl/all-of-oyl`, asserted equal to it — no second literal). `metricUnit` (h / kg / kcal / min / min / '' unknown). `goalProgressLabel` ported: paused → "Paused"; empty → "No data this period"; atLeast → "12 / 20 h" (compact: integers as-is, else one decimal: `7.5 / 8 h`); atMost → "1800 of 2200 kcal used"; no unit → "3 / 5". `summaryLine(progress[])`: `[]` → ""; `[met, unmet, paused]` → "1 of 3 met today · 1 paused"; no paused → "2 of 2 met today" (count `p.met === true`; `progressOn` never sets `met` on a paused progress).
- [ ] **Step 2: implement** (`PRESETS` typed with `GoalDirection`/`AggregateKind`/`GoalPeriod` from `@oyl/all-of-oyl`).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): goals format helpers`.

## Task 2: `oyl-progress-row` replaces `oyl-budget-row` (Finance migrates)

**Files:** `apps/stencil-oyl/src/components/oyl-progress-row/{oyl-progress-row.tsx,oyl-progress-row.css,oyl-progress-row.spec.tsx}` (new), delete `src/components/oyl-budget-row/`, `oyl-finance.tsx` + `oyl-finance.spec.tsx`, `apps/e2e-oyl/tests-stencil/finance.spec.ts`

- [ ] **Step 1: failing spec** (the budget-row spec re-expressed on props) — props `itemId`, `name` (the heading; `title` is a reserved HTMLElement name Stencil warns on), `met?`, `ratio`, `tone?: 'met' | 'warn' | 'muted'`, `label`, `action?: { act: string; label: string }`, `removeLabel?`:
  - renders `.title` text = `name` verbatim (no text transform — "dining" stays "dining"); with `met` a `.title .ok` "✓" (absent otherwise); `.bar[role=progressbar]` with `aria-valuenow` = `round(ratio*100)` and `.fill` inline-size `62%`; `.bar` carries the tone class (`met` / `warn` / `muted`; none when undefined); `.label` text, and `.label.warn` only for `warn`.
  - with `action` a `button[data-act=pause]` "Pause" renders before Delete and click emits `act` `{ act: 'pause', itemId }` without opening the confirm; without `action` only Delete.
  - Delete asks inline (`[role=group][aria-label="Delete?"]`, No focused), No → nothing, Yes → `remove` with `itemId`; `aria-label` on Delete = `removeLabel ?? \`Delete ${name}\``.
- [ ] **Step 2: implement** — port the budget-row markup/CSS minus `text-transform: capitalize` (bar tones: `met` → `--color-accent`, `warn` → `--color-warn`, `muted` → `color-mix(in oklch, var(--color-text) 22%, transparent)`, default fill `--color-muted`; `.title .ok { color: var(--color-accent); font-weight: 600 }`). `componentDidRender` focuses `confirm-no` as before.
- [ ] **Step 3: Finance migration** — `oyl-finance.tsx` renders `<oyl-progress-row itemId={b.id} name={b.name ?? b.category} ratio={progress.ratio} tone={progress.met === false ? 'warn' : 'met'} label={budgetLabel(progress, spent, b.limit)} onRemove={…} />` (status computed in render as today, no `met` check mark for budgets, category lowercase as the ledger shows it — the e2e asserts `'dining'`); drop the `BudgetStatus` type import (inline the return type on `FinanceStore.budgetStatus`). `oyl-finance.spec.tsx`: the budget-row assertions read `oyl-progress-row` props (`label` contains `$93.00`, `tone` `met`) and dispatch `remove` on it. Delete `oyl-budget-row/`; `components.d.ts` regenerates on build. e2e `finance.spec.ts`: `oyl-budget-row` → `oyl-progress-row` (three places), assertions unchanged.
- [ ] **Step 4: gate + commit** — `refactor(stencil-oyl): oyl-progress-row replaces oyl-budget-row`.

## Task 3: `oyl-goal-form`

**Files:** `apps/stencil-oyl/src/components/oyl-goal-form/{oyl-goal-form.tsx,oyl-goal-form.css,oyl-goal-form.spec.tsx}`

- [ ] **Step 1: failing spec** — `GoalsWriter { add(g: Goal): Promise<unknown> }` prop `store`; renders `ui-select[name=preset]` with the five preset labels (value = index) selected "0", `ui-field[name=name]` label "Name (optional)", `.row2` with `ui-field[name=target][type=number]` hint "h" (no `min`/`step` — `ui-field` has neither), `ui-select[name=period]` value "day" with the `GOAL_PERIODS` options; choosing preset "3" (Run minutes) → period select value "week" and target hint "min"; choosing preset "1" → hint "kg", period "day"; the user can then change period to "month" (mirrored into `@State period` so the vnode never goes stale) and a later preset change re-derives it again. Submit with target "7.5", name "Sleep more" → `store.add` called with a `Goal` whose `metric.toString() === 'sleep.hours'`, `direction 'atLeast'`, `aggregation 'sum'`, `period 'day'`, `target 7.5`, `name 'Sleep more'`; name + target cleared, `added` emitted; blank name → no `name` prop; target "" / "0" / "-1" → `[data-role=error]` shows the domain message and `ui-field[name=target]` gets `error`, no `add` call; store rejection → message inline.
- [ ] **Step 2: implement** — `@State presetIndex = 0`, `@State period: GoalPeriod = 'day'`; `onPreset` (stopPropagation, as every form does on `uiChange`) sets both; `onPeriod` sets `period`; submit reads name/target from the fields, builds `new Goal({...})` in a try/catch (domain errors inline), awaits `store.add`, clears via the field elements' `value`, emits `added`.
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-goal-form`.

## Task 4: `oyl-goals` screen + route

**Files:** `apps/stencil-oyl/src/components/oyl-goals/{oyl-goals.tsx,oyl-goals.css,oyl-goals.spec.tsx}`, `apps/stencil-oyl/src/boot/routes.ts` + `routes.unit.ts`, `apps/stencil-oyl/src/global/app.ts` (if a new `ui-*` tag is used — none expected), `apps/e2e-oyl/tests-stencil/routing.spec.ts`

- [ ] **Step 1: failing spec** — fake goals store (`revision` signal from `core()`, `all()`, spies `add/remove/pause/resume` that mutate the fake list + bump revision) and fake journal `{ progressOf: vi.fn((g) => progressById[g.id]) }` with its own revision read inside; `tz='UTC'`:
  - `h2` "Goals" `tabindex=-1`; no goals → no `[data-role=summary]`, `.empty` "No goals yet.", `details > summary` "New goal" + `oyl-goal-form` with `store`.
  - two goals (one met, one paused via a real `Goal` with an open pause) → summary "1 of 2 met today · 1 paused"; `<li key>` rows in `ol.goals` with `itemId`, `name` (goal name, else metric string), `met` true/false, `ratio`, `tone` (`muted` for paused or empty, else `met` when met, else undefined), `label` via `goalProgressLabel`, `action` Resume when the goal has an open pause (`goal.pauses.some(r => r.to === undefined)`), else Pause — including a goal whose pause closed today (progress `paused`, label "Paused", action **Pause**).
  - `act pause` → `store.pause(id, today)` + "Paused" and, after the fake store pauses the real Goal and bumps revision, the row's `action` is Resume; `act resume` → `store.resume(id, today)` + "Resumed"; a rejected `pause`/`resume` → its message in the live region (no unhandled rejection); `remove` → `store.remove(id)` + "Deleted" and the row disappears; `added` from the form → "Goal added"; a journal revision bump re-reads `progressOf` (fresh label).
- [ ] **Step 2: implement** — `componentWillLoad` effect: `today = DayKey.from(now(), tz)`; `goals = store.all()`; `progress = goals.map(g => journal.progressOf(g, today))` (fresh arrays each run). Render derives row props per index; `summaryLine(progress)` only when goals exist. Stable handlers `onAct`/`onRemove`/`onAdded` read `e.detail` and `this.today()`; `onAct` awaits the store call in try/catch and announces the error message on failure.
- [ ] **Step 3: route** — `goals` creates `oyl-goals` with `store = app.dataState.goals`, `journal = app.dataState.journal`, `tz = app.tz`; remove from `NOT_YET` (`routes.unit.ts` only checks key coverage — reword its `it` label at most); `routing.spec.ts` placeholder deep link → `/insights` ("Insights is coming to the new OYL"); the back/forward test keeps `navTo('goals')` (a real empty Goals screen mounts cleanly).
- [ ] **Step 4: gate + commit** — `feat(stencil-oyl): Goals screen replaces the placeholder`.

## Task 5: e2e

**Files:** `apps/e2e-oyl/tests-stencil/goals.spec.ts`, `tests-stencil/lib.ts` (`addGoal(page, { preset?, name?, target, period? })` opens the details, picks, fills, submits)

- [ ] **Step 1:** port vanilla's three goals tests on stencil selectors with `deepText` + `expect.poll` after counts: empty state (`.empty` text + no summary); round-trip (Sleep (hours) "Sleep more" 7.5/day → row title, summary "0 of 1 met today", Pause → Resume visible, summary "· 1 paused", `awaitOutboxDrained` + reload keeps the name and Resume); delete with inline confirm (No keeps, Yes removes, reload → empty). Finance spec already migrated in Task 2.
- [ ] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [ ] **Step 3: commit** — `test(e2e): stencil goals spec`.

## Task 6: Visual check + docs

- [ ] **Step 1:** temporary `zz-shot.spec.ts` screenshots of `/goals` with three goals (met / active / paused) on desktop + Pixel 7 and of `/finance` budgets (the migrated row); fix any layout issue; delete the temp spec.
- [ ] **Step 2: docs** — spec status → implemented (+ "Amendments during implementation" if any); plan ticked; program table row for 8 Goals in `2026-10-06-extract-client-layer-design.md`; CLAUDE.md stencil-oyl row (Goals + `oyl-progress-row` replacing `oyl-budget-row`; placeholders left: insights, profile) and any new gotcha.
- [ ] **Step 3: commit** — `docs: stencil-oyl Goals; spec statuses`.
