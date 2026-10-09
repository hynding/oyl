# `apps/stencil-oyl` Insights screen — Design

**Date:** 2026-10-09
**Status:** implemented on branch feat/stencil-oyl-insights (stacked on feat/stencil-oyl-goals; plan: `docs/superpowers/plans/2026-10-09-stencil-oyl-insights.md`)
**Program:** Stencil front-end — sub-project 9 (seventh redesigned screen; see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on nothing new; reuses the
tile pattern from Nutrition and the section pattern from Finance/Vault.

## Purpose

Replace the `/insights` placeholder: the read-only review of a period — totals with deltas,
plan completion, per-goal progress + streaks, top spending, activity totals and the life-area
rollup. Same data as vanilla's `oyl-insights` (`dataState.reviewOn(range)` unchanged); new look,
a segmented period control, completion as a fourth tile, nothing editable.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Period control | **`ui-segment` This week / This month** under the heading (default month, as vanilla). |
| Plan completion | **Fourth tile "Plans done"** next to Spent / Active min / Calories; "—" when the planner has no plans in the period. |
| Lists | **Plain rows inside `oyl-insights`** (`ol` of key/value `li`s; life areas add a thin bar). No new components; `oyl-item-row`/`oyl-progress-row` carry actions this screen has no use for. |
| Life areas | **Kept, as vanilla** (named areas always; Unassigned only with signal; "No areas tracked" when none) even though `lifeAreas` is unbacked today. |

## Screen anatomy

```
<oyl-insights review tz>
  h2[tabindex=-1] "Insights"
  ui-segment name=period "Period" [week|month]            (value mirrors the period signal)
  .totals[data-role=totals][role=group]  4 × .tile[data-tile=spending|activity|calories|completion]
                            b (value) · small (caption) · .delta ("↑ $42.50" / "↓ 20"; empty when the rounded magnitude is 0)
  section.goals     .section-label "Goals"      ol.goals li[key=goalId] (.k name|"Goal", .v label[+ " · 🔥 n"])   | .empty "No goals yet"
  section.spending  .section-label "Top spending" ol.spending li[key=category] (.k category, .v.mono usd)       | .empty "Nothing this period"
  section.activity  .section-label "Activity"    ol.activity li[key=slug] (.k slug, .v "120 min · 3×")          | .empty "Nothing this period"
  section.areas     .section-label "Life areas"  ol.areas li[key=areaId|'unassigned'] (.head .k name|"Unassigned", .v stats; .bar>.fill when goalsTotal>0) | .empty "No areas tracked"
```

- The screen owns a bundle `signal<InsightsPeriod>('month')` (`InsightsPeriod = 'week' | 'month'`,
  a subtype of `GoalPeriod` — the segment never offers `day`); one `effect` reads it plus `today =
  DayKey.from(now(), tz)`, calls `review(periodWindowOf(period, today))` and mirrors the `Review`
  into `@State() review` (a fresh object per run — every store the review touches bumps a
  revision `reviewOn` reads, so the effect re-runs on any journal/planner/goals change, as in
  vanilla). The `ui-segment` change handler sets the signal (stopPropagation).
- Tiles (vanilla's values): `usd(totals.spending)` (insights spending is single-currency USD, as
  vanilla), `Math.round(activityMinutes)`, `Math.round(calories)`, `completionRate === undefined
  ? '—' : `${Math.round(rate*100)}%`` (`undefined` when the period has no open or done plans
  due — canceled-only is "—" too, open-only is "0%"). Delta line per tile for the first three
  only: `↑`/`↓` + magnitude (money via `usd`, else rounded); hidden when the displayed
  magnitude would be zero (vanilla hides only the exact 0 and would show "↑ 0" — deliberate
  divergence).
- Rows: goals → `name ?? 'Goal'` and `reviewGoalLabel(progress)` + `· 🔥 {streak}` when > 0;
  spending → `category` / `usd(total)`; activity → `slug` / parts of `{round(minutes)} min` and
  `{count}×` joined by ` · `; areas → filter `areaId !== undefined || goalsTotal > 0 ||
  activityMinutes > 0 || projectsTouched > 0`, name `areaId === undefined ? 'Unassigned' : name`,
  `areaStatsLabel(a)`, bar width `goalsMet/goalsTotal` when `goalsTotal > 0`. Catalog order, no
  sort (vanilla).
- No announcements and no live region: nothing on the screen mutates.

## Shared code

- Nothing new in `@oyl/all-of-oyl`: `review`, `periodWindowOf`, `Review`/`AreaRollup` exist;
  `dataState.reviewOn` is the prop.
- `src/insights/format.ts`: `InsightsPeriod`, `INSIGHTS_PERIODS` (`[{week,'This week'},{month,
  'This month'}]` — not `PERIOD_OPTIONS`, which `goals/format.ts` already exports for the goal
  form), `TILES`, `usd`, `reviewGoalLabel` (paused > empty > met > percent, as vanilla),
  `areaStatsLabel`, `activityLabel`, `deltaLabel(delta, money)`, `completionLabel(rate?)` —
  ported from vanilla's `insights/format.js` with tests.
- `boot/routes.ts`: `insights` creates `oyl-insights` with `review = app.dataState.reviewOn`,
  `tz`; `insights` leaves `NOT_YET` (only `profile` remains); the routing spec's placeholder deep
  link moves to `/profile` in the same commit.
- Everything the review reads that is backed (transactions, goals, consumptions, measurements)
  persists; the screen itself writes nothing, so the e2e asserts composition, not persistence.

## Verification

- **Unit:** the format helpers (ported cases: `reviewGoalLabel` paused/empty/met/percent;
  `areaStatsLabel` parts and "Nothing tracked"; `activityLabel`; `deltaLabel` sign + money;
  `completionLabel`; `usd`).
- **Spec `oyl-insights`:** a fake `review` (`vi.fn(range => Review)`) reactive through a
  `core()` signal the fake reads: tiles values + captions + deltas (empty delta when 0; "—"
  completion when undefined); segment change → `review` called with `periodWindowOf('week',
  today)` and the tiles re-render; goals rows with name/"Goal" fallback, label and streak; top
  spending rows with `usd`; activity rows; life areas filter (named always, Unassigned only
  with signal), stats and bar width; the four empty texts; a revision bump re-calls `review`.
- **e2e `tests-stencil/insights.spec.ts`** = vanilla's three insights tests on stencil
  selectors (`oyl-insights .tile` count 4, `deepText` + `expect.poll`; spending via `addExpense`
  on Finance and a goal via `addGoal`, each awaited through its row before `navTo` — adds are
  persist-first; then `navTo('insights')` and "42.50"/"dining"/"Sleep goal" present + "No goals
  yet" absent, all `toContain` (a tile's deep text is value+caption+delta); the segment
  `[data-value="week"|"month"]` click moves `aria-checked` and keeps 4 tiles — never assert the
  expense under "This week" (the transaction form's UTC default date can cross a week boundary
  in a non-UTC tz).
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl and vanilla untouched.

## Out of scope

- Charts/sparklines; custom ranges; the digest (`digestOf`); correlations; backing `lifeAreas`.

## Risks

| Risk | Mitigation |
|---|---|
| The review is recomputed on every revision of any store | Same cost as vanilla; the review is a pure read over in-memory aggregates. |
| Four tiles at Pixel 7 width | Nutrition already fits five with the 30rem container query; reuse that CSS (incl. the `:host { container-type: inline-size }` it depends on). No `white-space: nowrap` on values; `.tile { min-inline-size: 0; overflow-wrap: anywhere }` so a long amount wraps instead of overflowing (the mobile spec asserts no horizontal overflow on `/insights`). |
| `completionRate` semantics | Taken from `planner.completionRate(period)` untouched; "—" only when it is `undefined` (no open/done plans due in the period). |
| Spec-test `DayRange` comparisons | The bundle's `DayRange` and the test's are different classes: assert `start.value`/`end.value`, and `await flush()` after events (effects re-run on a microtask). |

## Amendments during implementation

1. The pre-build review's findings (persist-first waits before `navTo` in the e2e, `toContain` on tile text, `InsightsPeriod` + `INSIGHTS_PERIODS`, deltas hidden when the rounded magnitude is zero, wrapping tiles, `DayRange` asserted by value) were folded in before any code.
2. `ui-segment`'s `options` is a mutable array type, so the readonly `INSIGHTS_PERIODS` is spread at the call site.
3. Observed, unchanged (domain parity with vanilla): the review judges each goal at `period.end`, so a day-period goal measured today shows "No data" under "This month" until the last day of the month, while its streak counts today.
4. e2e: `registerUser` now also retries once on a bare "socket hang up" (same transient backend drop as `ECONNRESET`; seen once under 4 workers).
