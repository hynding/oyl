# all-of-oyl Phase 6: Insights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `insights/` — `streak` (bridging paused/no-data periods, direction-asymmetric in-progress handling), `correlate` (Pearson over per-day aggregates with per-metric kinds), and `review` (the life-wheel read model) — plus barrel exports and seed-driven integration tests.

**Architecture:** Pure functions over the Journal (and Planner/catalogs where the read demands), zero new data entry. `insights/` may import anything (it sits downstream of every module, like `fixtures/`). Everything reduces to the existing single aggregation path — `streak` walks period windows backward through `goal.progressOn`, `correlate` builds per-day series via `journal.aggregate`, `review` composes `totalsByPrefix`/`totalOf`/`completionRate`/`progressOn`/`streak` into one plain-data object. **One small signature extension** (documented in Task 3): `review` accepts an optional `projects` array — the spec's per-area "projects touched" rollup needs `Project.areaId`, which no other input carries; this follows the spec's own "catalogs ride along as the scopes demand" philosophy.

**Tech Stack:** TypeScript 5 strict, Vitest 4, zero runtime dependencies. Phases 1–5 (merged on `master`) provide everything imported here.

**Read first:** spec sections "insights/", "Pause semantics" (streak bridging + the in-progress asymmetry in the `streak` bullet), the `emptyPeriods` policy (Goal bullet), and "Life areas". Reference code: `goal/goal.ts` (`progressOn` returns `{ current, target, ratio, met?, paused, empty }` — `met` is undefined exactly when paused or empty-with-'skip'), `goal/period.ts` (`periodWindowOf`), `core/journal.ts` (`aggregate` returns `number | undefined`; `span()`; `totalsByPrefix`).

**Working conventions (same as phases 1–5):** TDD per task; `let caught: unknown` capture (rarely needed — these are pure functions); run from repo root; kebab-case files, named exports, colocated tests.

---

### Task 1: streak

**Files:**
- Create: `packages/all-of-oyl/src/insights/streak.ts`
- Test: `packages/all-of-oyl/src/insights/streak.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/insights/streak.test.ts
import { describe, expect, it } from 'vitest'
import { streak } from './streak'
import { Goal } from '../goal/goal'
import { DayKey } from '../core/day-key'
import { Journal } from '../core/journal'
import { Measurement } from '../track/measurement'
import { Transaction } from '../finance/transaction'
import { Money } from '../core/money'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)

/** A journal of custom.pages_read measurements at noon UTC on the given days. */
function pagesJournal(...entries: [string, number][]): Journal {
  const j = new Journal(NY)
  let minute = 0
  for (const [dayValue, value] of entries) {
    j.add(new Measurement({ occurredAt: new Date(`${dayValue}T12:${String(minute++).padStart(2, '0')}:00Z`), metric: 'custom.pages_read', value }))
  }
  return j
}

const pagesGoal = () => new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })

describe('streak', () => {
  it('counts consecutive met periods ending at asOf (in-progress atLeast counts once met)', () => {
    const j = pagesJournal(['2026-06-08', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(3)
  })

  it('a completed unmet period breaks the streak', () => {
    const j = pagesJournal(['2026-06-08', 5], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(2)
  })

  it('no-data periods bridge — neither break nor extend', () => {
    const j = pagesJournal(['2026-06-05', 25], ['2026-06-06', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(4)
  })

  it('paused periods bridge even when their numbers were unmet', () => {
    const j = pagesJournal(['2026-06-05', 25], ['2026-06-06', 25], ['2026-06-07', 5], ['2026-06-09', 25], ['2026-06-10', 25])
    const goal = pagesGoal()
    goal.pause(day('2026-06-07'), day('2026-06-07'))
    expect(streak(j, goal, day('2026-06-10'))).toBe(4)
  })

  it('an in-progress atLeast period that is not yet met bridges instead of breaking', () => {
    const j = pagesJournal(['2026-06-09', 25], ['2026-06-10', 10])
    expect(streak(j, pagesGoal(), day('2026-06-10'))).toBe(1)
  })

  it('an in-progress atMost period is excluded until complete — even when currently under target', () => {
    const j = pagesJournal(['2026-06-09', 60], ['2026-06-10', 60])
    const goal = new Goal({ metric: 'custom.pages_read', target: 120, direction: 'atMost', period: 'day' })
    expect(streak(j, goal, day('2026-06-10'))).toBe(1) // today excluded; yesterday met
  })

  it('a completed atMost period over target breaks', () => {
    const j = pagesJournal(['2026-06-08', 60], ['2026-06-09', 200], ['2026-06-10', 60])
    const goal = new Goal({ metric: 'custom.pages_read', target: 120, direction: 'atMost', period: 'day' })
    expect(streak(j, goal, day('2026-06-10'))).toBe(0) // today excluded; yesterday broke it
  })

  it('an empty journal has no streak — even for vacuous-success goals', () => {
    expect(streak(new Journal(NY), pagesGoal(), day('2026-06-10'))).toBe(0)
    const vacuous = new Goal({ metric: 'finance.spend.dining', target: 200, direction: 'atMost', period: 'day', emptyPeriods: 'met' })
    expect(streak(new Journal(NY), vacuous, day('2026-06-10'))).toBe(0)
  })

  it("emptyPeriods 'met' counts vacuous successes, bounded by the journal's span", () => {
    const j = new Journal(NY)
    j.add(new Transaction({ occurredAt: new Date('2026-06-01T16:00:00Z'), amount: Money.usd(500), category: 'dining', direction: 'expense' }))
    const vacuous = new Goal({ metric: 'finance.spend.dining', target: 200, direction: 'atMost', period: 'day', emptyPeriods: 'met' })
    // 06-10 in-progress atMost: excluded. 06-02..06-09 vacuously met (8). 06-01 spent $5 ≤ $200: met (1).
    expect(streak(j, vacuous, day('2026-06-10'))).toBe(9)
  })

  it('weekly goals count weeks', () => {
    const j = pagesJournal(['2026-06-01', 25], ['2026-06-03', 25], ['2026-06-08', 25], ['2026-06-09', 20])
    const weekly = new Goal({ metric: 'custom.pages_read', target: 40, direction: 'atLeast', period: 'week' })
    expect(streak(j, weekly, day('2026-06-10'))).toBe(2) // week of 06-08 has 45 (met, in-progress atLeast); week of 06-01 has 50
  })

  it('retroactive credit: a goal created today still earns its history', () => {
    // identical to the 3-day case — streaks evaluate data, not goal age (the Goal object IS new)
    const j = pagesJournal(['2026-06-08', 25], ['2026-06-09', 25], ['2026-06-10', 25])
    expect(streak(j, new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' }), day('2026-06-10'))).toBe(3)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/streak.test.ts`
Expected: FAIL — cannot resolve `./streak`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/insights/streak.ts
import type { DayKey } from '../core/day-key'
import type { Journal } from '../core/journal'
import type { Goal } from '../goal/goal'
import { periodWindowOf } from '../goal/period'

/**
 * Consecutive periods (ending at asOf) where the goal was met. Works for any
 * goal, any domain — one progress engine, one streak algorithm.
 *
 * Bridging: paused periods and no-data periods (under the default 'skip'
 * policy) neither break nor extend a streak. The in-progress period
 * containing asOf is asymmetric by direction: atLeast counts as soon as it's
 * met (and bridges while not-yet-met — the period isn't over); atMost is
 * excluded until complete (you can't have "kept under budget" for a day that
 * isn't over). Streaks evaluate data, not goal age — retroactive credit is
 * deliberate — and the walk is bounded by the journal's span.
 */
export function streak(journal: Journal, goal: Goal, asOf: DayKey): number {
  const span = journal.span()
  if (span === undefined) return 0

  let count = 0
  let window = periodWindowOf(goal.period, asOf)
  let inProgress = true

  while (window.end.compare(span.start) >= 0) {
    const progress = goal.progressOn(journal, window.start)
    const excluded =
      (inProgress && goal.direction === 'atMost') ||
      progress.paused ||
      (progress.empty && goal.emptyPeriods === 'skip')

    if (!excluded) {
      if (progress.met === true) {
        count += 1
      } else if (progress.met === false) {
        // in-progress atLeast that isn't met yet bridges — the period isn't over
        if (!inProgress) break
      }
    }

    window = periodWindowOf(goal.period, window.start.addDays(-1))
    inProgress = false
  }

  return count
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/streak.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/streak.ts packages/all-of-oyl/src/insights/streak.test.ts
git commit -m "feat(all-of-oyl): streak with bridging and direction-asymmetric in-progress periods"
```

---

### Task 2: correlate

**Files:**
- Create: `packages/all-of-oyl/src/insights/correlate.ts`
- Test: `packages/all-of-oyl/src/insights/correlate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/insights/correlate.test.ts
import { describe, expect, it } from 'vitest'
import { correlate } from './correlate'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { Journal } from '../core/journal'
import { MetricKey } from '../core/metric-key'
import { Measurement } from '../track/measurement'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const A = MetricKey.of('custom.a')
const B = MetricKey.of('custom.b')

function journalWith(entries: [string, string, number][]): Journal {
  const j = new Journal(NY)
  let minute = 0
  for (const [dayValue, metric, value] of entries) {
    j.add(new Measurement({ occurredAt: new Date(`${dayValue}T12:${String(minute++).padStart(2, '0')}:00Z`), metric, value }))
  }
  return j
}

describe('correlate', () => {
  it('finds perfect positive correlation', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 4],
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 6],
      ['2026-06-04', 'custom.a', 4], ['2026-06-04', 'custom.b', 8],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-04'))).toBeCloseTo(1)
  })

  it('finds perfect negative correlation', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 9],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 8],
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 7],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).toBeCloseTo(-1)
  })

  it('only days where BOTH metrics have data count as overlap', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], // no b
      ['2026-06-03', 'custom.a', 3], ['2026-06-03', 'custom.b', 6],
      ['2026-06-04', 'custom.b', 99], // no a
      ['2026-06-05', 'custom.a', 5], ['2026-06-05', 'custom.b', 10],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-05'))).toBeCloseTo(1)
  })

  it('returns undefined below 3 overlapping days', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 1], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 2], ['2026-06-02', 'custom.b', 4],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-02'))).toBeUndefined()
    expect(correlate(new Journal(NY), A, B, range('2026-06-01', '2026-06-05'))).toBeUndefined()
  })

  it('returns undefined for zero variance — a constant correlates with nothing', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 7], ['2026-06-01', 'custom.b', 2],
      ['2026-06-02', 'custom.a', 7], ['2026-06-02', 'custom.b', 4],
      ['2026-06-03', 'custom.a', 7], ['2026-06-03', 'custom.b', 6],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).toBeUndefined()
  })

  it('per-metric aggregation kinds: mood-vs-sleep style avg/avg', () => {
    const j = journalWith([
      ['2026-06-01', 'custom.a', 4], ['2026-06-01', 'custom.a', 6], // avg 5
      ['2026-06-01', 'custom.b', 5],
      ['2026-06-02', 'custom.a', 7], ['2026-06-02', 'custom.b', 7],
      ['2026-06-03', 'custom.a', 9], ['2026-06-03', 'custom.b', 9],
    ])
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'), { a: 'avg', b: 'avg' })).toBeCloseTo(1)
    // under the default 'sum', day 1's a would be 10, not 5 — and the correlation degrades
    expect(correlate(j, A, B, range('2026-06-01', '2026-06-03'))).not.toBeCloseTo(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/correlate.test.ts`
Expected: FAIL — cannot resolve `./correlate`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/insights/correlate.ts
import { DayRange } from '../core/day-range'
import type { AggregateKind, Journal } from '../core/journal'
import type { MetricKey } from '../core/metric-key'

/** Days both series have data must reach this for an honest answer. */
const MIN_OVERLAPPING_DAYS = 3

/**
 * Pearson correlation over per-day values of two metrics ("does mood track
 * sleep?"). Each day's value is the metric's daily aggregate; `kinds`
 * supplies the per-metric aggregation (default 'sum') — gauge metrics like
 * mood want 'avg', or two scores in one day corrupt the series. Returns
 * undefined when it cannot honestly answer: fewer than 3 overlapping
 * days-with-data, or zero variance in either series.
 */
export function correlate(
  journal: Journal,
  metricA: MetricKey,
  metricB: MetricKey,
  range: DayRange,
  kinds?: { a?: AggregateKind; b?: AggregateKind },
): number | undefined {
  const pairs: [number, number][] = []
  for (const day of range) {
    const single = DayRange.of(day, day)
    const a = journal.aggregate(metricA, single, kinds?.a ?? 'sum')
    const b = journal.aggregate(metricB, single, kinds?.b ?? 'sum')
    if (a === undefined || b === undefined) continue
    pairs.push([a, b])
  }
  if (pairs.length < MIN_OVERLAPPING_DAYS) return undefined

  const n = pairs.length
  const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n
  const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n
  let cov = 0
  let varA = 0
  let varB = 0
  for (const [a, b] of pairs) {
    cov += (a - meanA) * (b - meanB)
    varA += (a - meanA) ** 2
    varB += (b - meanB) ** 2
  }
  if (varA === 0 || varB === 0) return undefined
  return cov / Math.sqrt(varA * varB)
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/correlate.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/correlate.ts packages/all-of-oyl/src/insights/correlate.test.ts
git commit -m "feat(all-of-oyl): correlate with per-metric daily aggregation kinds"
```

---

### Task 3: review

**Files:**
- Create: `packages/all-of-oyl/src/insights/review.ts`
- Test: `packages/all-of-oyl/src/insights/review.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/insights/review.test.ts
import { describe, expect, it } from 'vitest'
import { review } from './review'
import { Goal } from '../goal/goal'
import { LifeArea } from '../core/life-area'
import { Activity } from '../activity/activity'
import { ActivitySession } from '../activity/activity-session'
import { Measurement } from '../track/measurement'
import { Transaction } from '../finance/transaction'
import { Task } from '../plan/task'
import { Project } from '../plan/project'
import { Planner } from '../plan/planner'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { Journal } from '../core/journal'
import { Money } from '../core/money'
import { Quantity } from '../core/quantity'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

describe('review', () => {
  const health = new LifeArea({ name: 'Health', slug: 'health' })
  const career = new LifeArea({ name: 'Career', slug: 'career' })
  const run = new Activity({ name: 'Run', slug: 'run', areaId: health.id })

  function build() {
    const journal = new Journal(NY)
    // current range 06-08..06-14: two runs, daily pages, one screen blowout, spending, calories
    journal.add(new ActivitySession({ occurredAt: at('2026-06-08', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
    journal.add(new ActivitySession({ occurredAt: at('2026-06-10', 11), activity: run, quantities: [Quantity.of(30, 'minutes')] }))
    for (const d of ['2026-06-08', '2026-06-09', '2026-06-14']) {
      // 06-14 included so the daily goal has data on the range END day (progress is judged there)
      journal.add(new Measurement({ occurredAt: at(d, 12), metric: 'custom.pages_read', value: 25 }))
    }
    journal.add(new Measurement({ occurredAt: at('2026-06-09', 22), metric: 'custom.screen_minutes', value: 200 }))
    journal.add(new Transaction({ occurredAt: at('2026-06-09', 18), amount: Money.usd(5000), category: 'groceries', direction: 'expense' }))
    journal.add(new Transaction({ occurredAt: at('2026-06-10', 19), amount: Money.usd(2000), category: 'dining', direction: 'expense' }))
    journal.add(new Measurement({ occurredAt: at('2026-06-08', 13), metric: 'custom.kcal_proxy', value: 1 })) // unrelated noise
    // previous range 06-01..06-07: lighter spending for the delta
    journal.add(new Transaction({ occurredAt: at('2026-06-03', 18), amount: Money.usd(3000), category: 'groceries', direction: 'expense' }))

    const planner = new Planner()
    const project = new Project({ name: 'Promotion push', areaId: career.id })
    const done = new Task({ title: 'Draft self-review', due: day('2026-06-09'), projectId: project.id })
    const open = new Task({ title: 'Schedule 1:1', due: day('2026-06-12') })
    planner.add(done)
    planner.add(open)
    planner.complete(done.id, day('2026-06-09'))

    const pagesGoal = new Goal({ name: 'Read', metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day', areaId: health.id })
    const screenGoal = new Goal({ name: 'Less scrolling', metric: 'custom.screen_minutes', target: 120, direction: 'atMost', period: 'week' })

    return {
      journal, planner, project,
      input: {
        journal, planner,
        goals: [pagesGoal, screenGoal],
        activities: [run],
        areas: [health, career],
        projects: [project],
        period: DayRange.of(day('2026-06-08'), day('2026-06-14')),
      },
    }
  }

  it('reports per-goal progress and streaks', () => {
    const { input } = build()
    const result = review(input)
    expect(result.goals).toHaveLength(2)
    const pages = result.goals.find((g) => g.name === 'Read')!
    expect(pages.progress.met).toBe(true) // judged at the range end's period
    expect(pages.streak).toBeGreaterThanOrEqual(3)
    const screen = result.goals.find((g) => g.name === 'Less scrolling')!
    expect(screen.progress.met).toBe(false) // 200 screen minutes > 120 for the week at range end — progressOn has no wall clock, so the window is judged outright
  })

  it('ranks top spending and totals activity', () => {
    const { input } = build()
    const result = review(input)
    expect(result.topSpending).toEqual([
      { category: 'groceries', total: 50 },
      { category: 'dining', total: 20 },
    ])
    expect(result.activityTotals).toEqual([{ slug: 'run', count: 2, minutes: 60 }])
  })

  it('computes completion rate and period-over-period deltas', () => {
    const { input } = build()
    const result = review(input)
    expect(result.completionRate).toBeCloseTo(0.5)
    expect(result.totals.spending).toBeCloseTo(70)
    expect(result.previousTotals.spending).toBeCloseTo(30)
    expect(result.deltas.spending).toBeCloseTo(40)
    expect(result.totals.activityMinutes).toBe(60)
    expect(result.previousTotals.activityMinutes).toBe(0)
  })

  it('rolls up the life wheel per area with an unassigned bucket', () => {
    const { input } = build()
    const result = review(input)
    expect(result.areas.map((a) => a.name)).toEqual(['Health', 'Career', 'unassigned'])
    const healthRollup = result.areas[0]!
    expect(healthRollup.goalsTotal).toBe(1)
    expect(healthRollup.goalsMet).toBe(1)
    expect(healthRollup.activityMinutes).toBe(60)
    const careerRollup = result.areas[1]!
    expect(careerRollup.projectsTouched).toBe(1)
    const unassigned = result.areas[2]!
    expect(unassigned.goalsTotal).toBe(1) // the screen goal has no area
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/review.test.ts`
Expected: FAIL — cannot resolve `./review`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/insights/review.ts
import type { Activity } from '../activity/activity'
import { DayRange } from '../core/day-range'
import type { Id } from '../core/id'
import type { Journal } from '../core/journal'
import type { LifeArea } from '../core/life-area'
import { MetricKey } from '../core/metric-key'
import type { Goal, GoalProgress } from '../goal/goal'
import type { Planner } from '../plan/planner'
import type { Project } from '../plan/project'
import { Task } from '../plan/task'
import { streak } from './streak'

export type ReviewTotals = { spending: number; activityMinutes: number; calories: number }
export type GoalReview = { goalId: Id; name?: string; progress: GoalProgress; streak: number }
export type AreaRollup = {
  areaId?: Id
  name: string
  goalsMet: number
  goalsTotal: number
  activityMinutes: number
  projectsTouched: number
}

/** Plain data an app can render — the weekly/monthly/annual review. */
export type Review = {
  period: DayRange
  goals: readonly GoalReview[]
  topSpending: readonly { category: string; total: number }[]
  activityTotals: readonly { slug: string; count: number; minutes: number }[]
  completionRate?: number
  totals: ReviewTotals
  previousTotals: ReviewTotals
  deltas: ReviewTotals
  areas: readonly AreaRollup[]
}

function totalsFor(journal: Journal, range: DayRange): ReviewTotals {
  let spending = 0
  for (const value of journal.totalsByPrefix('finance.spend', range).values()) spending += value
  let activityMinutes = 0
  for (const [key, value] of journal.totalsByPrefix('activity', range)) {
    if (key.endsWith('.minutes')) activityMinutes += value
  }
  return { spending, activityMinutes, calories: journal.totalOf(MetricKey.of('nutrition.calories'), range) }
}

function previousRangeOf(range: DayRange): DayRange {
  const days = Math.round(
    (Date.parse(`${range.end.value}T00:00:00Z`) - Date.parse(`${range.start.value}T00:00:00Z`)) / 86_400_000,
  ) + 1
  const prevEnd = range.start.addDays(-1)
  return DayRange.of(prevEnd.addDays(-(days - 1)), prevEnd)
}

/**
 * The read-side review: per-goal progress (judged at the range end) and
 * streaks, top spending, activity totals, planner completion rate,
 * period-over-period deltas, and the per-area life-wheel rollup. Takes the
 * catalogs it needs explicitly; `projects` rides along for the
 * projects-touched rollup (it carries the area mapping nothing else has).
 */
export function review(input: {
  journal: Journal
  planner: Planner
  goals: readonly Goal[]
  activities: readonly Activity[]
  areas: readonly LifeArea[]
  projects?: readonly Project[]
  period: DayRange
}): Review {
  const { journal, planner, goals, activities, areas, projects = [], period } = input

  const goalReviews: GoalReview[] = goals.map((goal) => ({
    goalId: goal.id,
    ...(goal.name !== undefined ? { name: goal.name } : {}),
    progress: goal.progressOn(journal, period.end),
    streak: streak(journal, goal, period.end),
  }))

  const topSpending = [...journal.totalsByPrefix('finance.spend', period)]
    .map(([key, total]) => ({ category: key.split('.')[2] as string, total }))
    .sort((a, b) => b.total - a.total)

  const perSlug = new Map<string, { count: number; minutes: number }>()
  for (const [key, value] of journal.totalsByPrefix('activity', period)) {
    const [, slug, unit] = key.split('.') as [string, string, string]
    const entry = perSlug.get(slug) ?? { count: 0, minutes: 0 }
    if (unit === 'count') entry.count += value
    if (unit === 'minutes') entry.minutes += value
    perSlug.set(slug, entry)
  }
  const activityTotals = [...perSlug].map(([slug, totals]) => ({ slug, ...totals }))

  const completionRate = planner.completionRate(period)

  const totals = totalsFor(journal, period)
  const previousTotals = totalsFor(journal, previousRangeOf(period))
  const deltas: ReviewTotals = {
    spending: totals.spending - previousTotals.spending,
    activityMinutes: totals.activityMinutes - previousTotals.activityMinutes,
    calories: totals.calories - previousTotals.calories,
  }

  // ── Life wheel ────────────────────────────────────────────────────────────
  const slugToArea = new Map<string, Id | undefined>(activities.map((a) => [a.slug, a.areaId]))
  const minutesByArea = new Map<Id | undefined, number>()
  for (const [key, value] of journal.totalsByPrefix('activity', period)) {
    if (!key.endsWith('.minutes')) continue
    const slug = key.split('.')[1] as string
    const areaId = slugToArea.get(slug) // unknown slugs land in unassigned
    minutesByArea.set(areaId, (minutesByArea.get(areaId) ?? 0) + value)
  }
  const touchedProjects = projects.filter((project) =>
    planner
      .all()
      .some(
        (p) =>
          p instanceof Task &&
          p.projectId === project.id &&
          ((p.due !== undefined && period.contains(p.due)) ||
            (p.completedOn !== undefined && period.contains(p.completedOn))),
      ),
  )

  const rollupFor = (areaId: Id | undefined, name: string): AreaRollup => {
    const areaGoals = goalReviews.filter((g, i) => goals[i]?.areaId === areaId)
    return {
      ...(areaId !== undefined ? { areaId } : {}),
      name,
      goalsMet: areaGoals.filter((g) => g.progress.met === true).length,
      goalsTotal: areaGoals.length,
      activityMinutes: minutesByArea.get(areaId) ?? 0,
      projectsTouched: touchedProjects.filter((p) => p.areaId === areaId).length,
    }
  }

  const areaRollups: AreaRollup[] = [
    ...areas.map((area) => rollupFor(area.id, area.name)),
    rollupFor(undefined, 'unassigned'),
  ]

  return {
    period,
    goals: goalReviews,
    topSpending,
    activityTotals,
    ...(completionRate !== undefined ? { completionRate } : {}),
    totals,
    previousTotals,
    deltas,
    areas: areaRollups,
  }
}
```

NOTE: `areaGoals` uses index alignment between `goalReviews` and `goals` (they're built by the same map). If that reads too clever during implementation, zip explicitly — but keep the behavior: a goal's area comes from the Goal, the verdict from its review.

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/insights/review.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/review.ts packages/all-of-oyl/src/insights/review.test.ts
git commit -m "feat(all-of-oyl): review — the life-wheel read model"
```

---

### Task 4: Barrel + seed-driven integration tests + gates

No new seed data — insights are pure functions; the existing 263-entry seed plus goals/plans/areas already exercise everything. The integration test computes real answers over Avery's life.

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing test**

Append to `fixtures.test.ts` (extend imports: `correlate, review, streak` from `../index`; `Goal` from `../goal/goal` is already imported; `LifeArea` already imported; `Activity` from `../activity/activity`; `Project` from `../plan/project` already imported; `MetricKey` already imported):

```ts
  it('insights answer real questions over the seeded life', () => {
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))
    const planner = new Planner()
    for (const shape of seed.plans) planner.add(revivePlan(shape))
    const goals = seed.goals.map((shape) => Goal.fromJSON(shape))
    const areas = seed.lifeAreas.map((shape) => LifeArea.fromJSON(shape))
    const activities = seed.activities.map((shape) => Activity.fromJSON(shape))
    const projects = seed.projects.map((shape) => Project.fromJSON(shape))

    // calorie streak: atMost, so TODAY's in-progress period is excluded; the 41 completed
    // days (Apr 21–May 31) are all under 2200, bridged across the March gap → 41
    const calories = goals.find((g) => g.metric === 'nutrition.calories')!
    expect(streak(journal, calories, FIXTURE_TODAY)).toBe(41)

    // sleep streak: 6.5 + (dayIndex % 4) * 0.5 — yesterday (idx 40) dips to 6.5 < 7, today is 7.0
    const sleep = goals.find((g) => g.metric === 'sleep.hours')!
    expect(streak(journal, sleep, FIXTURE_TODAY)).toBe(1)

    // weight streak: atMost 81 'last' — today excluded (in-progress atMost), 4 paused days bridged,
    // met from idx 20 (82 − 1.00 = 81.00 ≤ 81) through yesterday → 21 countable minus 4 paused = 17
    const weight = goals.find((g) => g.metric === 'body.weight_kg')!
    expect(streak(journal, weight, FIXTURE_TODAY)).toBe(17)

    // sleep and mood cycle at different frequencies (4 vs 5) — defined, honest, imperfect correlation
    const r = correlate(journal, MetricKey.of('sleep.hours'), MetricKey.of('mood.score'), DayRange.of(FIXTURE_TODAY.addDays(-27), FIXTURE_TODAY), { a: 'avg', b: 'avg' })
    expect(r).toBeDefined()
    expect(Math.abs(r!)).toBeLessThanOrEqual(1)

    // the weekly review over the last full week (May 25–31)
    const lastWeek = DayRange.of(FIXTURE_TODAY.addDays(-7), FIXTURE_TODAY.addDays(-1))
    const weekly = review({ journal, planner, goals, activities, areas, projects, period: lastWeek })
    expect(weekly.goals).toHaveLength(4)
    expect(weekly.topSpending[0]?.category).toBe('groceries')
    expect(weekly.activityTotals.find((a) => a.slug === 'run')?.minutes).toBe(120)
    expect(weekly.completionRate).toBeCloseTo(0.5) // Declutter closet done, File taxes open
    expect(weekly.totals.spending).toBeGreaterThan(0)
    expect(weekly.areas.map((a) => a.name)).toEqual(['Health', 'Family', 'Career', 'Money', 'unassigned'])
    const healthArea = weekly.areas[0]!
    expect(healthArea.activityMinutes).toBeGreaterThan(0) // runs + meditations are Health
    const careerArea = weekly.areas[2]!
    expect(careerArea.projectsTouched).toBe(1) // Spring reset touched via Declutter closet
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — `streak` not exported from the barrel.

- [ ] **Step 3: Extend the barrel**

In `packages/all-of-oyl/src/index.ts`, add (with the other module exports):

```ts
export { streak } from './insights/streak'
export { correlate } from './insights/correlate'
export { review, type Review, type ReviewTotals, type GoalReview, type AreaRollup } from './insights/review'
```

- [ ] **Step 4: Run the full gates**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.
Confirm `packages/all-of-oyl/package.json` dependencies unchanged.

If the seeded streak numbers disagree, do NOT loosen the assertions — recompute from the deterministic seed (weight = 82 − dayIndex × 0.05 at 11:00Z daily; sleep = 6.5 + (dayIndex % 4) × 0.5; pause = TODAY−10 … TODAY−7; the March DST cluster sits outside the walk because the calorie/weight walks break or the span bound stops them) and report BLOCKED with the actual numbers if they genuinely disagree.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/index.ts packages/all-of-oyl/src/fixtures/fixtures.test.ts
git commit -m "feat(all-of-oyl): phase 6 barrel exports + seed-driven insights integration"
```

---

## Phase 6 exit criteria

- [ ] All gates green; no dependencies added.
- [ ] `insights/` contains only pure functions — no classes, no state, no clock; it may import any module (downstream like `fixtures/`).
- [ ] Every phase-6 spec behavior tested: streak counting/breaking, paused + no-data bridging, in-progress asymmetry (atLeast counts when met / bridges when not; atMost excluded), vacuous-success streaks bounded by span, weekly periods, retroactive credit, empty journal → 0; correlate perfect ±1, overlap-only days, <3 days → undefined, zero variance → undefined, per-metric kinds; review per-goal progress+streaks, top spending ranked, activity totals, completion rate, period-over-period deltas, life-wheel rollup with unassigned bucket and projects-touched.
- [ ] The `projects` input extension to `review` is documented in its doc comment (the spec's catalogs-ride-along philosophy).
- [ ] Seed-driven integration: exact streaks (41 / 1 / 17) computed over Avery's deterministic life; weekly review answers over May 25–31.

## Explicitly NOT in phase 6 (resist the urge)

`sharedProgress` (phase 7 — it composes goal progress + streaks for a VIEWER under grants; building it now without Connection/Grant would be scaffolding), any new Journal aggregation methods (everything here reduces to the existing path), any caching/memoization of insights (pure recompute is the contract), and review serialization (a `Review` is plain data already; apps serialize it themselves if they wish).
