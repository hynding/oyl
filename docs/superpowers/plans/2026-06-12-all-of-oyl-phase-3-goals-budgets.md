# all-of-oyl Phase 3: Goals & Budgets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `goal/` module — deterministic period windows, the domain-blind `Goal` with pause semantics and the no-data policy, `GoalProgress`, and `Budget` as sugar over the goal engine — plus fixtures/seed extension.

**Architecture:** `goal/` imports `core/` only. A `Goal` targets a `MetricKey` with direction/period/aggregation and computes progress through `journal.aggregate` — the single aggregation path; `Budget` wraps an internal `Goal` (and `journal.totalOf`) so no second aggregation implementation exists. Goals are stateful entities (pause ranges mutate in place, like `Plan` status); pause history is kept canonical by merging overlapping/adjacent ranges. Serialization follows the established tolerant-reader template.

**Tech Stack:** TypeScript 5 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4, zero runtime dependencies. Phases 1–2 (merged on `master`) provide everything imported here.

**Read first:** `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` — sections "Goals, budgets, and insights", "Pause semantics", "Counters vs. gauges" (two-stage gauge rule + the `emptyPeriods` no-data policy lives in the Goal bullet), and "Life areas". Reference code: `core/journal.ts` (`aggregate` returns `number | undefined` — undefined IS the no-data signal), `core/plan.ts` (the stateful-entity pattern), `user/user.ts` (tolerant-reader template).

**Working conventions (same as phases 1–2):** TDD per task (failing test → SEE fail → implement → SEE pass → exact commit message); `let caught: unknown` capture for throw-assertions; run from repo root (`pnpm --filter @oyl/all-of-oyl test -- <path>`, `pnpm --filter @oyl/all-of-oyl typecheck:src`); kebab-case files, named exports, colocated tests, conditional spreads for optional props (NEVER assign `undefined` to an optional prop — and note: deleting an optional field uses `delete obj.to`, not `obj.to = undefined`).

---

### Task 1: Period windows

Deterministic windows: a `day` is itself; a `week` is the ISO week (Monday–Sunday) containing it; a `month` is its calendar month.

**Files:**
- Create: `packages/all-of-oyl/src/goal/period.ts`
- Test: `packages/all-of-oyl/src/goal/period.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/goal/period.test.ts
import { describe, expect, it } from 'vitest'
import { periodWindowOf } from './period'
import { DayKey } from '../core/day-key'

const day = (s: string) => DayKey.of(s)
const window = (period: 'day' | 'week' | 'month', s: string) => {
  const w = periodWindowOf(period, day(s))
  return [w.start.value, w.end.value]
}

describe('periodWindowOf', () => {
  it('day window is the day itself', () => {
    expect(window('day', '2026-06-03')).toEqual(['2026-06-03', '2026-06-03'])
  })

  it('week window is the ISO Monday–Sunday week containing the day', () => {
    expect(window('week', '2026-06-03')).toEqual(['2026-06-01', '2026-06-07']) // Wednesday
    expect(window('week', '2026-06-01')).toEqual(['2026-06-01', '2026-06-07']) // Monday boundary
    expect(window('week', '2026-06-07')).toEqual(['2026-06-01', '2026-06-07']) // Sunday boundary
  })

  it('week windows span year boundaries (ISO week 53)', () => {
    // 2026-01-01 is a Thursday; its ISO week starts Monday 2025-12-29
    expect(window('week', '2026-01-01')).toEqual(['2025-12-29', '2026-01-04'])
    expect(window('week', '2025-12-29')).toEqual(['2025-12-29', '2026-01-04'])
  })

  it('month window is the calendar month, leap-aware', () => {
    expect(window('month', '2026-06-15')).toEqual(['2026-06-01', '2026-06-30'])
    expect(window('month', '2026-02-10')).toEqual(['2026-02-01', '2026-02-28'])
    expect(window('month', '2024-02-10')).toEqual(['2024-02-01', '2024-02-29']) // leap
    expect(window('month', '2026-12-31')).toEqual(['2026-12-01', '2026-12-31'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/period.test.ts`
Expected: FAIL — cannot resolve `./period`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/goal/period.ts
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'

export type GoalPeriod = 'day' | 'week' | 'month'

export const GOAL_PERIODS: readonly GoalPeriod[] = ['day', 'week', 'month']

/**
 * The deterministic window containing `day`: the day itself, its ISO week
 * (Monday–Sunday), or its calendar month. All derived from DayKey, so the
 * Journal's timezone decision flows through unchanged.
 */
export function periodWindowOf(period: GoalPeriod, day: DayKey): DayRange {
  if (period === 'day') return DayRange.of(day, day)
  if (period === 'week') {
    const monday = day.addDays(1 - day.weekday())
    return DayRange.of(monday, monday.addDays(6))
  }
  const [y, m] = day.value.split('-').map(Number) as [number, number]
  const first = DayKey.of(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`)
  const nextFirst =
    m === 12
      ? DayKey.of(`${String(y + 1).padStart(4, '0')}-01-01`)
      : DayKey.of(`${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-01`)
  return DayRange.of(first, nextFirst.addDays(-1))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/period.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/goal/period.ts packages/all-of-oyl/src/goal/period.test.ts
git commit -m "feat(all-of-oyl): deterministic goal period windows"
```

---

### Task 2: Goal core — construction + GoalProgress + progressOn

The domain-blind goal: targets a metric, never knows which domain produced the number. No pause logic yet (Task 3).

**Files:**
- Create: `packages/all-of-oyl/src/goal/goal.ts`
- Test: `packages/all-of-oyl/src/goal/goal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/goal/goal.test.ts
import { describe, expect, it } from 'vitest'
import { Goal } from './goal'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Journal } from '../core/journal'
import { Measurement } from '../track/measurement'
import { DomainError } from '../core/domain-error'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const at = (s: string, hourUtc: number) => new Date(`${s}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

function journalWith(...measurements: [string, string, number][]): Journal {
  const j = new Journal(NY)
  let hour = 10
  for (const [dayValue, metric, value] of measurements) {
    j.add(new Measurement({ occurredAt: at(dayValue, hour), metric, value }))
    hour = hour === 22 ? 10 : hour + 1
  }
  return j
}

describe('Goal', () => {
  it('constructs with defaults: sum aggregation, skip empty periods', () => {
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    expect(goal.aggregation).toBe('sum')
    expect(goal.emptyPeriods).toBe('skip')
    expect(goal.name).toBeUndefined()
    expect(Id.of(goal.id)).toBe(goal.id)
  })

  it('rejects invalid construction', () => {
    const cases: [() => unknown, string][] = [
      [() => new Goal({ metric: 'pages', target: 20, direction: 'atLeast', period: 'day' }), 'INVALID_METRIC_KEY'],
      [() => new Goal({ metric: 'custom.pages_read', target: 0, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ metric: 'custom.pages_read', target: -5, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ metric: 'custom.pages_read', target: NaN, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
      [() => new Goal({ name: '', metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' }), 'INVALID_QUANTITY'],
    ]
    for (const [build, code] of cases) {
      let caught: unknown
      try {
        build()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('atLeast: met when current reaches target; ratio is attainment', () => {
    const j = journalWith(['2026-06-03', 'custom.pages_read', 15])
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.current).toBe(15)
    expect(p.target).toBe(20)
    expect(p.ratio).toBeCloseTo(0.75)
    expect(p.met).toBe(false)
    expect(p.paused).toBe(false)
    expect(p.empty).toBe(false)

    j.add(new Measurement({ occurredAt: at('2026-06-03', 20), metric: 'custom.pages_read', value: 10 }))
    expect(goal.progressOn(j, day('2026-06-03')).met).toBe(true)
    expect(goal.progressOn(j, day('2026-06-03')).ratio).toBe(1) // clamped
  })

  it('atMost: met while current stays at or under target; ratio is allowance consumed', () => {
    const j = journalWith(['2026-06-03', 'custom.screen_minutes', 90])
    const goal = new Goal({ metric: 'custom.screen_minutes', target: 120, direction: 'atMost', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.met).toBe(true)
    expect(p.ratio).toBeCloseTo(0.75)

    j.add(new Measurement({ occurredAt: at('2026-06-03', 21), metric: 'custom.screen_minutes', value: 60 }))
    const over = goal.progressOn(j, day('2026-06-03'))
    expect(over.met).toBe(false)
    expect(over.ratio).toBe(1) // clamped
  })

  it('ratio clamps negative currents to 0', () => {
    const j = journalWith(['2026-06-03', 'custom.net_spend', -10])
    const goal = new Goal({ metric: 'custom.net_spend', target: 100, direction: 'atMost', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.ratio).toBe(0)
    expect(p.met).toBe(true)
  })

  it('resolves week and month windows through the same engine', () => {
    const j = journalWith(
      ['2026-06-01', 'custom.km', 5],
      ['2026-06-03', 'custom.km', 5],
      ['2026-06-07', 'custom.km', 5],
      ['2026-06-08', 'custom.km', 99], // next ISO week — excluded
    )
    const weekly = new Goal({ metric: 'custom.km', target: 15, direction: 'atLeast', period: 'week' })
    expect(weekly.progressOn(j, day('2026-06-03')).current).toBe(15)
    expect(weekly.progressOn(j, day('2026-06-03')).met).toBe(true)
  })

  it('gauge goals use the aggregation kind ("weigh at most 80, last reading wins")', () => {
    const j = journalWith(['2026-06-03', 'body.weight_kg', 81], ['2026-06-03', 'body.weight_kg', 79.5])
    const goal = new Goal({ metric: 'body.weight_kg', target: 80, direction: 'atMost', period: 'day', aggregation: 'last' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.current).toBe(79.5)
    expect(p.met).toBe(true)
  })

  it('no-data periods: skip (default) reports empty with met undefined', () => {
    const j = new Journal(NY)
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.empty).toBe(true)
    expect(p.met).toBeUndefined()
    expect(p.current).toBe(0)
  })

  it("no-data periods: 'met' opts into vacuous success", () => {
    const j = new Journal(NY)
    const goal = new Goal({
      metric: 'finance.spend.dining',
      target: 200,
      direction: 'atMost',
      period: 'month',
      emptyPeriods: 'met',
    })
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.empty).toBe(true)
    expect(p.met).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts`
Expected: FAIL — cannot resolve `./goal`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/goal/goal.ts
import { DayKey } from '../core/day-key'
import type { DayRange } from '../core/day-range'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import type { AggregateKind, Journal } from '../core/journal'
import { MetricKey } from '../core/metric-key'
import type { PersistedMeta } from '../core/persisted-meta'
import { type GoalPeriod, periodWindowOf } from './period'

export type GoalDirection = 'atLeast' | 'atMost'
export type EmptyPeriods = 'met' | 'skip'

/**
 * One period's verdict. `met` is undefined for two distinguishable reasons —
 * `paused: true` (you said stop judging) or `empty: true` with the default
 * 'skip' policy (there was nothing to judge) — both flags are explicit so
 * UIs can render them differently.
 */
export type GoalProgress = {
  current: number
  target: number
  /** Clamped to [0, 1]: attainment for atLeast, allowance consumed for atMost. */
  ratio: number
  met?: boolean
  paused: boolean
  empty: boolean
}

type PauseRange = { from: DayKey; to?: DayKey }

/**
 * Domain-blind: a Goal targets a metric key and never knows which domain
 * produced the number. Progress flows through journal.aggregate — the single
 * aggregation path. Stateful entity: pause ranges mutate in place.
 */
export class Goal {
  readonly id: Id
  readonly name?: string
  readonly metric: MetricKey
  readonly target: number
  readonly direction: GoalDirection
  readonly period: GoalPeriod
  readonly aggregation: AggregateKind
  readonly emptyPeriods: EmptyPeriods
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private pauseRanges: PauseRange[] = []
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      name?: string
      metric: string
      target: number
      direction: GoalDirection
      period: GoalPeriod
      aggregation?: AggregateKind
      emptyPeriods?: EmptyPeriods
      areaId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name !== undefined && props.name.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'name must be non-empty when given')
    }
    if (!Number.isFinite(props.target) || props.target <= 0) {
      throw new DomainError('INVALID_QUANTITY', `target must be a positive finite number, got ${props.target}`)
    }
    this.id = props.id ?? Id.create()
    if (props.name !== undefined) this.name = props.name
    this.metric = MetricKey.of(props.metric)
    this.target = props.target
    this.direction = props.direction
    this.period = props.period
    this.aggregation = props.aggregation ?? 'sum'
    this.emptyPeriods = props.emptyPeriods ?? 'skip'
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  /** The period window containing `day`, judged by this goal's rules. */
  progressOn(journal: Journal, day: DayKey): GoalProgress {
    const window = periodWindowOf(this.period, day)
    const raw = journal.aggregate(this.metric, window, this.aggregation)
    const empty = raw === undefined
    const current = raw ?? 0
    const ratio = Math.min(Math.max(current / this.target, 0), 1)
    const paused = this.isPausedDuring(window)
    const base: GoalProgress = { current, target: this.target, ratio, paused, empty }
    if (paused) return base
    if (empty) return this.emptyPeriods === 'met' ? { ...base, met: true } : base
    const met = this.direction === 'atLeast' ? current >= this.target : current <= this.target
    return { ...base, met }
  }

  /** A window is paused when it overlaps any paused range. Implemented in Task 3. */
  protected isPausedDuring(_window: DayRange): boolean {
    return false
  }
}
```

(Note: `isPausedDuring` is a stub here; Task 3 replaces it with the real implementation and removes the `protected`/underscore. This keeps Task 2 green without pause logic.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts`
Expected: PASS. Also run `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/goal/goal.ts packages/all-of-oyl/src/goal/goal.test.ts
git commit -m "feat(all-of-oyl): domain-blind Goal with progress engine"
```

---

### Task 3: Pause semantics

Humane tracking: `pause(from, to?)`, open-ended vacation mode, `resume(on)`, canonical merging of overlapping/adjacent ranges, and paused windows reporting `met: undefined`.

**Files:**
- Modify: `packages/all-of-oyl/src/goal/goal.ts`
- Test: `packages/all-of-oyl/src/goal/goal.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append inside the `describe('Goal', ...)` block:

```ts
  it('a window overlapping a paused range reports paused with met undefined', () => {
    const j = journalWith(['2026-06-03', 'custom.pages_read', 25])
    const goal = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-02'), day('2026-06-04'))
    const p = goal.progressOn(j, day('2026-06-03'))
    expect(p.paused).toBe(true)
    expect(p.met).toBeUndefined()
    expect(p.current).toBe(25) // numbers still reported

    // boundary overlap: any window touching the pause is paused
    const weekly = new Goal({ metric: 'custom.pages_read', target: 20, direction: 'atLeast', period: 'week' })
    weekly.pause(day('2026-06-07'), day('2026-06-09'))
    expect(weekly.progressOn(j, day('2026-06-03')).paused).toBe(true) // week 06-01..06-07 touches pause start
    expect(weekly.progressOn(j, day('2026-06-10')).paused).toBe(true) // week 06-08..06-14 overlaps pause end 06-09
    expect(weekly.progressOn(j, day('2026-06-17')).paused).toBe(false) // week 06-15..06-21 is clear
  })

  it('pause ranges merge when overlapping or adjacent', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-01'), day('2026-06-03'))
    goal.pause(day('2026-06-02'), day('2026-06-05')) // overlap
    goal.pause(day('2026-06-06'), day('2026-06-08')) // adjacent (06-05 + 1 = 06-06)
    goal.pause(day('2026-06-20'), day('2026-06-21')) // separate
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([
      ['2026-06-01', '2026-06-08'],
      ['2026-06-20', '2026-06-21'],
    ])
  })

  it('open-ended pause is vacation mode and swallows later ranges; resume closes it', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    goal.pause(day('2026-06-10')) // open
    goal.pause(day('2026-06-15'), day('2026-06-16')) // swallowed
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([['2026-06-10', undefined]])
    expect(goal.progressOn(new Journal(NY), day('2026-12-25')).paused).toBe(true)

    goal.resume(day('2026-06-20'))
    expect(goal.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([['2026-06-10', '2026-06-20']])
    expect(goal.progressOn(new Journal(NY), day('2026-12-25')).paused).toBe(false)
  })

  it('rejects inverted ranges, resume-before-from, and resume without an open pause', () => {
    const goal = new Goal({ metric: 'custom.x', target: 1, direction: 'atLeast', period: 'day' })
    let caught1: unknown
    try {
      goal.pause(day('2026-06-10'), day('2026-06-05'))
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_RANGE')

    let caught2: unknown
    try {
      goal.resume(day('2026-06-20'))
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('ILLEGAL_TRANSITION')

    goal.pause(day('2026-06-10'))
    let caught3: unknown
    try {
      goal.resume(day('2026-06-05'))
    } catch (e) {
      caught3 = e
    }
    expect((caught3 as DomainError)?.code).toBe('INVALID_RANGE')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts`
Expected: FAIL — `pause` is not a function.

- [ ] **Step 3: Implement pause semantics**

In `packages/all-of-oyl/src/goal/goal.ts`, replace the stub `isPausedDuring` and add the mutation methods (the `DayRange` import becomes a value-position type usage only — keep it a type import):

```ts
  /** Defensive copies; canonical (sorted, merged) order. */
  get pauses(): readonly { from: DayKey; to?: DayKey }[] {
    return this.pauseRanges.map((r) => ({ ...r }))
  }

  /**
   * Pause judgment from `from`, optionally through `to` (inclusive). Omitting
   * `to` is vacation mode — paused until resume(). Overlapping or adjacent
   * ranges merge so pause history stays canonical.
   */
  pause(from: DayKey, to?: DayKey): void {
    if (to !== undefined && to.compare(from) < 0) {
      throw new DomainError('INVALID_RANGE', `pause end ${to.value} precedes start ${from.value}`)
    }
    this.pauseRanges.push(to !== undefined ? { from, to } : { from })
    this.canonicalize()
  }

  /** Close the open pause (inclusive end). Throws if nothing is open. */
  resume(on: DayKey): void {
    const open = this.pauseRanges.find((r) => r.to === undefined)
    if (open === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', 'no open pause to resume')
    }
    if (on.compare(open.from) < 0) {
      throw new DomainError('INVALID_RANGE', `resume ${on.value} precedes pause start ${open.from.value}`)
    }
    open.to = on
    this.canonicalize()
  }

  private isPausedDuring(window: DayRange): boolean {
    return this.pauseRanges.some(
      (r) => r.from.compare(window.end) <= 0 && (r.to === undefined || r.to.compare(window.start) >= 0),
    )
  }

  /** Sort by start; merge overlapping/adjacent; an open range swallows everything after it. */
  private canonicalize(): void {
    const sorted = [...this.pauseRanges].sort((a, b) => a.from.compare(b.from))
    const merged: PauseRange[] = []
    for (const range of sorted) {
      const prev = merged[merged.length - 1]
      if (prev === undefined) {
        merged.push({ ...range })
        continue
      }
      if (prev.to === undefined) continue // open swallows the rest
      if (range.from.compare(prev.to.addDays(1)) <= 0) {
        if (range.to === undefined) {
          delete prev.to
        } else if (range.to.compare(prev.to) > 0) {
          prev.to = range.to
        }
      } else {
        merged.push({ ...range })
      }
    }
    this.pauseRanges = merged
  }
```

Also change `progressOn`'s `isPausedDuring` call site if needed (it already calls `this.isPausedDuring(window)`) and remove the old `protected isPausedDuring(_window ...)` stub entirely.

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/goal/goal.ts packages/all-of-oyl/src/goal/goal.test.ts
git commit -m "feat(all-of-oyl): goal pause semantics with canonical range merging"
```

---

### Task 4: Goal serialization

Tolerant-reader `toJSON`/`fromJSON` including pause ranges.

**Files:**
- Modify: `packages/all-of-oyl/src/goal/goal.ts`
- Test: `packages/all-of-oyl/src/goal/goal.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
  it('round-trips JSON with pauses, unknown fields, and meta', () => {
    const goal = new Goal({
      id: Id.of('00000000-0000-4000-8000-000000000050'),
      name: 'Eat lighter',
      metric: 'nutrition.calories',
      target: 2200,
      direction: 'atMost',
      period: 'day',
      areaId: Id.of('00000000-0000-4000-8000-000000000010'),
    })
    goal.pause(day('2026-06-02'), day('2026-06-04'))
    goal.pause(day('2026-06-10')) // open
    goal.meta = { createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), revision: 2 }

    const revived = Goal.fromJSON({ ...goal.toJSON(), futureField: 7 })
    expect(revived.name).toBe('Eat lighter')
    expect(revived.metric).toBe('nutrition.calories')
    expect(revived.aggregation).toBe('sum')
    expect(revived.emptyPeriods).toBe('skip')
    expect(revived.pauses.map((r) => [r.from.value, r.to?.value])).toEqual([
      ['2026-06-02', '2026-06-04'],
      ['2026-06-10', undefined],
    ])
    expect(revived.meta?.revision).toBe(2)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(7)
    // idempotence
    expect(Goal.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000050',
      metric: 'custom.x',
      target: 1,
      direction: 'atLeast',
      period: 'day',
      aggregation: 'sum',
      emptyPeriods: 'skip',
    }
    for (const shape of [
      null,
      { ...base, direction: 'sideways' },
      { ...base, period: 'fortnight' },
      { ...base, aggregation: 'median' },
      { ...base, emptyPeriods: 'maybe' },
      { ...base, target: 'lots' },
      { ...base, id: 'nope' },
      { ...base, pauses: [{ from: 'garbage' }] },
      { ...base, pauses: [{ from: '2026-06-10', to: '2026-06-05' }] }, // inverted on the wire
    ]) {
      let caught: unknown
      try {
        Goal.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts`
Expected: FAIL — `toJSON`/`fromJSON` missing.

- [ ] **Step 3: Implement serialization**

Add to `Goal` (imports to extend: `metaFromJSON, metaToJSON` as values from `../core/persisted-meta`; `GOAL_PERIODS` from `./period`):

```ts
  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      ...(this.name !== undefined ? { name: this.name } : {}),
      metric: this.metric,
      target: this.target,
      direction: this.direction,
      period: this.period,
      aggregation: this.aggregation,
      emptyPeriods: this.emptyPeriods,
      ...(this.areaId !== undefined ? { areaId: this.areaId } : {}),
      ...(this.pauseRanges.length > 0
        ? { pauses: this.pauseRanges.map((r) => ({ from: r.from.value, ...(r.to !== undefined ? { to: r.to.value } : {}) })) }
        : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Goal {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Goal shape')
    }
    const { id, name, metric, target, direction, period, aggregation, emptyPeriods, areaId, pauses, meta, ...extra } =
      shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      (name !== undefined && typeof name !== 'string') ||
      typeof metric !== 'string' ||
      typeof target !== 'number' ||
      (direction !== 'atLeast' && direction !== 'atMost') ||
      !(GOAL_PERIODS as readonly unknown[]).includes(period) ||
      (aggregation !== undefined && aggregation !== 'sum' && aggregation !== 'avg' && aggregation !== 'last') ||
      (emptyPeriods !== undefined && emptyPeriods !== 'met' && emptyPeriods !== 'skip') ||
      (areaId !== undefined && typeof areaId !== 'string') ||
      (pauses !== undefined && !Array.isArray(pauses))
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a Goal shape')
    }
    let parsedId: Id
    let parsedAreaId: Id | undefined
    try {
      parsedId = Id.of(id)
      parsedAreaId = areaId !== undefined ? Id.of(areaId as string) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', 'Goal has a malformed id')
    }
    const goal = new Goal(
      {
        id: parsedId,
        ...(name !== undefined ? { name: name as string } : {}),
        metric,
        target,
        direction,
        period: period as GoalPeriod,
        ...(aggregation !== undefined ? { aggregation: aggregation as AggregateKind } : {}),
        ...(emptyPeriods !== undefined ? { emptyPeriods: emptyPeriods as EmptyPeriods } : {}),
        ...(parsedAreaId !== undefined ? { areaId: parsedAreaId } : {}),
      },
      extra,
    )
    if (pauses !== undefined) {
      try {
        for (const raw of pauses as unknown[]) {
          const p = raw as { from?: unknown; to?: unknown }
          if (typeof p?.from !== 'string' || (p.to !== undefined && typeof p.to !== 'string')) {
            throw new DomainError('MALFORMED_JSON', 'bad pause range')
          }
          goal.pause(DayKey.of(p.from), p.to !== undefined ? DayKey.of(p.to) : undefined)
        }
      } catch {
        throw new DomainError('MALFORMED_JSON', 'Goal has malformed pauses')
      }
    }
    if (meta !== undefined) goal.meta = metaFromJSON(meta)
    return goal
  }
```

Note: `goal.pause(from, to)` — `pause`'s second parameter is optional; calling it with an explicit `undefined` second argument is fine for parameters (only *properties* are constrained by `exactOptionalPropertyTypes`).

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/goal.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/goal/goal.ts packages/all-of-oyl/src/goal/goal.test.ts
git commit -m "feat(all-of-oyl): Goal tolerant-reader serialization"
```

---

### Task 5: Budget

Sugar over the goal engine: per-category, per-month spending control with `emptyPeriods: 'met'` (a month with no transactions really is under budget). Money in, Money out — metric totals are major-unit floats, so `Money.fromMajor` makes them exact again.

**Files:**
- Create: `packages/all-of-oyl/src/goal/budget.ts`
- Test: `packages/all-of-oyl/src/goal/budget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/goal/budget.test.ts
import { describe, expect, it } from 'vitest'
import { Budget } from './budget'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { Journal } from '../core/journal'
import { Money } from '../core/money'
import { Transaction } from '../finance/transaction'
import { DomainError } from '../core/domain-error'

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)

function journalWithSpending(): Journal {
  const j = new Journal(NY)
  j.add(new Transaction({ occurredAt: new Date('2026-06-03T18:00:00Z'), amount: Money.usd(6550), category: 'groceries', direction: 'expense' }))
  j.add(new Transaction({ occurredAt: new Date('2026-06-10T18:00:00Z'), amount: Money.usd(8000), category: 'groceries', direction: 'expense' }))
  j.add(new Transaction({ occurredAt: new Date('2026-06-12T18:00:00Z'), amount: Money.usd(-1500), category: 'groceries', direction: 'expense' })) // refund
  j.add(new Transaction({ occurredAt: new Date('2026-06-12T19:00:00Z'), amount: Money.usd(9999), category: 'dining', direction: 'expense' })) // other category
  j.add(new Transaction({ occurredAt: new Date('2026-07-01T18:00:00Z'), amount: Money.usd(5000), category: 'groceries', direction: 'expense' })) // next month
  return j
}

describe('Budget', () => {
  it('constructs with category, limit, and validates', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    expect(budget.category).toBe('groceries')
    expect(budget.limit.equals(Money.usd(40000))).toBe(true)
    expect(Id.of(budget.id)).toBe(budget.id)

    const cases: [() => unknown, string][] = [
      [() => new Budget({ category: 'two words', limit: Money.usd(40000) }), 'INVALID_SLUG'],
      [() => new Budget({ category: 'groceries', limit: Money.usd(0) }), 'INVALID_QUANTITY'],
      [() => new Budget({ category: 'groceries', limit: Money.usd(-100) }), 'INVALID_QUANTITY'],
    ]
    for (const [build, code] of cases) {
      let caught: unknown
      try {
        build()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('spent is net-of-refunds, exact Money, scoped to category and month', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const spent = budget.spent(journalWithSpending(), day('2026-06-15'))
    expect(spent.equals(Money.usd(6550 + 8000 - 1500))).toBe(true) // 130.50, exact
  })

  it('remaining = limit − spent', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const remaining = budget.remaining(journalWithSpending(), day('2026-06-15'))
    expect(remaining.equals(Money.usd(40000 - 13050))).toBe(true)
  })

  it('progress delegates to the goal engine (atMost month, allowance ratio)', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const p = budget.progressOn(journalWithSpending(), day('2026-06-15'))
    expect(p.current).toBeCloseTo(130.5)
    expect(p.target).toBe(400)
    expect(p.met).toBe(true)
    expect(p.ratio).toBeCloseTo(130.5 / 400)
  })

  it('an empty month is vacuous success — no transactions really is under budget', () => {
    const budget = new Budget({ category: 'groceries', limit: Money.usd(40000) })
    const p = budget.progressOn(new Journal(NY), day('2026-06-15'))
    expect(p.empty).toBe(true)
    expect(p.met).toBe(true)
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const budget = new Budget({ id: Id.of('00000000-0000-4000-8000-000000000060'), name: 'Food money', category: 'groceries', limit: Money.usd(40000) })
    const revived = Budget.fromJSON({ ...budget.toJSON(), futureField: 8 })
    expect(revived.name).toBe('Food money')
    expect(revived.limit.equals(Money.usd(40000))).toBe(true)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(8)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000000060', category: 'groceries' }, { id: 'nope', category: 'groceries', limit: Money.usd(1).toJSON() }]) {
      let caught: unknown
      try {
        Budget.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/budget.test.ts`
Expected: FAIL — cannot resolve `./budget`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/goal/budget.ts
import type { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import type { Journal } from '../core/journal'
import { Money } from '../core/money'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { assertSlug } from '../core/slug'
import { Goal, type GoalProgress } from './goal'
import { periodWindowOf } from './period'

/**
 * Per-category, per-month spending control — sugar over the goal engine
 * (atMost, month, emptyPeriods 'met': a month with no transactions really is
 * under budget). No second aggregation path: spent() flows through
 * journal.totalOf and progress through Goal.progressOn. Metric totals are
 * major-unit numbers; Money.fromMajor rounds them back to exact minor units.
 * Needs no finance types: a category slug and Money suffice (import rule).
 */
export class Budget {
  readonly id: Id
  readonly name?: string
  readonly category: string
  readonly limit: Money
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private readonly engine: Goal
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name?: string; category: string; limit: Money }, extra: Record<string, unknown> = {}) {
    if (props.name !== undefined && props.name.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'name must be non-empty when given')
    }
    if (props.limit.minor <= 0) {
      throw new DomainError('INVALID_QUANTITY', 'limit must be positive')
    }
    this.id = props.id ?? Id.create()
    if (props.name !== undefined) this.name = props.name
    this.category = assertSlug(props.category)
    this.limit = props.limit
    this.engine = new Goal({
      metric: `finance.spend.${this.category}`,
      target: this.limit.toNumber(),
      direction: 'atMost',
      period: 'month',
      emptyPeriods: 'met',
    })
    this.extra = extra
  }

  /** Net-of-refunds spending in the month containing `month`, as exact Money. */
  spent(journal: Journal, month: DayKey): Money {
    const total = journal.totalOf(this.engine.metric, periodWindowOf('month', month))
    return Money.fromMajor(total, this.limit.currency, this.limit.exponent)
  }

  remaining(journal: Journal, month: DayKey): Money {
    return this.limit.subtract(this.spent(journal, month))
  }

  progressOn(journal: Journal, day: DayKey): GoalProgress {
    return this.engine.progressOn(journal, day)
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      ...(this.name !== undefined ? { name: this.name } : {}),
      category: this.category,
      limit: this.limit.toJSON(),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Budget {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Budget shape')
    }
    const { id, name, category, limit, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || (name !== undefined && typeof name !== 'string') || typeof category !== 'string' || limit === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Budget shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Budget has a malformed id: "${id}"`)
    }
    const budget = new Budget(
      { id: parsedId, ...(name !== undefined ? { name: name as string } : {}), category, limit: Money.fromJSON(limit) },
      extra,
    )
    if (meta !== undefined) budget.meta = metaFromJSON(meta)
    return budget
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/goal/budget.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/goal/budget.ts packages/all-of-oyl/src/goal/budget.test.ts
git commit -m "feat(all-of-oyl): Budget as sugar over the goal engine"
```

---

### Task 6: Barrel + fixtures + gates

Export the goal module; extend builders and the seed with Avery's goals (including the spec's showcase paused goal) and a budget; verify against the hydrated journal.

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Modify: `packages/all-of-oyl/src/fixtures/fixture-id.ts` (doc comment)
- Modify: `packages/all-of-oyl/src/fixtures/builders.ts`
- Modify: `packages/all-of-oyl/src/fixtures/seed.ts`
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `fixtures.test.ts` (extend imports: `makeBudget, makeGoal` from `./builders`; `Goal` from `../goal/goal`; `Budget` from `../goal/budget`; `Money` from `../core/money`):

```ts
  it('phase 3 builders produce valid objects with overridable fields', () => {
    expect(makeGoal().direction).toBe('atMost')
    expect(makeGoal({ direction: 'atLeast', metric: 'custom.km', target: 10 }).metric).toBe('custom.km')
    expect(makeBudget().category).toBe('groceries')
    expect(makeBudget({ limit: Money.usd(10000) }).limit.equals(Money.usd(10000))).toBe(true)
  })

  it('seed contains goals (incl. the paused showcase) and a budget that revive and answer', () => {
    expect(seed.goals).toHaveLength(4)
    expect(seed.budgets).toHaveLength(1)
    const goals = seed.goals.map((shape) => Goal.fromJSON(shape))
    const budget = Budget.fromJSON(seed.budgets[0])

    // hydrate the journal once
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))

    // the calorie goal is judged on FIXTURE_TODAY
    const calories = goals.find((g) => g.metric === 'nutrition.calories')!
    const cp = calories.progressOn(journal, FIXTURE_TODAY)
    expect(cp.empty).toBe(false)
    expect(cp.met).toBe(true) // 150 cal breakfast, no dinner on day 41

    // the weekly run goal is met for the prior (full) week
    const run = goals.find((g) => g.metric === 'activity.run.minutes')!
    expect(run.progressOn(journal, FIXTURE_TODAY.addDays(-7)).met).toBe(true)

    // the paused weight goal reports paused with met unasserted inside its pause
    const weight = goals.find((g) => g.metric === 'body.weight_kg')!
    const wp = weight.progressOn(journal, FIXTURE_TODAY.addDays(-8))
    expect(wp.paused).toBe(true)
    expect(wp.met).toBeUndefined()
    expect(weight.progressOn(journal, FIXTURE_TODAY).paused).toBe(false)

    // the budget nets the refund and stays under limit for May
    const may = FIXTURE_TODAY.addDays(-7)
    const spent = budget.spent(journal, may)
    expect(spent.currency).toBe('USD')
    expect(spent.minor).toBeGreaterThan(0)
    expect(budget.remaining(journal, may).equals(budget.limit.subtract(spent))).toBe(true)
    expect(budget.progressOn(journal, may).met).toBe(true)

    // serialization idempotence for the new shapes
    for (const g of goals) expect(Goal.fromJSON(g.toJSON()).toJSON()).toEqual(g.toJSON())
    expect(Budget.fromJSON(budget.toJSON()).toJSON()).toEqual(budget.toJSON())
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — `makeGoal` not exported.

- [ ] **Step 3: Extend fixture-id doc, builders, and seed**

In `packages/all-of-oyl/src/fixtures/fixture-id.ts`, update the block-reservation comment line `*   1-9 users · 10-29 life areas · 30-99 catalogs · 100-999 entries` to:

```
 *   1-9 users · 10-29 life areas · 30-49 catalogs · 50-69 goals/budgets ·
 *   70-99 reserved · 100-999 entries
```

Append to `packages/all-of-oyl/src/fixtures/builders.ts` (extend imports: `Goal` from `../goal/goal`, `Budget` from `../goal/budget`, plus the types used below from their modules: `type GoalDirection, type EmptyPeriods` from `../goal/goal`, `type GoalPeriod` from `../goal/period`, `type AggregateKind` from `../core/journal`):

```ts
export function makeGoal(
  overrides: {
    id?: Id
    name?: string
    metric?: string
    target?: number
    direction?: GoalDirection
    period?: GoalPeriod
    aggregation?: AggregateKind
    emptyPeriods?: EmptyPeriods
    areaId?: Id
  } = {},
): Goal {
  return new Goal({
    id: overrides.id ?? fixtureId(50),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    metric: overrides.metric ?? 'nutrition.calories',
    target: overrides.target ?? 2200,
    direction: overrides.direction ?? 'atMost',
    period: overrides.period ?? 'day',
    ...(overrides.aggregation !== undefined ? { aggregation: overrides.aggregation } : {}),
    ...(overrides.emptyPeriods !== undefined ? { emptyPeriods: overrides.emptyPeriods } : {}),
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : {}),
  })
}

export function makeBudget(overrides: { id?: Id; name?: string; category?: string; limit?: Money } = {}): Budget {
  return new Budget({
    id: overrides.id ?? fixtureId(60),
    ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    category: overrides.category ?? 'groceries',
    limit: overrides.limit ?? Money.usd(40000),
  })
}
```

In `packages/all-of-oyl/src/fixtures/seed.ts`: extend the `Seed` type with `goals: Record<string, unknown>[]` and `budgets: Record<string, unknown>[]`; inside `makeSeed()` after the entry generation add (imports: `makeBudget, makeGoal` are in the same file's import from `./builders`):

```ts
  // ── Goals & budget (id block 50-69) ─────────────────────────────────────
  const calorieGoal = makeGoal({ id: fixtureId(50), name: 'Eat lighter', metric: 'nutrition.calories', target: 2200, direction: 'atMost', period: 'day', areaId: fixtureId(10) })
  const runGoal = makeGoal({ id: fixtureId(51), name: 'Run weekly', metric: 'activity.run.minutes', target: 100, direction: 'atLeast', period: 'week', areaId: fixtureId(10) })
  const sleepGoal = makeGoal({ id: fixtureId(52), name: 'Sleep enough', metric: 'sleep.hours', target: 7, direction: 'atLeast', period: 'day' })
  const weightGoal = makeGoal({ id: fixtureId(53), name: 'Trim down', metric: 'body.weight_kg', target: 81, direction: 'atMost', period: 'day', aggregation: 'last' })
  // showcase: a paused goal mid-streak (spec, "Fixtures double as seed data")
  weightGoal.pause(FIXTURE_TODAY.addDays(-10), FIXTURE_TODAY.addDays(-7))
  // limit $1,000: the deterministic May spend is ~$728 net of the refund, so the budget is met
  const groceryBudget = makeBudget({ id: fixtureId(60), name: 'Food money', category: 'groceries', limit: Money.usd(100000) })
```

and extend the cached object with:

```ts
    goals: [calorieGoal.toJSON(), runGoal.toJSON(), sleepGoal.toJSON(), weightGoal.toJSON()],
    budgets: [groceryBudget.toJSON()],
```

(`Money` is already imported in seed.ts.)

- [ ] **Step 4: Extend the barrel**

In `packages/all-of-oyl/src/index.ts`, add (with the other module exports, before the reviver section):

```ts
export { type GoalPeriod, GOAL_PERIODS, periodWindowOf } from './goal/period'
export { Goal, type GoalDirection, type EmptyPeriods, type GoalProgress } from './goal/goal'
export { Budget } from './goal/budget'
```

and add `makeBudget, makeGoal,` to the builders export list (keep it alphabetical).

- [ ] **Step 5: Run the full gates**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.
Confirm `packages/all-of-oyl/package.json` dependencies unchanged.

If the seeded-goal assertions fail (`met` values), do NOT loosen the assertions blindly — recompute from the seed generator's deterministic pattern (day 41 = June 1: breakfast only, sleep 7.0; the prior week May 25–31 has runs on even dayIndexes 34/36/38/40 = 120 min ≥ 100) and report BLOCKED with the actual numbers if they genuinely disagree.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/index.ts packages/all-of-oyl/src/fixtures
git commit -m "feat(all-of-oyl): phase 3 fixtures — goals, paused showcase, budget"
```

---

## Phase 3 exit criteria

- [ ] All gates green (suite, typecheck:src, package tsc); no dependencies added.
- [ ] Import discipline: `goal/` imports `core/` only (budget imports its sibling goal/period — intra-module, allowed). No finance types in `goal/` — Budget needs only a category slug and Money.
- [ ] Every phase-3 spec behavior tested: period windows incl. ISO week 53 and leap months; atLeast/atMost met + ratio clamping (incl. negative current); gauge (`last`) goals; `emptyPeriods` skip vs met; pause-range merging (overlapping, adjacent, open-ended swallow); resume (incl. ILLEGAL_TRANSITION without open pause, INVALID_RANGE before from); paused windows at boundaries; Goal serialization round-trip + malformed shapes (bad unions, inverted wire pauses); Budget netting refunds with exact Money, remaining, vacuous success, delegation to the goal engine.
- [ ] Seed showcases a paused goal; seeded goals/budget answer real questions against the hydrated journal.

## Explicitly NOT in phase 3 (resist the urge)

`streak`/`review`/`correlate` (phase 6 — streak bridging of paused/no-data periods is insights logic, not Goal logic), all of `plan/` and `vault/` (phases 4–5), `share/` (phase 7), any change to `Journal.aggregate` (the two-stage gauge rule is already implemented), and goal milestones (out of scope for v1 entirely).
