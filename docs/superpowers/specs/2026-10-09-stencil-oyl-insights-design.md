# `apps/stencil-oyl` Insights screen — Design

**Date:** 2026-10-09
**Status:** draft (branch `feat/stencil-oyl-insights`, stacked on `feat/stencil-oyl-goals`)
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
  .tiles[data-role=totals]  4 × .tile[data-tile=spending|activity|calories|completion]
                            b (value) · small (caption) · .delta ("↑ $42.50" / "↓ 20"; empty when 0)
  section.goals     .section-label "Goals"      ol.goals li (.k name|"Goal", .v label[+ " · 🔥 n"])   | .empty "No goals yet"
  section.spending  .section-label "Top spending" ol.spending li (.k category, .v.mono usd)         | .empty "Nothing this period"
  section.activity  .section-label "Activity"    ol.activity li (.k slug, .v "120 min · 3×")        | .empty "Nothing this period"
  section.areas     .section-label "Life areas"  ol.areas li (.head .k name|"Unassigned", .v stats; .bar>.fill when goalsTotal>0) | .empty "No areas tracked"
```

- The screen owns a bundle `signal<GoalPeriod>('month')`; one `effect` reads it plus `today =
  DayKey.from(now(), tz)`, calls `review(periodWindowOf(period, today))` and mirrors the `Review`
  into `@State() review` (a fresh object per run — every store the review touches bumps a
  revision `reviewOn` reads, so the effect re-runs on any journal/planner/goals change, as in
  vanilla). The `ui-segment` change handler sets the signal (stopPropagation).
- Tiles (vanilla's values): `usd(totals.spending)` (insights spending is single-currency USD, as
  vanilla), `Math.round(activityMinutes)`, `Math.round(calories)`, `completionRate === undefined
  ? '—' : `${Math.round(rate*100)}%``. Delta line per tile for the first three only: hidden when
  `deltas.x === 0`, else `↑`/`↓` + magnitude (money via `usd`, else rounded).
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
- `src/insights/format.ts`: `PERIOD_OPTIONS` (`[{week,'This week'},{month,'This month'}]`),
  `usd`, `reviewGoalLabel`, `areaStatsLabel`, `activityLabel`, `deltaLabel(delta, money)`,
  `completionLabel(rate?)` — ported from vanilla's `insights/format.js` with tests.
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
  on Finance, a goal via `addGoal`, then `navTo('insights')` and "42.50"/"dining"/"Sleep goal"
  present + "No goals yet" absent; the segment `[data-value="week"|"month"]` click keeps 4
  tiles).
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, stencil e2e projects
  green; ui-oyl and vanilla untouched.

## Out of scope

- Charts/sparklines; custom ranges; the digest (`digestOf`); correlations; backing `lifeAreas`.

## Risks

| Risk | Mitigation |
|---|---|
| The review is recomputed on every revision of any store | Same cost as vanilla; the review is a pure read over in-memory aggregates. |
| Four tiles at Pixel 7 width | Nutrition already fits five with the 30rem container query; reuse that CSS. |
| `completionRate` semantics | Taken from `planner.completionRate(period)` untouched; "—" only when it is `undefined`. |
