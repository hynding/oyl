# `apps/stencil-oyl` Insights screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the `/insights` placeholder in `apps/stencil-oyl` with the redesigned read-only Insights screen (period segment, four tiles with deltas, goals / top spending / activity / life-area rows). Same review data as vanilla (`dataState.reviewOn`); vanilla and ui-oyl untouched.

**Architecture:** `oyl-insights` owns a bundle `signal<GoalPeriod>` and one `effect` that calls `review(periodWindowOf(period, today))` and mirrors the `Review` into `@State`; everything else is derived in `render()` through `src/insights/format.ts` helpers. No new components.

**Tech Stack:** as sub-projects 2–8.

**Spec:** `docs/superpowers/specs/2026-10-09-stencil-oyl-insights-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-insights` (stacked on `feat/stencil-oyl-goals`; spec commit `033e8f8`, reviewed + amended in the plan commit). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- **Parity with vanilla's `oyl-insights`** (values, labels, filters, empty texts, catalog order). New: the look, the segment, completion as a tile.
- **Selectors for e2e** (keep stable): `oyl-insights`, `oyl-insights ui-segment [data-value="week"|"month"]`, `oyl-insights .totals[data-role="totals"] .tile` (4) / `.tile[data-tile="spending"|"activity"|"calories"|"completion"]`, `section.goals ol.goals li`, `section.spending ol.spending li`, `section.activity ol.activity li`, `section.areas ol.areas li`, each section's `.empty`.
- **Gates per task:** `pnpm stencil test|typecheck|build`; Task 4 runs the stencil e2e projects (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed first). First `stencil test` after adding a tag may fail on stale `components.d.ts` — rerun.
- The period is a bundle `signal` read inside the effect (a `@State` is not tracked); `today` is read inside the effect from `now()`; the `uiChange` handler on `ui-segment` is a stable method that calls `stopPropagation()`; `ui-segment` is already registered in `src/global/app.ts`.

---

## Task 1: `src/insights/format.ts`

**Files:** `apps/stencil-oyl/src/insights/format.ts` + `format.unit.ts`

- [ ] **Step 1: failing tests** — `INSIGHTS_PERIODS` = `[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]` typed on `InsightsPeriod = 'week' | 'month'`; `usd(42.5)` → `$42.50`; `reviewGoalLabel` (paused → "Paused", empty → "No data", met → "Met", else `${round(ratio*100)}%`; paused beats empty, empty beats met: `{ empty: true, met: true }` → "No data"); `areaStatsLabel` ("2/3 goals · 120 min · 1 project", "2 projects", "Nothing tracked" when all zero, minutes rounded); `activityLabel({ minutes, count })` ("120 min · 3×", "3×" alone, "120 min" alone, "" when both zero); `deltaLabel(delta, money)` ("" for 0, "↑ $42.50" / "↓ $42.50" for money, "↑ 20" / "↓ 20" rounded otherwise, "" when the rounded magnitude is 0: `deltaLabel(0.3, false)` and `deltaLabel(0.004, true)`); `completionLabel(undefined)` → "—", `0.754` → "75%"; `TILES` = the four `{ key, caption }` in order (spending "Spent", activity "Active min", calories "Calories", completion "Plans done").
- [ ] **Step 2: implement** (ported from `apps/vanilla-oyl/src/insights/format.js`; `usd` via `formatMoney(Money.fromMajor(n, 'USD'))`).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): insights format helpers`.

## Task 2: `oyl-insights` screen

**Files:** `apps/stencil-oyl/src/components/oyl-insights/{oyl-insights.tsx,oyl-insights.css,oyl-insights.spec.tsx}`

- [ ] **Step 1: failing spec** — a fake `review: vi.fn((range: DayRange) => Review)` that reads a `core()` signal (`rev.get()`) so a bump re-runs the effect; a `makeReview(over: Partial<Review>)` builder with empty defaults (`totals/previousTotals/deltas` all zero, `completionRate` undefined, empty lists); `tz='UTC'`:
  - `h2` "Insights" `tabindex=-1`; `ui-segment[name=period]` with the two options and `value` "month"; four `.tile`s in order with captions Spent / Active min / Calories / Plans done and values `$0.00` / `0` / `0` / `—`; no `.delta` text; the four `.empty` texts ("No goals yet", "Nothing this period" ×2, "No areas tracked") and no `ol`s.
  - `review`'s last call range has `start.value`/`end.value` equal to `periodWindowOf('month', today)`'s (different `DayRange` class copies — never `toHaveBeenCalledWith` a range); a `uiChange { value: 'week' }` on the segment + `await flush()` → the week window and the segment `value` is "week".
  - a filled review (totals spending 230, activityMinutes 135.4, calories 14200, deltas 42.5 / -20 / 0, completionRate 0.754): tile values `$230.00` / `135` / `14200` / `75%`; deltas "↑ $42.50", "↓ 20", "" and none on completion.
  - goals rows: `{ name: 'Sleep more', progress met, streak 4 }` → `.k` "Sleep more", `.v` "Met · 🔥 4"; `{ progress ratio .6, streak 0 }` → "Goal" / "60%"; spending rows `.k` "groceries" `.v` "$200.00"; activity rows `.k` "run" `.v` "120 min · 3×".
  - areas: `[{ areaId, name: 'Health', goalsMet 1, goalsTotal 2, activityMinutes 135, projectsTouched 0 }, { name: 'Unassigned?', goalsTotal 1, goalsMet 1 }, { name: 'nothing', all zero, no areaId }]` → two rows: "Health" / "1/2 goals · 135 min" with `.fill` inline-size `50%`; "Unassigned" / "1/1 goals" with `100%`; the all-zero unnamed one filtered out; a named area with all zeros still renders "Nothing tracked" and no `.bar`.
  - bumping the fake's signal (+ `flush()`) re-calls `review` and re-renders (change the spending between calls).
- [ ] **Step 2: implement** — `@Prop() review!: (range: DayRange) => Review`, `@Prop() tz`; `@State() period: InsightsPeriod`, `@State() data: Review`; `componentWillLoad` creates the signal + effect; rows keyed (`goalId`, `category`, `slug`, `areaId ?? 'unassigned'`); the tiles container is `.totals[data-role=totals][role=group][aria-label="Period totals"]`; CSS: `:host { display: block; container-type: inline-size }`, Finance's `h2`/`h2:focus-visible`, Nutrition's `.totals`/`.tile` rules with `repeat(4, …)`, `.tile { min-inline-size: 0; overflow-wrap: anywhere }` and NO `white-space: nowrap` on `.tile b`, a `.delta` line (`font-size: var(--step--1); color: var(--color-muted); font-variant-numeric: tabular-nums; min-block-size: 1.2em`), Finance's `.section-label`, key/value `li` rows (`display:flex; justify-content:space-between; gap; border-block-start`), `.v` muted / `.v.mono` for money, `.bar`/`.fill` as `oyl-progress-row` but 0.35rem tall, `.empty`, `ui-segment { justify-self: center }`, the 30rem container query for tiles.
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-insights screen`.

## Task 3: route

**Files:** `apps/stencil-oyl/src/boot/routes.ts` (+ `routes.unit.ts` label), `apps/e2e-oyl/tests-stencil/routing.spec.ts`

- [ ] **Step 1:** `insights` creates `oyl-insights` with `review = app.dataState.reviewOn`, `tz = app.tz`; remove from `NOT_YET` (only `profile` stays); routing spec placeholder deep link → `/profile` ("Profile is coming to the new OYL").
- [ ] **Step 2: gate + commit** — `feat(stencil-oyl): Insights route replaces the placeholder`.

## Task 4: e2e

**Files:** `apps/e2e-oyl/tests-stencil/insights.spec.ts`

- [ ] **Step 1:** port vanilla's three insights tests: fresh account → 4 tiles, "No goals yet", "Nothing this period", "No areas tracked" (`deepText` + `expect.poll`); spending + goal flow (`addExpense(page, '42.50', 'dining')` on `/finance` then `await expect(page.locator('oyl-finance ol.ledger oyl-item-row')).toHaveCount(1)`; `navTo('goals')` + `addGoal(page, { name: 'Sleep goal', target: '8' })` then `await expect(page.locator('oyl-goals ol.goals oyl-progress-row')).toHaveCount(1)` — adds are persist-first; `navTo('insights')` → deep text contains "42.50", "dining", "Sleep goal" and not "No goals yet"; `.tile[data-tile=spending]` deep text `toContain('$42.50')` — never `toBe`, the tile text is value+caption+delta); the segment click on `[data-value="week"]` then `[data-value="month"]` moves `aria-checked` and keeps 4 tiles (no expense assertion under week).
- [ ] **Step 2:** run `--project stencil-desktop --project stencil-mobile --workers=4` green.
- [ ] **Step 3: commit** — `test(e2e): stencil insights spec`.

## Task 5: Visual check + docs

- [ ] **Step 1:** temporary `zz-shot.spec.ts` screenshots of `/insights` with an expense, a measurement-backed goal and a done task on desktop + Pixel 7; fix layout issues; delete the temp spec.
- [ ] **Step 2: docs** — spec status → implemented (+ amendments); plan ticked; program table row 9 Insights; CLAUDE.md stencil-oyl row (Insights; placeholder left: profile).
- [ ] **Step 3: commit** — `docs: stencil-oyl Insights; spec statuses`.
