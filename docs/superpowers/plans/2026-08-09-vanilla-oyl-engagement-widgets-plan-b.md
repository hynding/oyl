# Vanilla-OYL Engagement Widgets (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill Plan A's widget regions with five engagement widgets (greeting digest, streak ring, today's plan, trend sparklines, goal rings) fed by real stores with clearly-badged sample fallbacks — plus the five carry-over fixes from Plan A's final review.

**Architecture:** Pure derivation functions land in `@oyl/all-of-oyl/src/insights/` (DOM-free, build-gated). The app gets a read-only `WidgetContext` facade, an `<oyl-widgets>` deck that instantiates widgets from a registry with per-widget crash isolation, and five small widget components drawing hand-rolled SVG. `main.js` mounts/unmounts the deck reactively per layout. Spec authority: `docs/superpowers/specs/2026-08-07-vanilla-oyl-layout-system-design.md` (Widgets + Derivation + Sample data sections).

**Tech Stack:** TS strict (all-of-oyl `src/`), vanilla JS + JSDoc (app), Web Components, signals (`track()`), Vitest (node + happy-dom), Playwright.

## Global Constraints

- **all-of-oyl `src/` is DOM-free** — no Web/DOM globals; NodeNext with explicit `.js` import extensions; `noUnusedLocals`/`noUnusedParameters`. Gates per task: `pnpm all-of test`, `pnpm --filter @oyl/all-of-oyl typecheck:src`, `pnpm all-of build` (fails on DOM leakage or bare imports).
- **Zero runtime dependencies** in `apps/vanilla-oyl`; no new packages anywhere. Charts are hand-rolled `<svg>` themed via `currentColor`/`var(--color-accent)`.
- **WidgetContext is read-only by shape:** it exposes only functions returning plain data (and the `tz` string). No store object, signal `set`, repository, or domain aggregate may be reachable through it.
- **Sample data:** a widget whose real derivation is empty renders its fixture from `sample-data.js` with a visible `Sample` badge (`[data-sample-badge]`). Fixtures are plain frozen values on render paths — never written to any store.
- **Deck media-scoping (three-stylesheet rule, deck leg):** every `mode`-keyed rule in `oyl-widgets`' stylesheet sits inside `@media (min-width: 641px)`; below 641px the deck's unkeyed base styles render a compact horizontal scroll row.
- **Deck absent when the layout says `widgets: 'none'`** — `main.js` unmounts it (no hidden-but-computing work).
- **Widget registry order:** greeting-digest, streak-ring, today-plan, trend-sparklines, goal-rings.
- **Streak window:** last 366 days (`today.addDays(-365)..today`); a streak above 365 renders as `365+`. Sparkline window: last 14 days. Digest/goal-ring period: `periodWindowOf('week', today)`.
- **After any all-of-oyl `src/` change, `pnpm vanilla build:lib` MUST run before `pnpm e2e`** (the served app consumes the vendored `dist/`; unit tests resolve TS source and don't need it).
- TDD: failing test first; never weaken a rule to pass. Component tests assert via the component's OWN shadowRoot/props. The repo's effect scheduler batches on microtasks — flush with `await Promise.resolve()` before asserting post-write (established pattern in `oyl-shell.test.js`).
- Test-runner note: pass paths directly (`pnpm vanilla test src/widgets/context.test.js`); `--` filtering does not work.
- Commits: `feat:`/`fix:`/`refactor:` prefix + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer. Commit only the task's files, by explicit path.

## Carry-overs from Plan A's final review (all covered here)

1. Stale `mode` attribute on `widgets:'none'` switch → Task 5.
2. Deck leg of the structural media-scoping test → Task 5.
3. Shared mobile popover-sheet CSS (dedupe the 9-line block + magic clearances) → Task 9.
4. `focusin` outside-closer for toolbar popovers (keyboard popovers can stack on mobile) → Task 9.
5. Dashboard/sidebar empty widget chrome → resolved by the deck existing (Tasks 5–8).

## Key existing interfaces (verified against source — do not re-derive)

- `Journal` (all-of-oyl `core/journal.ts`): `entriesIn(range)`, `entriesOn(day)`, `dayOf(entry): DayKey`, `span()`, `totalOf(MetricKey, range): number`, `totalsByPrefix(prefix, range): ReadonlyMap<MetricKey, number>`.
- `DayKey`: `.value` (`YYYY-MM-DD`), `DayKey.of(str)`, `DayKey.from(date, tz)`, `.addDays(n)`, `.compare`, `.equals`. `DayRange`: `DayRange.of(start, end)`, `.contains(day)`, iterable over days, `.lengthInDays()`.
- `Review` (`insights/review.ts`): `goals: readonly GoalReview[]` where `GoalReview = { goalId, name?, progress: GoalProgress, streak: number }` and `GoalProgress = { current, target, ratio, met?, paused, empty }` (`ratio` clamped 0..1). `review.totals/deltas` are period totals — NOT daily series.
- App stores (vanilla): `dataState.journal.peek(): Journal` (reactive — touches revision), `dataState.planner.agendaFor(day): readonly Plan[]` (excludes canceled; `Plan.status ∈ 'open'|'done'|'canceled'`; `Task`/`Appointment` carry `.title`), `dataState.reviewOn(range): Review` (reactive), `profileStore.profile: Signal<User|null>` (`User.displayName`), `now()` from `src/storage/clock.js`.
- Layout seam (Plan A): `byId(id).widgets ∈ 'rail'|'band'|'none'`; the shell reflects `mode` onto the slotted `[slot="widgets"]` element and re-applies on `slotchange`; `oyl-shell.js` `_reflect()` currently NEVER removes `mode` (the Task 5 fix).
- Metric keys: spending = `totalsByPrefix('finance.spend', …)` summed; calories = `totalOf(MetricKey.of('nutrition.calories'), …)`; active minutes = `totalsByPrefix('activity', …)` filtered to keys ending `.minutes` (mirrors `review.ts:38-46`).

---

### Task 1: `streakOf` + `activeDaysIn` (all-of-oyl)

**Files:**
- Create: `packages/all-of-oyl/src/insights/day-streak.ts`
- Create: `packages/all-of-oyl/src/insights/day-streak.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (add export line near the other insights exports, `index.ts:121-124`)

**Interfaces:**
- Consumes: `DayKey` (`../core/day-key.js`), `DayRange` + `Journal` types.
- Produces (Tasks 4/6/8 rely on these exact signatures):
  - `streakOf(activeDays: ReadonlySet<string>, today: DayKey): number` — consecutive active days ending at today; an inactive today does NOT break yesterday's streak (count starts from yesterday then).
  - `activeDaysIn(journal: Journal, range: DayRange): ReadonlySet<string>` — the set of `DayKey.value` strings with ≥1 entry.

- [ ] **Step 1: Write the failing test**

`packages/all-of-oyl/src/insights/day-streak.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Journal } from '../core/journal.js'
import { activeDaysIn, streakOf } from './day-streak.js'

const day = (v: string) => DayKey.of(v)

describe('streakOf', () => {
  it('is 0 with no active days', () => {
    expect(streakOf(new Set(), day('2026-08-09'))).toBe(0)
  })

  it('counts a run ending today', () => {
    const days = new Set(['2026-08-07', '2026-08-08', '2026-08-09'])
    expect(streakOf(days, day('2026-08-09'))).toBe(3)
  })

  it('an inactive today does not break yesterday\'s streak', () => {
    const days = new Set(['2026-08-07', '2026-08-08'])
    expect(streakOf(days, day('2026-08-09'))).toBe(2)
  })

  it('stops at a gap', () => {
    const days = new Set(['2026-08-09', '2026-08-08', '2026-08-06', '2026-08-05'])
    expect(streakOf(days, day('2026-08-09'))).toBe(2)
  })

  it('a gap before yesterday with an inactive today is 0', () => {
    const days = new Set(['2026-08-06'])
    expect(streakOf(days, day('2026-08-09'))).toBe(0)
  })

  it('crosses month boundaries', () => {
    const days = new Set(['2026-07-30', '2026-07-31', '2026-08-01'])
    expect(streakOf(days, day('2026-08-01'))).toBe(3)
  })
})

describe('activeDaysIn', () => {
  it('collects distinct day keys of entries in range, tz-bucketed by the journal', () => {
    // Build entries with the same constructors insights/review.test.ts uses —
    // any Entry subclass works; only occurredAt matters here. Two entries on
    // one day must yield ONE set member.
    const journal = new Journal('UTC')
    // <mirror review.test.ts's entry fixture idiom to add entries occurring at
    //  2026-08-08T10:00Z, 2026-08-08T15:00Z, and 2026-08-09T01:00Z>
    // …journal.add(...) × 3
    const range = DayRange.of(day('2026-08-01'), day('2026-08-09'))
    const active = activeDaysIn(journal, range)
    expect(active).toEqual(new Set(['2026-08-08', '2026-08-09']))
  })

  it('excludes entries outside the range', () => {
    const journal = new Journal('UTC')
    // …one entry occurring at 2026-07-01T12:00Z
    const range = DayRange.of(day('2026-08-01'), day('2026-08-09'))
    expect(activeDaysIn(journal, range).size).toBe(0)
  })
})
```

Fixture note (NOT a placeholder — the assertions above are normative): build the entries with whatever `Entry` subclass `insights/review.test.ts` already constructs (e.g. its note/transaction helpers). Only `occurredAt` matters to this module.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm all-of test src/insights/day-streak.test.ts` (from repo root; if path filtering doesn't apply, `pnpm all-of test` and look for the file)
Expected: FAIL — module `./day-streak.js` not found.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/insights/day-streak.ts`:

```ts
// packages/all-of-oyl/src/insights/day-streak.ts
import type { DayKey } from '../core/day-key.js'
import type { DayRange } from '../core/day-range.js'
import type { Journal } from '../core/journal.js'

/**
 * Consecutive ACTIVE DAYS ending at `today` — the app-wide "did anything"
 * streak. Distinct from the goal-period `streak()` in streak.ts (which judges
 * goal attainment per period); the two live side by side on purpose.
 *
 * Today counts if active; an inactive today does not break yesterday's streak
 * (the day isn't over yet).
 */
export function streakOf(activeDays: ReadonlySet<string>, today: DayKey): number {
  let count = 0
  let cursor = activeDays.has(today.value) ? today : today.addDays(-1)
  while (activeDays.has(cursor.value)) {
    count += 1
    cursor = cursor.addDays(-1)
  }
  return count
}

/** Day keys (values) with at least one journal entry in `range`, tz-bucketed by the journal. */
export function activeDaysIn(journal: Journal, range: DayRange): ReadonlySet<string> {
  const days = new Set<string>()
  for (const entry of journal.entriesIn(range)) days.add(journal.dayOf(entry).value)
  return days
}
```

Add to `packages/all-of-oyl/src/index.ts` (next to the existing insights exports around line 121):

```ts
export { streakOf, activeDaysIn } from './insights/day-streak.js'
```

- [ ] **Step 4: Run tests + gates**

Run: `pnpm all-of test` → all pass. Then `pnpm --filter @oyl/all-of-oyl typecheck:src` and `pnpm all-of build` → both clean.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/day-streak.ts packages/all-of-oyl/src/insights/day-streak.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: day-based activity streak derivation (streakOf, activeDaysIn)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `dailySeries` + metric day-selectors (all-of-oyl)

**Files:**
- Create: `packages/all-of-oyl/src/insights/daily-series.ts`
- Create: `packages/all-of-oyl/src/insights/daily-series.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

**Interfaces:**
- Produces (Task 4 relies on these exact signatures):
  - `dailySeries(journal: Journal, range: DayRange, valueOn: (journal: Journal, day: DayKey) => number): readonly number[]` — one number per day in range, in order.
  - `spendingOn(journal, day): number` — sum of `totalsByPrefix('finance.spend', dayRange)` values.
  - `caloriesOn(journal, day): number` — `totalOf(MetricKey.of('nutrition.calories'), dayRange)`.
  - `activeMinutesOn(journal, day): number` — sum of `totalsByPrefix('activity', dayRange)` values whose key ends `.minutes`.
- **Declared deviation from the spec's sketch** (`dailySeries(entries, range, tz)`): the Journal already owns tz bucketing and the metric aggregation path — passing it beats re-implementing both. Record this in the commit body.

- [ ] **Step 1: Write the failing test**

`packages/all-of-oyl/src/insights/daily-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import { Journal } from '../core/journal.js'
import { activeMinutesOn, caloriesOn, dailySeries, spendingOn } from './daily-series.js'

const day = (v: string) => DayKey.of(v)

describe('dailySeries', () => {
  it('yields one value per day in range order, zero-filled', () => {
    const journal = new Journal('UTC')
    const range = DayRange.of(day('2026-08-05'), day('2026-08-07'))
    const series = dailySeries(journal, range, () => 0)
    expect(series).toEqual([0, 0, 0])
  })

  it('feeds each day to the selector in order', () => {
    const journal = new Journal('UTC')
    const range = DayRange.of(day('2026-08-05'), day('2026-08-07'))
    const seen: string[] = []
    dailySeries(journal, range, (_j, d) => {
      seen.push(d.value)
      return seen.length
    })
    expect(seen).toEqual(['2026-08-05', '2026-08-06', '2026-08-07'])
  })
})

describe('metric day-selectors', () => {
  // Build the journal with the SAME fixture idioms insights/review.test.ts
  // uses (its transaction/consumption/activity-session helpers) — the
  // assertions below are normative, the construction mirrors existing tests:
  //  - a spend transaction on 2026-08-06 worth 25 (in the unit review.test.ts
  //    asserts spending totals in),
  //  - a consumption on 2026-08-06 carrying nutrition.calories 300,
  //  - an activity session on 2026-08-06 carrying activity.<slug>.minutes 45
  //    (and a .count metric that must NOT leak into minutes).
  it('spendingOn / caloriesOn / activeMinutesOn bucket per day and ignore other days', () => {
    const journal = new Journal('UTC')
    // …add the three fixtures above…
    expect(spendingOn(journal, day('2026-08-06'))).toBeGreaterThan(0)
    expect(spendingOn(journal, day('2026-08-05'))).toBe(0)
    expect(caloriesOn(journal, day('2026-08-06'))).toBe(300)
    expect(caloriesOn(journal, day('2026-08-05'))).toBe(0)
    expect(activeMinutesOn(journal, day('2026-08-06'))).toBe(45)
    expect(activeMinutesOn(journal, day('2026-08-05'))).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm all-of test` → the new file fails with module-not-found.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/insights/daily-series.ts`:

```ts
// packages/all-of-oyl/src/insights/daily-series.ts
import type { DayKey } from '../core/day-key.js'
import { DayRange } from '../core/day-range.js'
import type { Journal } from '../core/journal.js'
import { MetricKey } from '../core/metric-key.js'

/**
 * Per-day numeric buckets for sparklines: one value per day of `range`, in
 * order. The selector receives (journal, day); pair with the day-selectors
 * below. Journal owns tz bucketing — that's why this takes a Journal, not a
 * raw entry list (deliberate revision of the spec's earlier sketch).
 */
export function dailySeries(
  journal: Journal,
  range: DayRange,
  valueOn: (journal: Journal, day: DayKey) => number,
): readonly number[] {
  const out: number[] = []
  for (const day of range) out.push(valueOn(journal, day))
  return out
}

const dayRange = (day: DayKey) => DayRange.of(day, day)

/** Total spend recorded on `day` (all finance.spend.* categories). */
export function spendingOn(journal: Journal, day: DayKey): number {
  let total = 0
  for (const value of journal.totalsByPrefix('finance.spend', dayRange(day)).values()) total += value
  return total
}

/** Calories recorded on `day`. */
export function caloriesOn(journal: Journal, day: DayKey): number {
  return journal.totalOf(MetricKey.of('nutrition.calories'), dayRange(day))
}

/** Active minutes recorded on `day` (activity.*.minutes only — counts excluded). */
export function activeMinutesOn(journal: Journal, day: DayKey): number {
  let total = 0
  for (const [key, value] of journal.totalsByPrefix('activity', dayRange(day))) {
    if (key.endsWith('.minutes')) total += value
  }
  return total
}
```

Add to `index.ts`:

```ts
export { dailySeries, spendingOn, caloriesOn, activeMinutesOn } from './insights/daily-series.js'
```

- [ ] **Step 4: Run tests + gates**

`pnpm all-of test`, `pnpm --filter @oyl/all-of-oyl typecheck:src`, `pnpm all-of build` — all green.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/daily-series.ts packages/all-of-oyl/src/insights/daily-series.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: per-day metric series derivation for sparklines" -m "dailySeries takes the Journal (owns tz bucketing + aggregation) instead of the spec sketch's raw entries — deliberate revision." -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `digestOf` (all-of-oyl)

**Files:**
- Create: `packages/all-of-oyl/src/insights/digest.ts`
- Create: `packages/all-of-oyl/src/insights/digest.test.ts`
- Modify: `packages/all-of-oyl/src/index.ts`

**Interfaces:**
- Produces (Tasks 4/8 rely on this exactly):
  - `type Digest = { plansDone: number, plansTotal: number, goalsMet: number, goalsTotal: number, streak: number }`
  - `digestOf(review: Pick<Review, 'goals'>, todayPlan: readonly { status: string }[], dayStreak: number): Digest` — `streak` is the passed-through `dayStreak` (the caller supplies the `streakOf` result; NOT `review.goals[].streak`, which is the per-goal goal-period streak).

- [ ] **Step 1: Write the failing test**

`packages/all-of-oyl/src/insights/digest.test.ts` (pure data — fully concrete):

```ts
import { describe, expect, it } from 'vitest'
import { digestOf } from './digest.js'

const goal = (met: boolean | undefined) => ({
  goalId: 'g',
  progress: { current: 0, target: 1, ratio: 0, ...(met === undefined ? {} : { met }), paused: false, empty: false },
  streak: 99, // per-goal period streak — must NOT leak into Digest.streak
})

describe('digestOf', () => {
  it('counts done/total plans and met/total goals, passes the day streak through', () => {
    const review = { goals: [goal(true), goal(false), goal(undefined)] }
    const todayPlan = [{ status: 'done' }, { status: 'done' }, { status: 'open' }]
    expect(digestOf(review, todayPlan, 12)).toEqual({
      plansDone: 2,
      plansTotal: 3,
      goalsMet: 1,
      goalsTotal: 3,
      streak: 12,
    })
  })

  it('handles the empty day', () => {
    expect(digestOf({ goals: [] }, [], 0)).toEqual({
      plansDone: 0, plansTotal: 0, goalsMet: 0, goalsTotal: 0, streak: 0,
    })
  })

  it('never reads the per-goal streak', () => {
    const review = { goals: [goal(true)] }
    expect(digestOf(review, [], 3).streak).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm all-of test` → module-not-found for `./digest.js`.

- [ ] **Step 3: Implement**

`packages/all-of-oyl/src/insights/digest.ts`:

```ts
// packages/all-of-oyl/src/insights/digest.ts
import type { Review } from './review.js'

export type Digest = {
  plansDone: number
  plansTotal: number
  goalsMet: number
  goalsTotal: number
  streak: number
}

/**
 * The greeting widget's summary values. `todayPlan` is an agenda list
 * (structurally typed — anything with `status`); `dayStreak` is the streakOf
 * result passed through verbatim (NOT the per-goal goal-period streaks that
 * ride inside review.goals).
 */
export function digestOf(
  review: Pick<Review, 'goals'>,
  todayPlan: readonly { status: string }[],
  dayStreak: number,
): Digest {
  return {
    plansDone: todayPlan.filter((p) => p.status === 'done').length,
    plansTotal: todayPlan.length,
    goalsMet: review.goals.filter((g) => g.progress.met === true).length,
    goalsTotal: review.goals.length,
    streak: dayStreak,
  }
}
```

Add to `index.ts`:

```ts
export { digestOf, type Digest } from './insights/digest.js'
```

- [ ] **Step 4: Run tests + gates**

`pnpm all-of test`, `pnpm --filter @oyl/all-of-oyl typecheck:src`, `pnpm all-of build` — all green.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/insights/digest.ts packages/all-of-oyl/src/insights/digest.test.ts packages/all-of-oyl/src/index.ts
git commit -m "feat: digestOf summary derivation for the greeting widget" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Widget infrastructure — read-only context, sample data, SVG helpers (vanilla)

**Files:**
- Create: `apps/vanilla-oyl/src/widgets/context.js` (+ `context.test.js`)
- Create: `apps/vanilla-oyl/src/widgets/sample-data.js` (+ `sample-data.test.js`)
- Create: `apps/vanilla-oyl/src/widgets/svg.js` (+ `svg.test.js`)

**Interfaces:**
- Consumes: Tasks 1–2 exports (`streakOf` not needed here; `activeDaysIn`, `dailySeries`, `spendingOn`, `caloriesOn`, `activeMinutesOn` from `@oyl/all-of-oyl`); `DayKey` from `@oyl/all-of-oyl`; app stores per "Key existing interfaces".
- Produces (Tasks 5–8 rely on these exactly):
  - `createWidgetContext({ journal, planner, reviewOn, profile, tz, now }) => WidgetContext` — frozen object with EXACTLY these members:
    - `tz: string`
    - `today(): DayKey` — `DayKey.from(now(), tz)`
    - `hour(): number` — local hour from `now()` (greeting bucketing)
    - `profileName(): string | undefined`
    - `activeDays(range): ReadonlySet<string>` — `activeDaysIn(journal.peek(), range)` (reactive: `peek()` touches the revision)
    - `series(range, kind: 'spending'|'calories'|'activeMinutes'): readonly number[]`
    - `plansOn(day): readonly { status: string, label: string }[]` — mapped from `planner.agendaFor(day)` (`label` = the plan's `title` when present, else its `kind`)
    - `review(range): Review` — pass-through to `reviewOn`
  - `SAMPLE` — frozen fixtures: `{ streak: 12, todayPlan: { done: 3, total: 5, next: 'Run 5k' }, series: { spending: number[14], calories: number[14], activeMinutes: number[14] }, goals: [{ name, ratio, streak }×3], digest: { plansDone: 3, plansTotal: 5, goalsMet: 1, goalsTotal: 3, streak: 12 } }`
  - `withSample(isEmpty: boolean, real: T, fixture: T) => { value: T, sample: boolean }`
  - `sparklineSvg(values, { width = 120, height = 28 } = {}): SVGSVGElement` — polyline, `stroke: currentColor`, `fill: none`, `aria-hidden="true"`; flat/empty series draws a midline (no NaN).
  - `ringSvg(ratio, { size = 48, stroke = 5 } = {}): SVGSVGElement` — track circle (low opacity) + arc via `stroke-dasharray`, ratio clamped to [0, 1], `aria-hidden="true"`.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/widgets/context.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { DayKey, DayRange, Journal, Task } from '@oyl/all-of-oyl'
import { createWidgetContext } from './context.js'
import { signal } from '../lib/reactive/signal.js'

function makeCtx() {
  const journal = new Journal('UTC')
  const revision = signal(0)
  const journalStore = { peek: () => { revision.get(); return journal } }
  const plans = [new Task({ title: 'Run 5k', due: DayKey.of('2026-08-09') })]
  const planner = { agendaFor: () => plans }
  const profile = signal(/** @type {any} */ ({ displayName: 'Steve' }))
  const reviewOn = (/** @type {any} */ range) => ({ period: range, goals: [] })
  const ctx = createWidgetContext({
    journal: journalStore,
    planner,
    reviewOn: /** @type {any} */ (reviewOn),
    profile,
    tz: 'UTC',
    now: () => new Date('2026-08-09T14:30:00Z'),
  })
  return { ctx, journal }
}

describe('createWidgetContext', () => {
  it('exposes exactly the read-only surface, frozen', () => {
    const { ctx } = makeCtx()
    expect(Object.isFrozen(ctx)).toBe(true)
    expect(Object.keys(ctx).sort()).toEqual(
      ['activeDays', 'hour', 'plansOn', 'profileName', 'review', 'series', 'today', 'tz'].sort(),
    )
    for (const [key, member] of Object.entries(ctx)) {
      if (key === 'tz') expect(typeof member).toBe('string')
      else expect(typeof member).toBe('function')
    }
  })

  it('today() buckets now() in the context tz; hour() gives the greeting hour', () => {
    const { ctx } = makeCtx()
    expect(ctx.today().value).toBe('2026-08-09')
    expect(typeof ctx.hour()).toBe('number')
  })

  it('profileName reads the signal; null profile gives undefined', () => {
    const { ctx } = makeCtx()
    expect(ctx.profileName()).toBe('Steve')
  })

  it('plansOn maps agenda plans to plain {status,label} data — no domain objects leak', () => {
    const { ctx } = makeCtx()
    const items = ctx.plansOn(DayKey.of('2026-08-09'))
    expect(items).toEqual([{ status: 'open', label: 'Run 5k' }])
    // plain data: no complete()/cancel() reachable
    expect(/** @type {any} */ (items[0]).complete).toBeUndefined()
  })

  it('activeDays and series consult the live journal', () => {
    const { ctx } = makeCtx()
    const range = DayRange.of(DayKey.of('2026-08-01'), DayKey.of('2026-08-09'))
    expect(ctx.activeDays(range).size).toBe(0)
    expect(ctx.series(range, 'spending')).toHaveLength(9)
    expect(ctx.series(range, 'spending').every((v) => v === 0)).toBe(true)
  })
})
```

`apps/vanilla-oyl/src/widgets/sample-data.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { SAMPLE, withSample } from './sample-data.js'

describe('sample data', () => {
  it('fixtures are frozen plain values with the pinned shapes', () => {
    expect(Object.isFrozen(SAMPLE)).toBe(true)
    expect(SAMPLE.streak).toBe(12)
    expect(SAMPLE.todayPlan).toEqual({ done: 3, total: 5, next: 'Run 5k' })
    for (const key of ['spending', 'calories', 'activeMinutes']) {
      expect(SAMPLE.series[key]).toHaveLength(14)
    }
    expect(SAMPLE.goals).toHaveLength(3)
    expect(SAMPLE.digest).toEqual({ plansDone: 3, plansTotal: 5, goalsMet: 1, goalsTotal: 3, streak: 12 })
  })

  it('withSample picks fixture only when empty and reports sample-ness', () => {
    expect(withSample(false, 7, 12)).toEqual({ value: 7, sample: false })
    expect(withSample(true, 0, 12)).toEqual({ value: 12, sample: true })
  })
})
```

`apps/vanilla-oyl/src/widgets/svg.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { ringSvg, sparklineSvg } from './svg.js'

describe('sparklineSvg', () => {
  it('draws one point per value, hidden from a11y tree', () => {
    const svg = sparklineSvg([1, 3, 2])
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    const points = svg.querySelector('polyline')?.getAttribute('points') ?? ''
    expect(points.trim().split(/\s+/)).toHaveLength(3)
    expect(points).not.toContain('NaN')
  })

  it('a flat or empty series never yields NaN', () => {
    expect(sparklineSvg([5, 5, 5]).querySelector('polyline')?.getAttribute('points')).not.toContain('NaN')
    expect(sparklineSvg([]).querySelector('polyline')?.getAttribute('points') ?? '').not.toContain('NaN')
  })
})

describe('ringSvg', () => {
  it('sets the arc dasharray from the clamped ratio', () => {
    const svg = ringSvg(0.5, { size: 48, stroke: 5 })
    const arc = /** @type {SVGCircleElement} */ (svg.querySelectorAll('circle')[1])
    const r = (48 - 5) / 2
    const c = 2 * Math.PI * r
    const [dash] = (arc.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)
    expect(dash).toBeCloseTo(c * 0.5, 1)
  })

  it('clamps ratios outside [0,1]', () => {
    const over = ringSvg(3).querySelectorAll('circle')[1]
    const under = ringSvg(-1).querySelectorAll('circle')[1]
    const dashOf = (/** @type {Element|undefined} */ el) => Number((el?.getAttribute('stroke-dasharray') ?? '0').split(' ')[0])
    expect(dashOf(over)).toBeGreaterThan(0)
    expect(dashOf(under)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test src/widgets/context.test.js src/widgets/sample-data.test.js src/widgets/svg.test.js`
Expected: all three FAIL with module-not-found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/widgets/context.js`:

```js
import { DayKey, activeDaysIn, dailySeries, spendingOn, caloriesOn, activeMinutesOn } from '@oyl/all-of-oyl'

/** @typedef {import('@oyl/all-of-oyl').DayRange} DayRange */
/** @typedef {import('@oyl/all-of-oyl').Review} Review */
/** @typedef {'spending' | 'calories' | 'activeMinutes'} SeriesKind */
/**
 * @typedef {{
 *   tz: string,
 *   today(): DayKey,
 *   hour(): number,
 *   profileName(): string | undefined,
 *   activeDays(range: DayRange): ReadonlySet<string>,
 *   series(range: DayRange, kind: SeriesKind): readonly number[],
 *   plansOn(day: DayKey): readonly { status: string, label: string }[],
 *   review(range: DayRange): Review,
 * }} WidgetContext
 */

const SELECTORS = Object.freeze({
  spending: spendingOn,
  calories: caloriesOn,
  activeMinutes: activeMinutesOn,
})

/**
 * The read-only facade every widget receives — READ-ONLY BY SHAPE, not
 * convention: only functions returning plain data (plus the tz string) are
 * exposed. No store, signal setter, repository, or domain aggregate is
 * reachable through it, so no widget can enqueue outbox writes or mutate
 * shared state. Reactivity comes for free: journal.peek()/agendaFor/reviewOn
 * touch their revision signals, so calls inside a widget's track() re-run.
 * @param {{
 *   journal: { peek(): import('@oyl/all-of-oyl').Journal },
 *   planner: { agendaFor(day: DayKey): readonly import('@oyl/all-of-oyl').Plan[] },
 *   reviewOn: (range: DayRange) => Review,
 *   profile: { get(): import('@oyl/all-of-oyl').User | null },
 *   tz: string,
 *   now: () => Date,
 * }} deps
 * @returns {WidgetContext}
 */
export function createWidgetContext({ journal, planner, reviewOn, profile, tz, now }) {
  return Object.freeze({
    tz,
    today: () => DayKey.from(now(), tz),
    hour: () => now().getHours(),
    profileName: () => profile.get()?.displayName,
    activeDays: (range) => activeDaysIn(journal.peek(), range),
    series: (range, kind) => dailySeries(journal.peek(), range, SELECTORS[kind]),
    plansOn: (day) =>
      planner.agendaFor(day).map((p) => ({
        status: p.status,
        label: /** @type {{ title?: string }} */ (p).title ?? p.kind,
      })),
    review: (range) => reviewOn(range),
  })
}
```

`apps/vanilla-oyl/src/widgets/sample-data.js`:

```js
/**
 * Aspirational sample fixtures for a fresh account — rendered with a visible
 * `Sample` badge and NEVER written to any store (plain frozen values on
 * render paths only).
 */
export const SAMPLE = Object.freeze({
  streak: 12,
  todayPlan: Object.freeze({ done: 3, total: 5, next: 'Run 5k' }),
  series: Object.freeze({
    spending: Object.freeze([12, 0, 34, 18, 0, 52, 7, 23, 11, 0, 41, 16, 29, 8]),
    calories: Object.freeze([1850, 2100, 1720, 1980, 2240, 1600, 1890, 2050, 1770, 1930, 2110, 1680, 1820, 1950]),
    activeMinutes: Object.freeze([30, 0, 45, 60, 20, 0, 75, 40, 15, 55, 0, 35, 50, 25]),
  }),
  goals: Object.freeze([
    Object.freeze({ name: 'Run', ratio: 0.8, streak: 4 }),
    Object.freeze({ name: 'Read', ratio: 0.5, streak: 2 }),
    Object.freeze({ name: 'Save', ratio: 0.25, streak: 0 }),
  ]),
  digest: Object.freeze({ plansDone: 3, plansTotal: 5, goalsMet: 1, goalsTotal: 3, streak: 12 }),
})

/**
 * The one shared empty→fixture switch (spec: "the empty-check + swap lives in
 * one shared helper, not repeated per widget"). Each widget computes its own
 * emptiness predicate and hands it in.
 * @template T
 * @param {boolean} isEmpty @param {T} real @param {T} fixture
 * @returns {{ value: T, sample: boolean }}
 */
export function withSample(isEmpty, real, fixture) {
  return isEmpty ? { value: fixture, sample: true } : { value: real, sample: false }
}
```

`apps/vanilla-oyl/src/widgets/svg.js`:

```js
const NS = 'http://www.w3.org/2000/svg'

/** @param {string} tag @param {Record<string, string>} attrs */
function el(tag, attrs) {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

/**
 * Tiny trend line. Decorative (aria-hidden) — the widget's text carries the
 * values. Themed via currentColor. Flat/empty series draw a midline.
 * @param {readonly number[]} values @param {{ width?: number, height?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function sparklineSvg(values, { width = 120, height = 28 } = {}) {
  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spanY = max - min
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX
      const y = spanY === 0 ? height / 2 : pad + (height - pad * 2) * (1 - (v - min) / spanY)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const svg = /** @type {SVGSVGElement} */ (
    el('svg', { width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' })
  )
  svg.append(el('polyline', { points, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }))
  return svg
}

/**
 * Progress ring. Decorative (aria-hidden) — the widget's text carries the
 * value. Track at low opacity, arc via stroke-dasharray, ratio clamped [0,1].
 * @param {number} ratio @param {{ size?: number, stroke?: number }} [opts]
 * @returns {SVGSVGElement}
 */
export function ringSvg(ratio, { size = 48, stroke = 5 } = {}) {
  const clamped = Math.max(0, Math.min(1, ratio))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const center = String(size / 2)
  const svg = /** @type {SVGSVGElement} */ (
    el('svg', { width: String(size), height: String(size), viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' })
  )
  const base = { cx: center, cy: center, r: String(r), fill: 'none', 'stroke-width': String(stroke) }
  svg.append(el('circle', { ...base, stroke: 'currentColor', opacity: '0.15' }))
  svg.append(
    el('circle', {
      ...base,
      stroke: 'var(--color-accent)',
      'stroke-dasharray': `${(c * clamped).toFixed(2)} ${c.toFixed(2)}`,
      'stroke-linecap': 'round',
      transform: `rotate(-90 ${center} ${center})`,
    }),
  )
  return svg
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test src/widgets/context.test.js src/widgets/sample-data.test.js src/widgets/svg.test.js` → PASS. Then full `pnpm vanilla test` + `pnpm vanilla typecheck` → green. (If `Task` isn't importable in the vanilla test env, mirror how `oyl-planner.test.js` constructs plans.)

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/
git commit -m "feat: widget infrastructure — read-only context facade, sample fixtures, svg chart helpers" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `<oyl-widgets>` deck + registry + shell stale-mode fix

**Files:**
- Create: `apps/vanilla-oyl/src/widgets/widget-catalog.js`
- Create: `apps/vanilla-oyl/src/widgets/oyl-widgets.js` (+ `oyl-widgets.test.js`)
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.js` (`_reflect()` — remove stale `mode`)
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.test.js` (one new case)

**Interfaces:**
- Consumes: `WidgetContext` (Task 4). Widget elements from Tasks 6–8 register themselves in the catalog as they land — THIS task ships the catalog with an EMPTY `WIDGETS` list plus the registry contract, so the deck is fully testable with stub entries.
- Produces:
  - `widget-catalog.js`: `WIDGETS: readonly { id: string, label: string, create(context: WidgetContext): HTMLElement }[]` (deck order = registry order; final order after Tasks 6–8: greeting-digest, streak-ring, today-plan, trend-sparklines, goal-rings).
  - `<oyl-widgets>` via `defineWidgets()`; instance prop `context: WidgetContext` (assigned before append). Renders one `.card` per registry entry; a throwing `create()` yields a muted `.card.failed` "unavailable" card + `console.error` (isolation). Deck base styles (unkeyed) = compact horizontal scroll row — that IS the mobile presentation; `mode`-keyed rules (`rail` = vertical stack, `band` = row) live ONLY inside `@media (min-width: 641px)`.
  - Shell `_reflect()` fix: when the active layout's `widgets === 'none'`, `removeAttribute('mode')` on the slotted deck.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/widgets/oyl-widgets.test.js`:

```js
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { defineWidgets, OylWidgets } from './oyl-widgets.js'

beforeAll(() => defineWidgets())

/** @param {readonly { id: string, label: string, create(ctx: any): HTMLElement }[]} widgets */
function mount(widgets) {
  const deck = /** @type {OylWidgets} */ (document.createElement('oyl-widgets'))
  deck.context = /** @type {any} */ ({ tz: 'UTC' })
  deck.widgets = widgets
  document.body.append(deck)
  return /** @type {ShadowRoot} */ (deck.shadowRoot)
}

const stub = (/** @type {string} */ id) => ({
  id,
  label: id,
  create: () => Object.assign(document.createElement('div'), { textContent: id }),
})

describe('oyl-widgets', () => {
  it('renders one card per registry entry, in registry order', () => {
    const root = mount([stub('a'), stub('b')])
    const cards = [...root.querySelectorAll('.card')]
    expect(cards).toHaveLength(2)
    expect(cards.map((c) => c.textContent)).toEqual(['a', 'b'])
  })

  it('isolates a throwing widget as a muted unavailable card and logs the error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = { id: 'boom', label: 'Boom', create: () => { throw new Error('nope') } }
    const root = mount([stub('a'), boom, stub('b')])
    const cards = [...root.querySelectorAll('.card')]
    expect(cards).toHaveLength(3)
    expect(cards[1]?.classList.contains('failed')).toBe(true)
    expect(cards[1]?.textContent).toContain('unavailable')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('scopes every mode-keyed rule to desktop widths (deck leg of the structural test)', () => {
    const offenders = []
    for (const sheetObj of /** @type {CSSStyleSheet[]} */ (OylWidgets.styles)) {
      for (const rule of sheetObj.cssRules) {
        const sel = /** @type {CSSStyleRule} */ (rule).selectorText ?? ''
        if (sel.includes('[mode')) offenders.push(rule.cssText)
        if ('conditionText' in rule && /** @type {CSSMediaRule} */ (rule).conditionText !== '(min-width: 641px)') {
          offenders.push(rule.cssText)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('has rail and band rules inside the desktop media block', () => {
    const desktop = /** @type {CSSStyleSheet[]} */ (OylWidgets.styles)
      .flatMap((s) => [...s.cssRules])
      .filter((r) => 'conditionText' in r && /** @type {CSSMediaRule} */ (r).conditionText === '(min-width: 641px)')
      .flatMap((r) => [.../** @type {CSSMediaRule} */ (r).cssRules].map((x) => x.cssText))
    expect(desktop.some((t) => t.includes('[mode="rail"]'))).toBe(true)
    expect(desktop.some((t) => t.includes('[mode="band"]'))).toBe(true)
  })
})
```

Add to `apps/vanilla-oyl/src/components/oyl-shell.test.js` (uses the file's existing `mount` helper and flush idiom):

```js
it('removes the stale mode attribute when switching to a widgets-none layout', async () => {
  const shell = mount('dashboard')
  const deck = document.createElement('div')
  deck.slot = 'widgets'
  shell.append(deck)
  await Promise.resolve()
  expect(deck.getAttribute('mode')).toBe('band')
  const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
  sig.set('focus')
  await Promise.resolve()
  expect(deck.hasAttribute('mode')).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test src/widgets/oyl-widgets.test.js src/components/oyl-shell.test.js`
Expected: deck file fails module-not-found; the new shell case fails (`mode` stays `"band"`).

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/widgets/widget-catalog.js`:

```js
/**
 * The widget registry: deck order = this order. Each entry's create(context)
 * returns a ready element (the deck wraps it in a card and isolates crashes).
 * Widgets register here as they land — final v1 order: greeting-digest,
 * streak-ring, today-plan, trend-sparklines, goal-rings.
 * @typedef {{ id: string, label: string, create(context: import('./context.js').WidgetContext): HTMLElement }} WidgetEntry
 * @type {readonly WidgetEntry[]}
 */
export const WIDGETS = Object.freeze([])
```

(Tasks 6–8 replace the frozen empty list with the growing literal — each adds its import + entries.)

`apps/vanilla-oyl/src/widgets/oyl-widgets.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { WIDGETS } from './widget-catalog.js'

/** @typedef {import('./context.js').WidgetContext} WidgetContext */

const styles = sheet(`
  :host { display: block; }
  /* Unkeyed base = the MOBILE presentation (compact horizontal scroll row).
     mode-keyed rules are desktop-only BY RULE: the shell reflects mode at
     every viewport, so an unscoped [mode] rule would restyle phones. The
     structural test in oyl-widgets.test.js enforces this. */
  .deck { display: flex; gap: var(--space-3); overflow-x: auto; scrollbar-width: none; padding: var(--space-2) 0; }
  .deck::-webkit-scrollbar { display: none; }
  .card {
    flex: 0 0 auto; min-inline-size: 11rem;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-3);
  }
  .card.failed { color: var(--color-muted); font-size: var(--step--1); }
  @media (min-width: 641px) {
    :host([mode="rail"]) .deck { flex-direction: column; overflow: visible; }
    :host([mode="rail"]) .card { flex: 0 0 auto; inline-size: 100%; min-inline-size: 0; }
    :host([mode="band"]) .deck { flex-direction: row; flex-wrap: nowrap; }
  }
`)

export class OylWidgets extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** Assigned by the host before append. @type {WidgetContext} */
    this.context = /** @type {WidgetContext} */ (/** @type {unknown} */ (undefined))
    /** Overridable registry (tests inject stubs); defaults to the catalog. @type {readonly import('./widget-catalog.js').WidgetEntry[]} */
    this.widgets = WIDGETS
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    const deck = document.createElement('div')
    deck.className = 'deck'
    for (const entry of this.widgets) {
      const card = document.createElement('div')
      card.className = 'card'
      try {
        card.append(entry.create(this.context))
      } catch (err) {
        // Isolation protects USERS, not buggy code: the console.error below
        // fails the e2e hygiene fixture, so a crashing widget still fails CI.
        console.error(`widget ${entry.id} failed to render`, err)
        card.classList.add('failed')
        card.textContent = `${entry.label} unavailable`
      }
      deck.append(card)
    }
    root.append(deck)
  }
}

/** Register the element (idempotent). */
export function defineWidgets() {
  if (!customElements.get('oyl-widgets')) customElements.define('oyl-widgets', OylWidgets)
}
```

In `apps/vanilla-oyl/src/components/oyl-shell.js`, change `_reflect()`'s deck branch:

```js
    const deck = this.querySelector('[slot="widgets"]')
    if (deck) {
      if (active.widgets === 'none') deck.removeAttribute('mode')
      else deck.setAttribute('mode', active.widgets)
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test src/widgets/oyl-widgets.test.js src/components/oyl-shell.test.js` → PASS. Full `pnpm vanilla test` + `pnpm vanilla typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/widget-catalog.js apps/vanilla-oyl/src/widgets/oyl-widgets.js apps/vanilla-oyl/src/widgets/oyl-widgets.test.js apps/vanilla-oyl/src/components/oyl-shell.js apps/vanilla-oyl/src/components/oyl-shell.test.js
git commit -m "feat: oyl-widgets deck with crash isolation, mode-scoped presentation, and shell stale-mode fix" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Widgets — streak ring + today's plan

**Files:**
- Create: `apps/vanilla-oyl/src/widgets/oyl-streak-ring.js` (+ `oyl-streak-ring.test.js`)
- Create: `apps/vanilla-oyl/src/widgets/oyl-today-plan.js` (+ `oyl-today-plan.test.js`)
- Modify: `apps/vanilla-oyl/src/widgets/widget-catalog.js` (register both)

**Interfaces:**
- Consumes: `WidgetContext` (Task 4 shape), `streakOf` + `DayRange` from `@oyl/all-of-oyl`, `withSample`/`SAMPLE` (Task 4), `ringSvg` (Task 4).
- Produces: elements `<oyl-streak-ring>` / `<oyl-today-plan>` (each: `context` prop, `define*()` fn); catalog entries `streak-ring` and `today-plan`. Sample badge markup contract for ALL widgets (Tasks 6–8 and the e2e): a `<span data-sample-badge>` with text `Sample`, present only when the fixture is shown.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/widgets/oyl-streak-ring.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineStreakRing, OylStreakRing } from './oyl-streak-ring.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineStreakRing())

function mountReal(/** @type {string[]} */ days) {
  const el = /** @type {OylStreakRing} */ (document.createElement('oyl-streak-ring'))
  el.context = /** @type {any} */ ({ today: () => DayKey.of('2026-08-09'), activeDays: () => new Set(days) })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-streak-ring', () => {
  it('shows the real streak with no badge when there is any activity', () => {
    const root = mountReal(['2026-08-08', '2026-08-09'])
    expect(root.querySelector('.count')?.textContent).toBe('2')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
    expect(root.querySelector('svg')).toBeTruthy()
  })

  it('falls back to the sample fixture with a badge on an empty account', () => {
    const root = mountReal([])
    expect(root.querySelector('.count')?.textContent).toBe(String(SAMPLE.streak))
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })

  it('caps the display at 365+', () => {
    const days = []
    let d = DayKey.of('2026-08-09')
    for (let i = 0; i < 366; i++) { days.push(d.value); d = d.addDays(-1) }
    const root = mountReal(days)
    expect(root.querySelector('.count')?.textContent).toBe('365+')
  })
})
```

`apps/vanilla-oyl/src/widgets/oyl-today-plan.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineTodayPlan, OylTodayPlan } from './oyl-today-plan.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineTodayPlan())

/** @param {readonly { status: string, label: string }[]} plans */
function mount(plans) {
  const el = /** @type {OylTodayPlan} */ (document.createElement('oyl-today-plan'))
  el.context = /** @type {any} */ ({ today: () => DayKey.of('2026-08-09'), plansOn: () => plans })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-today-plan', () => {
  it('shows done/total and the next open item', () => {
    const root = mount([
      { status: 'done', label: 'Stretch' },
      { status: 'open', label: 'Run 5k' },
      { status: 'open', label: 'Read' },
    ])
    expect(root.querySelector('.progress')?.textContent).toBe('1/3')
    expect(root.querySelector('.next')?.textContent).toContain('Run 5k')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
    const fill = /** @type {HTMLElement} */ (root.querySelector('.fill'))
    expect(fill.style.getPropertyValue('inline-size')).toBe('33%')
  })

  it('all-done day shows full bar and no next item', () => {
    const root = mount([{ status: 'done', label: 'Stretch' }])
    expect(root.querySelector('.progress')?.textContent).toBe('1/1')
    expect(root.querySelector('.next')?.textContent).toBe('All done 🎉')
  })

  it('empty agenda falls back to the sample fixture with a badge', () => {
    const root = mount([])
    expect(root.querySelector('.progress')?.textContent).toBe(`${SAMPLE.todayPlan.done}/${SAMPLE.todayPlan.total}`)
    expect(root.querySelector('.next')?.textContent).toContain(SAMPLE.todayPlan.next)
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test src/widgets/oyl-streak-ring.test.js src/widgets/oyl-today-plan.test.js` → module-not-found.

- [ ] **Step 3: Implement**

Shared widget conventions (all Tasks 6–8 widgets follow these exactly):
- Class extends `OylElement`; `context` prop assigned before append; one `track()` recomputes and repaints (`replaceChildren`) so store changes update live.
- A small shared style block per widget file (label/`.k` muted small-caps text, `[data-sample-badge]` pill: `font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em; color: var(--color-muted); border: 1px solid var(--color-border); border-radius: 999px; padding: 0 .4rem;`).

`apps/vanilla-oyl/src/widgets/oyl-streak-ring.js`:

```js
import { DayRange, streakOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'
import { ringSvg } from './svg.js'

/** Next milestone the arc fills toward. */
const MILESTONES = [7, 30, 100, 365]

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; justify-items: center; gap: var(--space-1); }
  .count { font-size: var(--step-1); font-weight: 700; font-variant-numeric: tabular-nums; }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

export class OylStreakRing extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const today = this.context.today()
      // 366-day lookback window (spec): a streak at the cap renders as 365+.
      const days = this.context.activeDays(DayRange.of(today.addDays(-365), today))
      const { value, sample } = withSample(days.size === 0, streakOf(days, today), SAMPLE.streak)
      const milestone = MILESTONES.find((m) => value < m) ?? 365

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      wrap.append(ringSvg(Math.min(value / milestone, 1)))
      const count = document.createElement('div')
      count.className = 'count'
      count.textContent = value > 365 ? '365+' : String(value)
      const k = document.createElement('div')
      k.className = 'k'
      k.textContent = 'day streak'
      wrap.append(count, k)
      if (sample) wrap.append(badge())
      root.replaceChildren(wrap)
    })
  }
}

function badge() {
  const b = document.createElement('span')
  b.setAttribute('data-sample-badge', '')
  b.textContent = 'Sample'
  return b
}

/** Register the element (idempotent). */
export function defineStreakRing() {
  if (!customElements.get('oyl-streak-ring')) customElements.define('oyl-streak-ring', OylStreakRing)
}
```

`apps/vanilla-oyl/src/widgets/oyl-today-plan.js`:

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-1); min-inline-size: 10rem; }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  .progress { font-size: var(--step-1); font-weight: 700; font-variant-numeric: tabular-nums; }
  .bar { block-size: .35rem; background: color-mix(in oklch, var(--color-text) 10%, transparent); border-radius: 999px; overflow: hidden; }
  .fill { block-size: 100%; inline-size: 0; background: var(--color-accent); }
  .next { font-size: var(--step--1); color: var(--color-text); }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

export class OylTodayPlan extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const plans = this.context.plansOn(this.context.today())
      const real = {
        done: plans.filter((p) => p.status === 'done').length,
        total: plans.length,
        next: plans.find((p) => p.status === 'open')?.label,
      }
      const { value, sample } = withSample(plans.length === 0, real, SAMPLE.todayPlan)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      const k = document.createElement('div')
      k.className = 'k'
      k.textContent = "Today's plan"
      const progress = document.createElement('div')
      progress.className = 'progress'
      progress.textContent = `${value.done}/${value.total}`
      const bar = document.createElement('div')
      bar.className = 'bar'
      const fill = document.createElement('div')
      fill.className = 'fill'
      fill.style.setProperty('inline-size', `${Math.round((value.done / Math.max(value.total, 1)) * 100)}%`)
      bar.append(fill)
      const next = document.createElement('div')
      next.className = 'next'
      next.textContent = value.next ? `next: ${value.next}` : 'All done 🎉'
      wrap.append(k, progress, bar, next)
      if (sample) {
        const b = document.createElement('span')
        b.setAttribute('data-sample-badge', '')
        b.textContent = 'Sample'
        wrap.append(b)
      }
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineTodayPlan() {
  if (!customElements.get('oyl-today-plan')) customElements.define('oyl-today-plan', OylTodayPlan)
}
```

Update `widget-catalog.js`:

```js
import { defineStreakRing } from './oyl-streak-ring.js'
import { defineTodayPlan } from './oyl-today-plan.js'

/** … keep the existing typedef comment … */
export const WIDGETS = Object.freeze([
  {
    id: 'streak-ring',
    label: 'Streak',
    create(context) {
      defineStreakRing()
      const el = /** @type {import('./oyl-streak-ring.js').OylStreakRing} */ (document.createElement('oyl-streak-ring'))
      el.context = context
      return el
    },
  },
  {
    id: 'today-plan',
    label: "Today's plan",
    create(context) {
      defineTodayPlan()
      const el = /** @type {import('./oyl-today-plan.js').OylTodayPlan} */ (document.createElement('oyl-today-plan'))
      el.context = context
      return el
    },
  },
])
```

Fix the today-plan test's 33% expectation if rounding differs: `Math.round(1/3*100)` = 33 → `'33%'` holds.

- [ ] **Step 4: Run tests to verify they pass**

Run the two widget test files → PASS. Full `pnpm vanilla test` + `pnpm vanilla typecheck` → green (deck tests still pass — they inject stubs, indifferent to the catalog's contents).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/
git commit -m "feat: streak-ring and today-plan widgets with sample fallback" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Widgets — trend sparklines + goal rings

**Files:**
- Create: `apps/vanilla-oyl/src/widgets/oyl-trend-sparklines.js` (+ test)
- Create: `apps/vanilla-oyl/src/widgets/oyl-goal-rings.js` (+ test)
- Modify: `apps/vanilla-oyl/src/widgets/widget-catalog.js` (register; order now streak-ring, today-plan, trend-sparklines, goal-rings)

**Interfaces:**
- Consumes: `WidgetContext.series(range, kind)` / `.review(range)`; `periodWindowOf` + `DayRange` from `@oyl/all-of-oyl`; `sparklineSvg`/`ringSvg`, `withSample`/`SAMPLE`.
- Produces: `<oyl-trend-sparklines>` (14-day rows: Spending, Calories, Active) and `<oyl-goal-rings>` (one ring per `review(week).goals` entry: `ringSvg(progress.ratio)` + name + `🔥 n` when `streak > 0`). Same badge contract.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/widgets/oyl-trend-sparklines.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineTrendSparklines, OylTrendSparklines } from './oyl-trend-sparklines.js'

beforeAll(() => defineTrendSparklines())

/** @param {Record<string, number[]>} byKind */
function mount(byKind) {
  const el = /** @type {OylTrendSparklines} */ (document.createElement('oyl-trend-sparklines'))
  el.context = /** @type {any} */ ({
    today: () => DayKey.of('2026-08-09'),
    series: (/** @type {any} */ _r, /** @type {string} */ kind) => byKind[kind] ?? [],
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

describe('oyl-trend-sparklines', () => {
  it('renders three labeled rows with an svg each from real data', () => {
    const real = { spending: [1, 2], calories: [3, 4], activeMinutes: [5, 6] }
    const root = mount(real)
    const rows = [...root.querySelectorAll('.row')]
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.querySelector('.k')?.textContent)).toEqual(['Spending', 'Calories', 'Active min'])
    expect(root.querySelectorAll('svg')).toHaveLength(3)
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('all-zero series fall back to the sample with a badge', () => {
    const zero = Array(14).fill(0)
    const root = mount({ spending: zero, calories: zero, activeMinutes: zero })
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
    expect(root.querySelectorAll('svg')).toHaveLength(3)
  })
})
```

`apps/vanilla-oyl/src/widgets/oyl-goal-rings.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineGoalRings, OylGoalRings } from './oyl-goal-rings.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineGoalRings())

/** @param {readonly any[]} goals */
function mount(goals) {
  const el = /** @type {OylGoalRings} */ (document.createElement('oyl-goal-rings'))
  el.context = /** @type {any} */ ({
    today: () => DayKey.of('2026-08-09'),
    review: () => ({ goals }),
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

const goalReview = (/** @type {string} */ name, /** @type {number} */ ratio, /** @type {number} */ streak) => ({
  goalId: name, name, streak,
  progress: { current: 0, target: 1, ratio, paused: false, empty: false },
})

describe('oyl-goal-rings', () => {
  it('renders a ring, name, and streak flame per goal', () => {
    const root = mount([goalReview('Run', 0.8, 4), goalReview('Read', 0.5, 0)])
    const items = [...root.querySelectorAll('.goal')]
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('Run')
    expect(items[0]?.textContent).toContain('🔥 4')
    expect(items[1]?.textContent).not.toContain('🔥')
    expect(root.querySelectorAll('svg')).toHaveLength(2)
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('unnamed goals get a fallback label', () => {
    const root = mount([{ goalId: 'x', streak: 0, progress: { current: 0, target: 1, ratio: 0.1, paused: false, empty: false } }])
    expect(root.querySelector('.goal')?.textContent).toContain('Goal')
  })

  it('no goals falls back to the sample set with a badge', () => {
    const root = mount([])
    expect(root.querySelectorAll('.goal')).toHaveLength(SAMPLE.goals.length)
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run both files → module-not-found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/widgets/oyl-trend-sparklines.js`:

```js
import { DayRange } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'
import { sparklineSvg } from './svg.js'

/** Row order + labels; kinds are the WidgetContext series kinds. */
const ROWS = /** @type {ReadonlyArray<readonly ['spending' | 'calories' | 'activeMinutes', string]>} */ ([
  ['spending', 'Spending'],
  ['calories', 'Calories'],
  ['activeMinutes', 'Active min'],
])

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-2); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .k { font-size: var(--step--1); color: var(--color-muted); }
  svg { color: var(--color-accent); }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

export class OylTrendSparklines extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const today = this.context.today()
      const range = DayRange.of(today.addDays(-13), today) // 14-day window (spec)
      const real = {
        spending: this.context.series(range, 'spending'),
        calories: this.context.series(range, 'calories'),
        activeMinutes: this.context.series(range, 'activeMinutes'),
      }
      const empty = Object.values(real).every((s) => s.length === 0 || s.every((v) => v === 0))
      const { value, sample } = withSample(empty, real, SAMPLE.series)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      for (const [kind, label] of ROWS) {
        const row = document.createElement('div')
        row.className = 'row'
        const k = document.createElement('span')
        k.className = 'k'
        k.textContent = label
        row.append(k, sparklineSvg(value[kind]))
        wrap.append(row)
      }
      if (sample) {
        const b = document.createElement('span')
        b.setAttribute('data-sample-badge', '')
        b.textContent = 'Sample'
        wrap.append(b)
      }
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineTrendSparklines() {
  if (!customElements.get('oyl-trend-sparklines')) customElements.define('oyl-trend-sparklines', OylTrendSparklines)
}
```

`apps/vanilla-oyl/src/widgets/oyl-goal-rings.js`:

```js
import { periodWindowOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'
import { ringSvg } from './svg.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: flex; gap: var(--space-3); }
  .goal { display: grid; justify-items: center; gap: var(--space-1); }
  .name { font-size: var(--step--1); color: var(--color-text); }
  .flame { font-size: var(--step--1); color: var(--color-muted); font-variant-numeric: tabular-nums; }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

export class OylGoalRings extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const week = periodWindowOf('week', this.context.today())
      const reviews = this.context.review(week).goals
      const real = reviews.map((g) => ({ name: g.name ?? 'Goal', ratio: g.progress.ratio, streak: g.streak }))
      const { value, sample } = withSample(real.length === 0, real, SAMPLE.goals)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      for (const g of value) {
        const item = document.createElement('div')
        item.className = 'goal'
        item.append(ringSvg(g.ratio, { size: 40, stroke: 4 }))
        const name = document.createElement('span')
        name.className = 'name'
        name.textContent = g.name
        item.append(name)
        if (g.streak > 0) {
          const flame = document.createElement('span')
          flame.className = 'flame'
          flame.textContent = `🔥 ${g.streak}`
          item.append(flame)
        }
        wrap.append(item)
      }
      if (sample) {
        const b = document.createElement('span')
        b.setAttribute('data-sample-badge', '')
        b.textContent = 'Sample'
        wrap.append(b)
      }
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineGoalRings() {
  if (!customElements.get('oyl-goal-rings')) customElements.define('oyl-goal-rings', OylGoalRings)
}
```

Register both in `widget-catalog.js` after `today-plan` (same entry shape as Task 6: import the `define*` + class type, `create(context)` defines, creates, assigns `context`, returns). Ids: `trend-sparklines` (label `Trends`), `goal-rings` (label `Goals`).

- [ ] **Step 4: Run tests to verify they pass**

Both files → PASS. Full `pnpm vanilla test` + `pnpm vanilla typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/
git commit -m "feat: trend-sparklines and goal-rings widgets" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Greeting-digest widget + main.js wiring

**Files:**
- Create: `apps/vanilla-oyl/src/widgets/oyl-greeting-digest.js` (+ test)
- Modify: `apps/vanilla-oyl/src/widgets/widget-catalog.js` (register FIRST — final order: greeting-digest, streak-ring, today-plan, trend-sparklines, goal-rings)
- Modify: `apps/vanilla-oyl/src/main.js` (context build + reactive deck mount)

**Interfaces:**
- Consumes: `digestOf`, `streakOf`, `periodWindowOf`, `DayRange` from `@oyl/all-of-oyl`; `WidgetContext`; `createWidgetContext` (Task 4); `defineWidgets`/`OylWidgets` (Task 5); `byId` from `src/layouts/layout-catalog.js`; `effect` from `src/lib/reactive/effect.js` (already imported in main.js).
- Produces: `<oyl-greeting-digest>`; the app-level wiring later tasks/e2e depend on: deck mounted with `slot="widgets"` exactly when `byId(layout).widgets !== 'none'`.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/widgets/oyl-greeting-digest.test.js`:

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { defineGreetingDigest, OylGreetingDigest } from './oyl-greeting-digest.js'
import { SAMPLE } from './sample-data.js'

beforeAll(() => defineGreetingDigest())

/**
 * @param {{ hour?: number, name?: string, plans?: readonly any[], goals?: readonly any[], activeDays?: string[] }} opts
 */
function mount({ hour = 9, name = 'Steve', plans = [], goals = [], activeDays = [] } = {}) {
  const el = /** @type {OylGreetingDigest} */ (document.createElement('oyl-greeting-digest'))
  el.context = /** @type {any} */ ({
    hour: () => hour,
    profileName: () => name,
    today: () => DayKey.of('2026-08-09'),
    plansOn: () => plans,
    review: () => ({ goals }),
    activeDays: () => new Set(activeDays),
  })
  document.body.append(el)
  return /** @type {ShadowRoot} */ (el.shadowRoot)
}

const goalReview = (/** @type {boolean} */ met) => ({
  goalId: 'g', streak: 9,
  progress: { current: 0, target: 1, ratio: 0, met, paused: false, empty: false },
})

describe('oyl-greeting-digest', () => {
  it('greets by time of day and name', () => {
    expect(mount({ hour: 9 }).querySelector('.hello')?.textContent).toBe('Good morning, Steve')
    expect(mount({ hour: 15 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 21 }).querySelector('.hello')?.textContent).toBe('Good evening, Steve')
  })

  it('greets without a name when the profile has none', () => {
    expect(mount({ name: undefined }).querySelector('.hello')?.textContent).toBe('Good morning')
  })

  it('summarizes real plans, goals, and day streak', () => {
    const root = mount({
      plans: [{ status: 'done', label: 'a' }, { status: 'open', label: 'b' }],
      goals: [goalReview(true), goalReview(false)],
      activeDays: ['2026-08-09', '2026-08-08'],
    })
    expect(root.querySelector('.line')?.textContent).toBe('1/2 plans · 1/2 goals this week · 🔥 2')
    expect(root.querySelector('[data-sample-badge]')).toBeNull()
  })

  it('a fully empty account shows the sample digest with a badge', () => {
    const root = mount({})
    const d = SAMPLE.digest
    expect(root.querySelector('.line')?.textContent).toBe(
      `${d.plansDone}/${d.plansTotal} plans · ${d.goalsMet}/${d.goalsTotal} goals this week · 🔥 ${d.streak}`,
    )
    expect(root.querySelector('[data-sample-badge]')?.textContent).toBe('Sample')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test src/widgets/oyl-greeting-digest.test.js` → module-not-found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/widgets/oyl-greeting-digest.js`:

```js
import { DayRange, digestOf, periodWindowOf, streakOf } from '@oyl/all-of-oyl'
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from '../components/sheet.js'
import { SAMPLE, withSample } from './sample-data.js'

const styles = sheet(`
  :host { display: block; }
  .wrap { position: relative; display: grid; gap: var(--space-1); min-inline-size: 13rem; }
  .hello { font-size: var(--step-1); font-weight: 650; }
  .line { font-size: var(--step--1); color: var(--color-muted); font-variant-numeric: tabular-nums; }
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)

/** @param {number} hour */
function greetingFor(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export class OylGreetingDigest extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** @type {import('./context.js').WidgetContext} */
    this.context = /** @type {import('./context.js').WidgetContext} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)
    this.track(() => {
      const ctx = this.context
      const today = ctx.today()
      const plans = ctx.plansOn(today)
      const review = ctx.review(periodWindowOf('week', today))
      const days = ctx.activeDays(DayRange.of(today.addDays(-365), today))
      const real = digestOf(review, plans, streakOf(days, today))
      const empty = real.plansTotal === 0 && real.goalsTotal === 0 && real.streak === 0
      const { value, sample } = withSample(empty, real, SAMPLE.digest)

      const wrap = document.createElement('div')
      wrap.className = 'wrap'
      const hello = document.createElement('div')
      hello.className = 'hello'
      const name = ctx.profileName()
      hello.textContent = name ? `${greetingFor(ctx.hour())}, ${name}` : greetingFor(ctx.hour())
      const line = document.createElement('div')
      line.className = 'line'
      line.textContent = `${value.plansDone}/${value.plansTotal} plans · ${value.goalsMet}/${value.goalsTotal} goals this week · 🔥 ${value.streak}`
      wrap.append(hello, line)
      if (sample) {
        const b = document.createElement('span')
        b.setAttribute('data-sample-badge', '')
        b.textContent = 'Sample'
        wrap.append(b)
      }
      root.replaceChildren(wrap)
    })
  }
}

/** Register the element (idempotent). */
export function defineGreetingDigest() {
  if (!customElements.get('oyl-greeting-digest')) customElements.define('oyl-greeting-digest', OylGreetingDigest)
}
```

Register it FIRST in `widget-catalog.js` (id `greeting-digest`, label `Greeting`; same entry shape).

`main.js` wiring (after `shell.layoutSignal = layoutState.layout` from Plan A, before `shell.append(...)`):

```js
import { createWidgetContext } from './widgets/context.js'
import { defineWidgets } from './widgets/oyl-widgets.js'
import { byId } from './layouts/layout-catalog.js'
```

```js
  // Engagement deck: mounted only for widget-bearing layouts (no
  // hidden-but-computing work on classic/focus/wide). The shell reflects
  // mode via slotchange, so append order vs. the layout track is immaterial.
  defineWidgets()
  const widgetContext = createWidgetContext({
    journal: dataState.journal,
    planner: dataState.planner,
    reviewOn: dataState.reviewOn,
    profile: profileStore.profile,
    tz,
    now,
  })
  /** @type {import('./widgets/oyl-widgets.js').OylWidgets | null} */
  let deck = null
  effect(() => {
    const wantsDeck = byId(layoutState.layout.get()).widgets !== 'none'
    if (wantsDeck && !deck) {
      deck = /** @type {import('./widgets/oyl-widgets.js').OylWidgets} */ (document.createElement('oyl-widgets'))
      deck.slot = 'widgets'
      deck.context = widgetContext
      shell.append(deck)
    } else if (!wantsDeck && deck) {
      deck.remove()
      deck = null
    }
  })
```

- [ ] **Step 4: Run tests + gates**

Run: `pnpm vanilla test` (all files) + `pnpm vanilla typecheck` → green.

- [ ] **Step 5: Manual smoke**

`pnpm vanilla dev` → sign in → switch to Dashboard: deck band with five widgets (Sample badges on a fresh account); switch to Sidebar: rail; Classic/Focus/Wide: no deck. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/ apps/vanilla-oyl/src/main.js
git commit -m "feat: greeting-digest widget and reactive deck mount in boot" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Popover polish carry-overs — shared mobile sheet + focusin closer

**Files:**
- Create: `apps/vanilla-oyl/src/components/popover-sheet.js` (+ `popover-sheet.test.js`)
- Modify: `apps/vanilla-oyl/src/components/oyl-theme-toggle.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-layout-picker.js`
- Modify: `apps/vanilla-oyl/src/components/oyl-theme-toggle.test.js`, `oyl-layout-picker.test.js` (focusin cases)

**Interfaces:**
- Produces: `MOBILE_SHEET_CSS` — the exact 9-line `@media (max-width: 640px) { .panel { … } }` block currently duplicated in both components (verbatim extraction, single source), interpolated into both `sheet(\`…\`)` template literals via `${MOBILE_SHEET_CSS}`. Behavior change: both popovers ALSO close on `focusin` outside the component (keyboard parity with the `pointerdown` closer — fixes keyboard-opened popovers stacking on mobile).

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/components/popover-sheet.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { MOBILE_SHEET_CSS } from './popover-sheet.js'
import { sheet } from './sheet.js'

describe('MOBILE_SHEET_CSS', () => {
  it('is a single max-width 640px media block making .panel a fixed sheet', () => {
    const s = sheet(MOBILE_SHEET_CSS)
    expect(s.cssRules).toHaveLength(1)
    const media = /** @type {CSSMediaRule} */ (s.cssRules[0])
    expect(media.conditionText).toBe('(max-width: 640px)')
    const text = [...media.cssRules].map((r) => r.cssText).join('\n')
    expect(text).toContain('.panel')
    expect(text).toContain('position: fixed')
  })
})
```

Add to BOTH `oyl-theme-toggle.test.js` and `oyl-layout-picker.test.js` (adapted to each file's mount helper — theme toggle's panel opens via its `[data-picker-trigger]`, picker via `[data-layout-trigger]`):

```js
it('closes when focus moves outside the component (keyboard parity)', () => {
  const { root } = mountOpen() // open the panel via the trigger per this file's helper
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.dispatchEvent(new Event('focusin', { bubbles: true, composed: true }))
  expect(/** @type {HTMLElement} */ (root.querySelector('[data-layout-panel]')).hidden).toBe(true)
  outside.remove()
})
```

(For the theme toggle use `[data-picker-panel]`. If no `mountOpen` helper exists, open inline: click the trigger, assert `hidden === false`, then dispatch.)

Existing structural tests (Plan A Task 9 added per-component mobile-block tests) must keep passing unchanged — they now assert the interpolated shared block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test src/components/popover-sheet.test.js src/components/oyl-theme-toggle.test.js src/components/oyl-layout-picker.test.js`
Expected: popover-sheet fails module-not-found; both focusin cases fail (panel stays open).

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/components/popover-sheet.js` — move the CURRENT mobile block (verbatim from `oyl-theme-toggle.js`'s `@media (max-width: 640px)` panel rules, which `oyl-layout-picker.js` duplicates; read both and confirm they are still identical before extracting):

```js
/**
 * The shared mobile presentation for toolbar popovers: below 641px a
 * host-anchored flyout can overflow the viewport (the regression e2e caught
 * in Plan A), so panels become viewport-anchored sheets under the header.
 * ONE source — interpolate into each component's sheet() as ${MOBILE_SHEET_CSS}.
 * Clearances (header offset / bottom tab allowance) live here only.
 */
export const MOBILE_SHEET_CSS = `
  @media (max-width: 640px) {
    .panel {
      /* …the exact current block from oyl-theme-toggle.js, verbatim… */
    }
  }
`
```

In both components: delete the local mobile block, add `import { MOBILE_SHEET_CSS } from './popover-sheet.js'`, and interpolate `${MOBILE_SHEET_CSS}` at the same position in the `sheet(\`…\`)` literal.

Focusin closer — in BOTH components, next to the existing `pointerdown` listener (same guard, same lifecycle signal):

```js
    document.addEventListener(
      'focusin',
      (e) => {
        if (!panel.hidden && !e.composedPath().includes(this)) setOpen(false)
      },
      { signal: this.lifecycle },
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run the three files → PASS (including the pre-existing structural mobile-block tests). Full `pnpm vanilla test` + `pnpm vanilla typecheck` → green.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/popover-sheet.js apps/vanilla-oyl/src/components/popover-sheet.test.js apps/vanilla-oyl/src/components/oyl-theme-toggle.js apps/vanilla-oyl/src/components/oyl-theme-toggle.test.js apps/vanilla-oyl/src/components/oyl-layout-picker.js apps/vanilla-oyl/src/components/oyl-layout-picker.test.js
git commit -m "refactor: shared mobile popover sheet + focusin outside-closer for toolbar popovers" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: E2E `widgets.spec.ts` + full Definition of Done

**Files:**
- Create: `apps/e2e-oyl/tests/widgets.spec.ts`

**Interfaces:**
- Consumes: e2e fixtures (`signIn`, hygiene auto-fixture — this spec has NO intentional failures); Plan A's layout picker hooks (`oyl-layout-picker button[data-layout-trigger]`, `[data-layout-option="<id>"]`, `oyl-shell[layout]`); the deck (`oyl-widgets`, `mode` attribute); widget elements + `[data-sample-badge]` contract. Read `apps/e2e-oyl/tests/layouts.spec.ts` (the `pickLayout` helper idiom) and the existing journal spec (for the add-a-note flow — reuse its exact selectors) BEFORE writing.

- [ ] **Step 1: Write the spec**

`apps/e2e-oyl/tests/widgets.spec.ts`:

```ts
/**
 * Engagement widget deck: mounts only on widget-bearing layouts (sidebar rail /
 * dashboard band), shows badged Sample data for a fresh account, and swaps to
 * real data reactively once the account has any. Runs on desktop + mobile
 * (below 641px the deck is a horizontal scroll row — still visible).
 */
import { test, expect } from '../lib/fixtures'

const trigger = 'oyl-layout-picker button[data-layout-trigger]'

async function pickLayout(page: import('@playwright/test').Page, id: string) {
  await page.locator(trigger).click()
  await page.locator(`oyl-layout-picker [data-layout-option="${id}"]`).click()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', id)
  await page.keyboard.press('Escape')
  await expect(page.locator('oyl-layout-picker [data-layout-panel]')).toBeHidden()
}

test('deck mounts only on widget-bearing layouts, with the right mode', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('oyl-widgets')).toHaveCount(0) // classic default
  await pickLayout(page, 'dashboard')
  await expect(page.locator('oyl-widgets')).toBeVisible()
  await expect(page.locator('oyl-widgets')).toHaveAttribute('mode', 'band')
  await pickLayout(page, 'sidebar')
  await expect(page.locator('oyl-widgets')).toHaveAttribute('mode', 'rail')
  await pickLayout(page, 'focus')
  await expect(page.locator('oyl-widgets')).toHaveCount(0)
})

test('fresh account shows all five widgets with Sample badges', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'dashboard')
  for (const widget of ['oyl-greeting-digest', 'oyl-streak-ring', 'oyl-today-plan', 'oyl-trend-sparklines', 'oyl-goal-rings']) {
    await expect(page.locator(widget), widget).toBeVisible()
  }
  // Greeting always renders real greeting text; its digest line is sampled:
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toBeVisible()
  await expect(page.locator('oyl-today-plan [data-sample-badge]')).toBeVisible()
})

test('adding a journal entry replaces the streak sample with real data, live', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'dashboard')
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toBeVisible()
  // Add a note through the real journal UI — reuse the exact flow/selectors
  // from the existing journal spec (per-test user, unique text):
  await page.locator('oyl-nav a[data-route="journal"]').click()
  // <journal add-note steps copied from tests/journal.spec.ts>
  // The deck travels with the dashboard layout, so it is visible on /journal:
  await expect(page.locator('oyl-streak-ring [data-sample-badge]')).toHaveCount(0)
  await expect(page.locator('oyl-streak-ring')).toContainText('1')
})
```

The `<journal add-note steps>` marker is the ONE spot the implementer fills from the existing journal spec's real selectors (composer open, text fill, submit) — everything else is normative as written. Do not invent selectors; copy the working ones.

- [ ] **Step 2: Typecheck + lib rebuild**

Run: `pnpm --filter @oyl/e2e-oyl typecheck` → clean.
Run: `pnpm vanilla build:lib` — REQUIRED: Tasks 1–3 changed all-of-oyl `src/`, and the served app consumes the vendored `dist/` (new exports like `streakOf` don't exist there until this runs).

- [ ] **Step 3: Run the full e2e suite**

Kill any stale processes on :8042/:1341 first. Run: `pnpm e2e` (10-minute timeout).
Expected: ALL PASS both projects (desktop + Pixel 7), including the pre-existing `layouts.spec.ts` and `theme.spec.ts`. A failure in an EXISTING spec after this plan's changes is a product regression — report it precisely, don't patch tests.

- [ ] **Step 4: Full Definition of Done sweep**

```bash
pnpm all-of test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
pnpm vanilla test
pnpm vanilla typecheck
pnpm e2e
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e-oyl/tests/widgets.spec.ts
git commit -m "feat: e2e coverage for the engagement widget deck (mount rules, sample badges, live swap)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Out of scope (unchanged from spec)

Engagement measurement/analytics; per-layout widget configuration; server-side layout/widget preferences; `?layout=` URL override; account-menu popover refactor beyond the shared sheet (it has no `.panel` popover today).
