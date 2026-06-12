# all-of-oyl Phase 4: Planner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `plan/` module — `Task` (with recurring respawn), `Appointment`, `PlannedMeal`, `Project`, `DayPlan`, and the `Planner` root with fulfillment links, agenda/day-plan queries, completion rate, and the grocery list — plus `revivePlan` in the barrel and the fixtures/seed extension.

**Architecture:** `plan/` imports `core/` only (food/possession references are bare `Id`s — never cross-domain types). The `Plan` abstract (phase 1) gains the same serialization seam `Entry` got in phase 2 (`planBaseJSON`/`parsePlanBase`) plus a protected `restoreState` so revival can reconstruct the status machine. The `Planner` is a plain in-memory aggregate mirroring `Journal` (strict adds, idempotent removes); recurring duties re-anchor on actual completion (`cadence.nextAfter(completedOn)`), and the planner — not the task — owns adding the spawned successor. `DayPlan` is per-day storage the user edits; reading queries skip stale slots.

**Tech Stack:** TypeScript 5 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4, zero runtime dependencies. Phases 1–3 (merged on `master`) provide everything imported here.

**Read first:** `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` — sections "Planner: intentions and their fulfillment", the `Cadence` bullet (anchor-based vs re-anchoring `nextAfter`), and "Day-by-day planning". Reference code: `core/plan.ts` (the abstract you're extending), `core/entry.ts` (the serialization-seam pattern you're mirroring), `activity/activity-session.ts` (the subclass serialization template), `core/journal.ts` (the aggregate-root pattern).

**Working conventions (same as phases 1–3):** TDD per task; `let caught: unknown` capture for throw-assertions; run from repo root; kebab-case files, named exports, colocated tests; conditional spreads for optional props (never assign `undefined` to an optional property; `delete` to clear one; explicit `undefined` as a function *argument* is fine).

**Kind discriminants (fixed):** `task`, `appointment`, `planned-meal`.

---

### Task 1: Plan serialization seam + state restoration

Mirror the `Entry` seam from phase 2: `planBaseJSON`/`parsePlanBase` free functions, an abstract `toJSON()` on `Plan`, and a protected `restoreState` so `fromJSON` can reconstruct `status`/`completedOn`/`fulfilledBy` without weakening the state machine.

**Files:**
- Modify: `packages/all-of-oyl/src/core/plan.ts`
- Test: `packages/all-of-oyl/src/core/plan.test.ts` (modify TestPlan + append)

- [ ] **Step 1: Update TestPlan and append the failing tests**

In `packages/all-of-oyl/src/core/plan.test.ts`, extend the import line to `import { Plan, planBaseJSON, parsePlanBase } from './plan'` and give the existing `TestPlan` a `toJSON` (the new abstract member will otherwise break compilation):

```ts
class TestPlan extends Plan {
  constructor(props: { id?: Id; title: string; due?: DayKey }) {
    super('test-plan', props)
  }

  toJSON(): Record<string, unknown> {
    return planBaseJSON(this)
  }

  static fromJSON(shape: unknown): TestPlan {
    const base = parsePlanBase(shape, 'test-plan')
    const plan = new TestPlan({ id: base.id, title: base.title, ...(base.due !== undefined ? { due: base.due } : {}) })
    plan.adopt(base)
    return plan
  }

  /** Test-only bridge to the protected restore. */
  private adopt(base: ReturnType<typeof parsePlanBase>): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }
}
```

Append inside the `describe('Plan', ...)` block:

```ts
  it('planBaseJSON emits the shared base fields including the state machine', () => {
    const p = new TestPlan({ id: Id.of('00000000-0000-4000-8000-000000001000'), title: 'Write tests', due: day('2026-06-05') })
    p.complete(day('2026-06-04'), Id.of('00000000-0000-4000-8000-000000000100'))
    expect(planBaseJSON(p)).toEqual({
      id: '00000000-0000-4000-8000-000000001000',
      kind: 'test-plan',
      title: 'Write tests',
      due: '2026-06-05',
      status: 'done',
      completedOn: '2026-06-04',
      fulfilledBy: ['00000000-0000-4000-8000-000000000100'],
    })
  })

  it('round-trips the full state machine through parsePlanBase/restoreState', () => {
    const p = new TestPlan({ title: 'Run', due: day('2026-06-05') })
    p.complete(day('2026-06-04'), Id.create())
    const revived = TestPlan.fromJSON(p.toJSON())
    expect(revived.status).toBe('done')
    expect(revived.completedOn?.value).toBe('2026-06-04')
    expect(revived.fulfilledBy).toEqual(p.fulfilledBy)
    expect(revived.toJSON()).toEqual(p.toJSON())

    const canceled = new TestPlan({ title: 'Skip' })
    canceled.cancel()
    expect(TestPlan.fromJSON(canceled.toJSON()).status).toBe('canceled')
  })

  it('parsePlanBase rejects malformed and inconsistent shapes', () => {
    const good = {
      id: '00000000-0000-4000-8000-000000001000',
      kind: 'test-plan',
      title: 'x',
      status: 'open',
    }
    for (const shape of [
      null,
      { ...good, kind: 'other' },
      { ...good, id: 'nope' },
      { ...good, title: '' },
      { ...good, status: 'paused' },
      { ...good, status: 'done' }, // done without completedOn is inconsistent
      { ...good, status: 'open', completedOn: '2026-06-04' }, // open with completedOn is inconsistent
      { ...good, due: 'garbage' },
      { ...good, fulfilledBy: ['nope'] },
    ]) {
      let caught: unknown
      try {
        parsePlanBase(shape, 'test-plan')
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/plan.test.ts`
Expected: FAIL — `planBaseJSON`/`parsePlanBase` not exported.

- [ ] **Step 3: Implement the seam**

In `packages/all-of-oyl/src/core/plan.ts`: extend imports (`DayKey` becomes a VALUE import — `parsePlanBase` calls `DayKey.of`; add `import { DomainError } from './domain-error'` if not present — it is already there; add value imports `metaFromJSON, metaToJSON` from `./persisted-meta`, keeping the `PersistedMeta` type import). Inside the class add the abstract member and the protected restore:

```ts
  abstract toJSON(): Record<string, unknown>

  /** For deserialization only: restore the mutable state machine verbatim. */
  protected restoreState(snapshot: PlanStateSnapshot): void {
    this.currentStatus = snapshot.status
    if (snapshot.completedOn !== undefined) this.completedOnDay = snapshot.completedOn
    this.links.length = 0
    this.links.push(...snapshot.fulfilledBy)
  }
```

After the class, add:

```ts
export type PlanStateSnapshot = {
  status: PlanStatus
  completedOn?: DayKey
  fulfilledBy: readonly Id[]
}

export type PlanBaseProps = {
  id: Id
  title: string
  due?: DayKey
  state: PlanStateSnapshot
  meta?: PersistedMeta
  /** Everything that wasn't a base field — subclass fields plus unknown extras. */
  rest: Record<string, unknown>
}

const PLAN_STATUSES: readonly PlanStatus[] = ['open', 'done', 'canceled']

/** Serialize the base fields shared by every plan kind. */
export function planBaseJSON(plan: Plan): Record<string, unknown> {
  return {
    id: plan.id,
    kind: plan.kind,
    title: plan.title,
    ...(plan.due !== undefined ? { due: plan.due.value } : {}),
    status: plan.status,
    ...(plan.completedOn !== undefined ? { completedOn: plan.completedOn.value } : {}),
    ...(plan.fulfilledBy.length > 0 ? { fulfilledBy: [...plan.fulfilledBy] } : {}),
    ...(plan.meta ? { meta: metaToJSON(plan.meta) } : {}),
  }
}

/** Parse and validate the base fields of a plan shape; subclass fields stay in `rest`. */
export function parsePlanBase(shape: unknown, expectedKind: string): PlanBaseProps {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const { id, kind, title, due, status, completedOn, fulfilledBy, meta, ...rest } = shape as Record<string, unknown>
  if (
    kind !== expectedKind ||
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    title.length === 0 ||
    (due !== undefined && typeof due !== 'string') ||
    !(PLAN_STATUSES as readonly unknown[]).includes(status) ||
    (completedOn !== undefined && typeof completedOn !== 'string') ||
    (fulfilledBy !== undefined && !Array.isArray(fulfilledBy))
  ) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  // state-machine consistency: done iff completedOn present
  if ((status === 'done') !== (completedOn !== undefined)) {
    throw new DomainError('MALFORMED_JSON', `inconsistent plan state in ${expectedKind} shape`)
  }
  try {
    const parsedId = Id.of(id)
    const parsedDue = due !== undefined ? DayKey.of(due) : undefined
    const parsedCompletedOn = completedOn !== undefined ? DayKey.of(completedOn) : undefined
    const links = (fulfilledBy ?? []).map((raw: unknown) => {
      if (typeof raw !== 'string') throw new DomainError('MALFORMED_JSON', 'bad fulfilledBy entry')
      return Id.of(raw)
    })
    return {
      id: parsedId,
      title,
      ...(parsedDue !== undefined ? { due: parsedDue } : {}),
      state: {
        status: status as PlanStatus,
        ...(parsedCompletedOn !== undefined ? { completedOn: parsedCompletedOn } : {}),
        fulfilledBy: links,
      },
      ...(meta !== undefined ? { meta: metaFromJSON(meta) } : {}),
      rest,
    }
  } catch (e) {
    if (e instanceof DomainError && e.code !== 'MALFORMED_JSON') {
      throw new DomainError('MALFORMED_JSON', `malformed ids or days in ${expectedKind} shape`)
    }
    throw e
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/plan.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl test` → all green (no other Plan subclasses exist yet, so the new abstract breaks nothing else).
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/plan.ts packages/all-of-oyl/src/core/plan.test.ts
git commit -m "feat(all-of-oyl): plan serialization seam + state restoration"
```

---

### Task 2: Task — the plain to-do with recurring respawn

**Files:**
- Create: `packages/all-of-oyl/src/plan/task.ts`
- Test: `packages/all-of-oyl/src/plan/task.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/plan/task.test.ts
import { describe, expect, it } from 'vitest'
import { Task } from './task'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)

describe('Task', () => {
  it('constructs with optional project, cadence, and possession links', () => {
    const task = new Task({
      title: 'Water the plants',
      due: day('2026-06-05'),
      cadence: Cadence.of(7, 'days'),
      projectId: Id.of('00000000-0000-4000-8000-000000001000'),
      possessionId: Id.of('00000000-0000-4000-8000-000000002000'),
    })
    expect(task.kind).toBe('task')
    expect(task.status).toBe('open')
    expect(task.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
  })

  it('spawnNext re-anchors on actual completion — duty cadences follow you, not the calendar', () => {
    const task = new Task({ title: 'Water the plants', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    task.complete(day('2026-06-08')) // three days late
    const next = task.spawnNext()
    expect(next.id).not.toBe(task.id)
    expect(next.title).toBe('Water the plants')
    expect(next.due?.value).toBe('2026-06-15') // 7 days after actual completion, not after due
    expect(next.status).toBe('open')
    expect(next.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
  })

  it('spawnNext carries project and possession links forward', () => {
    const projectId = Id.of('00000000-0000-4000-8000-000000001000')
    const task = new Task({ title: 'Filter', due: day('2026-06-05'), cadence: Cadence.of(1, 'months'), projectId })
    task.complete(day('2026-06-05'))
    expect(task.spawnNext().projectId).toBe(projectId)
  })

  it('spawnNext refuses non-recurring or non-completed tasks', () => {
    const oneOff = new Task({ title: 'File taxes', due: day('2026-06-05') })
    oneOff.complete(day('2026-06-05'))
    const open = new Task({ title: 'Recurring', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    for (const t of [oneOff, open]) {
      let caught: unknown
      try {
        t.spawnNext()
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('round-trips JSON with state, links, and unknown fields', () => {
    const task = new Task({
      id: Id.of('00000000-0000-4000-8000-000000001001'),
      title: 'Water the plants',
      due: day('2026-06-05'),
      cadence: Cadence.of(7, 'days'),
    })
    task.complete(day('2026-06-08'), Id.of('00000000-0000-4000-8000-000000000100'))
    const revived = Task.fromJSON({ ...task.toJSON(), futureField: 9 })
    expect(revived.status).toBe('done')
    expect(revived.completedOn?.value).toBe('2026-06-08')
    expect(revived.cadence?.equals(Cadence.of(7, 'days'))).toBe(true)
    expect(revived.fulfilledBy).toEqual(task.fulfilledBy)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(9)
    expect(Task.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'task', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open', projectId: 'nope' },
      { kind: 'appointment', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open' },
      { kind: 'task', id: '00000000-0000-4000-8000-000000001001', title: 'x', status: 'open', cadence: { n: 'two', unit: 'weeks' } },
    ]) {
      let caught: unknown
      try {
        Task.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/task.test.ts`
Expected: FAIL — cannot resolve `./task`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/plan/task.ts
import { Cadence } from '../core/cadence'
import type { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan'

/**
 * The plain to-do. Recurring tasks deliberately cover ALL recurring duties —
 * chores, asset upkeep, watering plants: there is exactly one recurrence-of-
 * duty mechanism in the system, and it re-anchors on actual completion (the
 * plants care when they were last watered, not what the calendar says).
 * `possessionId` is a bare Id — no vault import.
 */
export class Task extends Plan {
  readonly projectId?: Id
  readonly cadence?: Cadence
  readonly possessionId?: Id
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; title: string; due?: DayKey; projectId?: Id; cadence?: Cadence; possessionId?: Id },
    extra: Record<string, unknown> = {},
  ) {
    const { projectId, cadence, possessionId, ...base } = props
    super('task', base)
    if (projectId !== undefined) this.projectId = projectId
    if (cadence !== undefined) this.cadence = cadence
    if (possessionId !== undefined) this.possessionId = possessionId
    this.extra = extra
  }

  /** The successor of a completed recurring task, due `cadence.nextAfter(completedOn)`. */
  spawnNext(): Task {
    if (this.cadence === undefined || this.status !== 'done' || this.completedOn === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', 'only a completed recurring task spawns a successor')
    }
    return new Task({
      title: this.title,
      due: this.cadence.nextAfter(this.completedOn),
      cadence: this.cadence,
      ...(this.projectId !== undefined ? { projectId: this.projectId } : {}),
      ...(this.possessionId !== undefined ? { possessionId: this.possessionId } : {}),
    })
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      ...(this.projectId !== undefined ? { projectId: this.projectId } : {}),
      ...(this.cadence !== undefined ? { cadence: this.cadence.toJSON() } : {}),
      ...(this.possessionId !== undefined ? { possessionId: this.possessionId } : {}),
    }
  }

  static fromJSON(shape: unknown): Task {
    const base = parsePlanBase(shape, 'task')
    const { projectId, cadence, possessionId, ...extra } = base.rest
    if ((projectId !== undefined && typeof projectId !== 'string') || (possessionId !== undefined && typeof possessionId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a task shape')
    }
    let parsedProjectId: Id | undefined
    let parsedPossessionId: Id | undefined
    let parsedCadence: Cadence | undefined
    try {
      parsedProjectId = projectId !== undefined ? Id.of(projectId) : undefined
      parsedPossessionId = possessionId !== undefined ? Id.of(possessionId) : undefined
      parsedCadence = cadence !== undefined ? Cadence.fromJSON(cadence) : undefined
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError('MALFORMED_JSON', 'not a task shape')
      throw e
    }
    const task = new Task(
      {
        id: base.id,
        title: base.title,
        ...(base.due !== undefined ? { due: base.due } : {}),
        ...(parsedProjectId !== undefined ? { projectId: parsedProjectId } : {}),
        ...(parsedCadence !== undefined ? { cadence: parsedCadence } : {}),
        ...(parsedPossessionId !== undefined ? { possessionId: parsedPossessionId } : {}),
      },
      extra,
    )
    task.adoptBase(base)
    return task
  }

  /** Internal: apply restored state + meta from a parsed base. */
  private adoptBase(base: ReturnType<typeof parsePlanBase>): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/task.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/plan/task.ts packages/all-of-oyl/src/plan/task.test.ts
git commit -m "feat(all-of-oyl): Task with re-anchoring recurring respawn"
```

---

### Task 3: Appointment + PlannedMeal

**Files:**
- Create: `packages/all-of-oyl/src/plan/appointment.ts`
- Create: `packages/all-of-oyl/src/plan/planned-meal.ts`
- Test: `packages/all-of-oyl/src/plan/appointment.test.ts`
- Test: `packages/all-of-oyl/src/plan/planned-meal.test.ts`

- [ ] **Step 1: Write the failing Appointment test**

```ts
// packages/all-of-oyl/src/plan/appointment.test.ts
import { describe, expect, it } from 'vitest'
import { Appointment } from './appointment'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Appointment', () => {
  it('derives its due day from startsAt + explicit timezone', () => {
    // 01:30Z on June 3 is the evening of June 2 in New York
    const appt = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-03T01:30:00Z'), tz: 'America/New_York', durationMinutes: 45 })
    expect(appt.kind).toBe('appointment')
    expect(appt.due?.value).toBe('2026-06-02')
    expect(appt.durationMinutes).toBe(45)
    expect(appt.startsAt.toISOString()).toBe('2026-06-03T01:30:00.000Z')
  })

  it('defends startsAt against mutation and validates inputs', () => {
    const at = new Date('2026-06-03T15:00:00Z')
    const appt = new Appointment({ title: 'Dentist', startsAt: at, tz: 'America/New_York' })
    at.setUTCFullYear(1999)
    expect(appt.startsAt.getUTCFullYear()).toBe(2026)

    let caught1: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date(), tz: 'Bad/Zone' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_TIMEZONE')

    let caught2: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date(), tz: 'America/New_York', durationMinutes: -30 })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught3: unknown
    try {
      new Appointment({ title: 'Dentist', startsAt: new Date() }) // neither tz nor precomputed due
    } catch (e) {
      caught3 = e
    }
    expect((caught3 as DomainError)?.code).toBe('INVALID_TIMEZONE')
  })

  it('round-trips JSON without needing the timezone again', () => {
    const appt = new Appointment({
      id: Id.of('00000000-0000-4000-8000-000000001006'),
      title: 'Dentist',
      startsAt: new Date('2026-06-03T15:00:00Z'),
      tz: 'America/New_York',
      durationMinutes: 45,
    })
    const revived = Appointment.fromJSON({ ...appt.toJSON(), futureField: 10 })
    expect(revived.due?.value).toBe('2026-06-03')
    expect(revived.startsAt.toISOString()).toBe('2026-06-03T15:00:00.000Z')
    expect(revived.durationMinutes).toBe(45)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(10)
    expect(Appointment.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      Appointment.fromJSON({ kind: 'appointment', id: '00000000-0000-4000-8000-000000001006', title: 'x', status: 'open' }) // no startsAt
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/appointment.test.ts` → FAIL.

- [ ] **Step 2: Implement Appointment**

```ts
// packages/all-of-oyl/src/plan/appointment.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import type { Id } from '../core/id'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan'

/**
 * A plan with a specific instant: the calendar/time-blocking primitive. The
 * due day is derived at construction from startsAt + an explicit IANA
 * timezone (no hidden clock/zone); revival reuses the persisted due day.
 */
export class Appointment extends Plan {
  readonly durationMinutes?: number
  private readonly startsAtMs: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      title: string
      startsAt: Date
      durationMinutes?: number
      /** Required unless a precomputed due day is supplied (revival path). */
      tz?: string
      due?: DayKey
    },
    extra: Record<string, unknown> = {},
  ) {
    const { startsAt, durationMinutes, tz, due, ...base } = props
    const resolvedDue = due ?? (tz !== undefined ? DayKey.from(startsAt, tz) : undefined)
    if (resolvedDue === undefined) {
      throw new DomainError('INVALID_TIMEZONE', 'an appointment needs an explicit tz (or a precomputed due day when reviving)')
    }
    super('appointment', { ...base, due: resolvedDue })
    if (durationMinutes !== undefined) {
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        throw new DomainError('INVALID_QUANTITY', `durationMinutes must be positive, got ${durationMinutes}`)
      }
      this.durationMinutes = durationMinutes
    }
    this.startsAtMs = startsAt.getTime()
    this.extra = extra
  }

  /** Always a fresh Date — appointments are calendar facts. */
  get startsAt(): Date {
    return new Date(this.startsAtMs)
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      startsAt: this.startsAt.toISOString(),
      ...(this.durationMinutes !== undefined ? { durationMinutes: this.durationMinutes } : {}),
    }
  }

  static fromJSON(shape: unknown): Appointment {
    const base = parsePlanBase(shape, 'appointment')
    const { startsAt, durationMinutes, ...extra } = base.rest
    if (typeof startsAt !== 'string' || (durationMinutes !== undefined && typeof durationMinutes !== 'number')) {
      throw new DomainError('MALFORMED_JSON', 'not an appointment shape')
    }
    const at = new Date(startsAt)
    if (Number.isNaN(at.getTime()) || base.due === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not an appointment shape')
    }
    const appt = new Appointment(
      {
        id: base.id,
        title: base.title,
        startsAt: at,
        due: base.due,
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
      },
      extra,
    )
    appt.adoptBase(base)
    return appt
  }

  private adoptBase(base: ReturnType<typeof parsePlanBase>): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }
}
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/appointment.test.ts` → PASS.

- [ ] **Step 3: Write the failing PlannedMeal test**

```ts
// packages/all-of-oyl/src/plan/planned-meal.test.ts
import { describe, expect, it } from 'vitest'
import { PlannedMeal } from './planned-meal'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const foodId = Id.of('00000000-0000-4000-8000-000000000031')

describe('PlannedMeal', () => {
  it('is a plan due on its day, referencing a food with servings', () => {
    const meal = new PlannedMeal({ title: 'Oatmeal breakfast', day: day('2026-06-02'), food: { id: foodId }, servings: 1.5 })
    expect(meal.kind).toBe('planned-meal')
    expect(meal.due?.value).toBe('2026-06-02')
    expect(meal.day.value).toBe('2026-06-02')
    expect(meal.foodId).toBe(foodId)
    expect(meal.servings).toBe(1.5)
  })

  it('defaults servings to 1 and validates', () => {
    expect(new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId } }).servings).toBe(1)
    for (const servings of [0, -1, NaN]) {
      let caught: unknown
      try {
        new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId }, servings })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('rejects conflicting food provenance', () => {
    let caught: unknown
    try {
      new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-02'), food: { id: foodId }, foodId: Id.of('00000000-0000-4000-8000-000000000099') })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_ID')
  })

  it('round-trips JSON and can be fulfilled by a consumption', () => {
    const meal = new PlannedMeal({ id: Id.of('00000000-0000-4000-8000-000000001007'), title: 'Oatmeal breakfast', day: day('2026-06-02'), food: { id: foodId } })
    meal.complete(day('2026-06-02'), Id.of('00000000-0000-4000-8000-000000000101'))
    const revived = PlannedMeal.fromJSON({ ...meal.toJSON(), futureField: 11 })
    expect(revived.status).toBe('done')
    expect(revived.foodId).toBe(foodId)
    expect(revived.fulfilledBy).toEqual(meal.fulfilledBy)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(11)
    expect(PlannedMeal.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'planned-meal', id: '00000000-0000-4000-8000-000000001007', title: 'x', status: 'open' }, // no due/foodId/servings
      { kind: 'planned-meal', id: '00000000-0000-4000-8000-000000001007', title: 'x', status: 'open', due: '2026-06-02', servings: 1, foodId: 'nope' },
    ]) {
      let caught: unknown
      try {
        PlannedMeal.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/planned-meal.test.ts` → FAIL.

- [ ] **Step 4: Implement PlannedMeal**

```ts
// packages/all-of-oyl/src/plan/planned-meal.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { Plan, parsePlanBase, planBaseJSON } from '../core/plan'

/**
 * What you intend to eat on a day; fulfilled by a Consumption. References a
 * Food by id (a full Food works — structural). The grocery list aggregates
 * servings per food id across a range's planned meals.
 */
export class PlannedMeal extends Plan {
  readonly day: DayKey
  readonly foodId: Id
  readonly servings: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      title: string
      day: DayKey
      /** A full Food works; reviving passes the stored snapshot id. */
      food?: { id: Id }
      foodId?: Id
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { day, food, foodId, servings = 1, ...base } = props
    super('planned-meal', { ...base, due: day })
    if (food !== undefined && foodId !== undefined && food.id !== foodId) {
      throw new DomainError('INVALID_ID', `conflicting food provenance: ${food.id} vs ${foodId}`)
    }
    const resolved = food?.id ?? foodId
    if (resolved === undefined) {
      throw new DomainError('INVALID_ID', 'a planned meal references a food')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    this.day = day
    this.foodId = resolved
    this.servings = servings
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...planBaseJSON(this),
      foodId: this.foodId,
      servings: this.servings,
    }
  }

  static fromJSON(shape: unknown): PlannedMeal {
    const base = parsePlanBase(shape, 'planned-meal')
    const { foodId, servings, ...extra } = base.rest
    if (typeof foodId !== 'string' || typeof servings !== 'number' || base.due === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a planned-meal shape')
    }
    let parsedFoodId: Id
    try {
      parsedFoodId = Id.of(foodId)
    } catch {
      throw new DomainError('MALFORMED_JSON', `planned-meal has a malformed foodId: "${foodId}"`)
    }
    const meal = new PlannedMeal(
      { id: base.id, title: base.title, day: base.due, foodId: parsedFoodId, servings },
      extra,
    )
    meal.adoptBase(base)
    return meal
  }

  private adoptBase(base: ReturnType<typeof parsePlanBase>): void {
    this.restoreState(base.state)
    if (base.meta !== undefined) this.meta = base.meta
  }
}
```

- [ ] **Step 5: Run both + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/plan/appointment.ts packages/all-of-oyl/src/plan/appointment.test.ts packages/all-of-oyl/src/plan/planned-meal.ts packages/all-of-oyl/src/plan/planned-meal.test.ts
git commit -m "feat(all-of-oyl): Appointment and PlannedMeal plans"
```

---

### Task 4: Project + DayPlan

Two non-Plan persistables: a named group of tasks, and the per-day ordered slot list.

**Files:**
- Create: `packages/all-of-oyl/src/plan/project.ts`
- Create: `packages/all-of-oyl/src/plan/day-plan.ts`
- Test: `packages/all-of-oyl/src/plan/project.test.ts`
- Test: `packages/all-of-oyl/src/plan/day-plan.test.ts`

- [ ] **Step 1: Write the failing Project test**

(Note: `Project.progress(planner)` is tested in Task 5 alongside the Planner; here only construction + serialization.)

```ts
// packages/all-of-oyl/src/plan/project.test.ts
import { describe, expect, it } from 'vitest'
import { Project } from './project'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Project', () => {
  it('constructs with a name and optional area', () => {
    const project = new Project({ name: 'Spring reset', areaId: Id.of('00000000-0000-4000-8000-000000000010') })
    expect(project.name).toBe('Spring reset')
    expect(Id.of(project.id)).toBe(project.id)
  })

  it('rejects an empty name', () => {
    let caught: unknown
    try {
      new Project({ name: '' })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000001000', name: 'Spring reset', areaId: '00000000-0000-4000-8000-000000000010', futureField: 12 }
    expect(Project.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'x' }, { id: 'nope', name: 'x' }]) {
      let caught: unknown
      try {
        Project.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/project.test.ts` → FAIL.

- [ ] **Step 2: Implement Project**

```ts
// packages/all-of-oyl/src/plan/project.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { Task } from './task'
import type { Planner } from './planner'

/** A named group of tasks. Tasks point at it via projectId. */
export class Project {
  readonly id: Id
  readonly name: string
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; areaId?: Id }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  /** done ÷ (done + open) among this project's tasks; canceled excluded; undefined when it has none. */
  progress(planner: Planner): number | undefined {
    const tasks = planner.all().filter((p): p is Task => p instanceof Task && p.projectId === this.id)
    const done = tasks.filter((t) => t.status === 'done').length
    const open = tasks.filter((t) => t.status === 'open').length
    const total = done + open
    return total === 0 ? undefined : done / total
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      ...(this.areaId !== undefined ? { areaId: this.areaId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Project {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Project shape')
    }
    const { id, name, areaId, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || (areaId !== undefined && typeof areaId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a Project shape')
    }
    let parsedId: Id
    let parsedAreaId: Id | undefined
    try {
      parsedId = Id.of(id)
      parsedAreaId = areaId !== undefined ? Id.of(areaId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', 'Project has a malformed id')
    }
    const project = new Project({ id: parsedId, name, ...(parsedAreaId !== undefined ? { areaId: parsedAreaId } : {}) }, extra)
    if (meta !== undefined) project.meta = metaFromJSON(meta)
    return project
  }
}
```

(The `import type { Planner }` is type-only and `planner.ts` will not import `project.ts`, so there is no runtime cycle. `planner.ts` does not exist yet — TypeScript will flag the missing module until Task 5; to keep this task green standalone, create the Planner stub in the SAME commit as shown in Step 4.)

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/project.test.ts` → still FAIL to compile (missing `./planner`). Proceed to Step 3 and 4; the suite goes green at the end of Step 4.

- [ ] **Step 3: Write the failing DayPlan test**

```ts
// packages/all-of-oyl/src/plan/day-plan.test.ts
import { describe, expect, it } from 'vitest'
import { DayPlan, type DayPlanSlot } from './day-plan'
import { DayKey } from '../core/day-key'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const pid = (n: number) => Id.of(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)

describe('DayPlan', () => {
  it('holds ordered, optionally time-boxed slots for one day', () => {
    const plan = new DayPlan({
      day: day('2026-06-01'),
      slots: [
        { planId: pid(1003), start: '09:00', end: '10:00' },
        { planId: pid(1006) },
      ],
    })
    expect(plan.day.value).toBe('2026-06-01')
    expect(plan.slots).toHaveLength(2)
    expect(plan.slots[0]?.start).toBe('09:00')
    expect(Id.of(plan.id)).toBe(plan.id)
  })

  it('validates time boxes: format, end-requires-start, end-after-start', () => {
    const cases: [{ planId: Id; start?: string; end?: string }, string][] = [
      [{ planId: pid(1), start: '9:00' }, 'INVALID_QUANTITY'],
      [{ planId: pid(1), start: '24:00' }, 'INVALID_QUANTITY'],
      [{ planId: pid(1), end: '10:00' }, 'INVALID_RANGE'],
      [{ planId: pid(1), start: '10:00', end: '10:00' }, 'INVALID_RANGE'],
      [{ planId: pid(1), start: '11:00', end: '10:00' }, 'INVALID_RANGE'],
    ]
    for (const [slot, code] of cases) {
      let caught: unknown
      try {
        new DayPlan({ day: day('2026-06-01'), slots: [slot] })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe(code)
    }
  })

  it('slots are defensively copied from the input', () => {
    const slots: DayPlanSlot[] = [{ planId: pid(1003), start: '09:00' }]
    const plan = new DayPlan({ day: day('2026-06-01'), slots })
    slots.pop()
    expect(plan.slots).toHaveLength(1)
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const plan = new DayPlan({
      id: Id.of('00000000-0000-4000-8000-000000001010'),
      day: day('2026-06-01'),
      slots: [{ planId: pid(1003), start: '09:00', end: '10:00' }],
    })
    const revived = DayPlan.fromJSON({ ...plan.toJSON(), futureField: 13 })
    expect(revived.day.value).toBe('2026-06-01')
    expect(revived.slots[0]?.end).toBe('10:00')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(13)
    expect(DayPlan.fromJSON(revived.toJSON()).toJSON()).toEqual(revived.toJSON())
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      null,
      { id: '00000000-0000-4000-8000-000000001010', day: '2026-06-01' }, // no slots
      { id: '00000000-0000-4000-8000-000000001010', day: 'garbage', slots: [] },
      { id: '00000000-0000-4000-8000-000000001010', day: '2026-06-01', slots: [{ planId: 'nope' }] },
    ]) {
      let caught: unknown
      try {
        DayPlan.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/day-plan.test.ts` → FAIL.

- [ ] **Step 4: Implement DayPlan and the Planner stub**

```ts
// packages/all-of-oyl/src/plan/day-plan.ts
import { DayKey } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** "HH:MM", 00:00–23:59, local to the plan's day — a time box belongs to the day, not to an instant. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export type DayPlanSlot = { planId: Id; start?: string; end?: string }

/**
 * The day-by-day planning primitive: at most one per day, an ordered list of
 * slots referencing plans, optionally time-boxed. The user's edited version
 * of the derived agenda. Slots referencing canceled or missing plans are
 * skipped by reading queries (kept in storage — the plan may be restored).
 */
export class DayPlan {
  readonly id: Id
  readonly day: DayKey
  readonly slots: readonly DayPlanSlot[]
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; day: DayKey; slots: readonly DayPlanSlot[] }, extra: Record<string, unknown> = {}) {
    for (const slot of props.slots) {
      if (slot.start !== undefined && !TIME_RE.test(slot.start)) {
        throw new DomainError('INVALID_QUANTITY', `not a valid HH:MM time: "${slot.start}"`)
      }
      if (slot.end !== undefined) {
        if (slot.start === undefined) {
          throw new DomainError('INVALID_RANGE', 'a slot end requires a start')
        }
        if (!TIME_RE.test(slot.end)) {
          throw new DomainError('INVALID_QUANTITY', `not a valid HH:MM time: "${slot.end}"`)
        }
        if (slot.end <= slot.start) {
          throw new DomainError('INVALID_RANGE', `slot end ${slot.end} must follow start ${slot.start}`)
        }
      }
    }
    this.id = props.id ?? Id.create()
    this.day = props.day
    this.slots = props.slots.map((s) => ({ ...s }))
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      day: this.day.value,
      slots: this.slots.map((s) => ({
        planId: s.planId,
        ...(s.start !== undefined ? { start: s.start } : {}),
        ...(s.end !== undefined ? { end: s.end } : {}),
      })),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): DayPlan {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
    }
    const { id, day, slots, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof day !== 'string' || !Array.isArray(slots)) {
      throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
    }
    try {
      const parsedSlots: DayPlanSlot[] = slots.map((raw: unknown) => {
        const s = raw as { planId?: unknown; start?: unknown; end?: unknown }
        if (typeof s?.planId !== 'string' || (s.start !== undefined && typeof s.start !== 'string') || (s.end !== undefined && typeof s.end !== 'string')) {
          throw new DomainError('MALFORMED_JSON', 'bad DayPlan slot')
        }
        return {
          planId: Id.of(s.planId),
          ...(s.start !== undefined ? { start: s.start } : {}),
          ...(s.end !== undefined ? { end: s.end } : {}),
        }
      })
      const plan = new DayPlan({ id: Id.of(id), day: DayKey.of(day), slots: parsedSlots }, extra)
      if (meta !== undefined) plan.meta = metaFromJSON(meta)
      return plan
    } catch (e) {
      if (e instanceof DomainError) throw new DomainError('MALFORMED_JSON', 'not a DayPlan shape')
      throw e
    }
  }
}
```

And the minimal `planner.ts` stub so `project.ts` compiles (Task 5 replaces it — same file, full implementation):

```ts
// packages/all-of-oyl/src/plan/planner.ts
import type { Plan } from '../core/plan'

/** Stub — full implementation lands in the next task. */
export class Planner {
  private readonly plans: Plan[] = []

  all(): readonly Plan[] {
    return [...this.plans]
  }
}
```

- [ ] **Step 5: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan` → PASS (project + day-plan tests green).
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/plan/project.ts packages/all-of-oyl/src/plan/project.test.ts packages/all-of-oyl/src/plan/day-plan.ts packages/all-of-oyl/src/plan/day-plan.test.ts packages/all-of-oyl/src/plan/planner.ts
git commit -m "feat(all-of-oyl): Project and DayPlan persistables"
```

---

### Task 5: Planner root

The in-memory aggregate: strict adds / idempotent removes (mirroring `Journal`), due queries, completion with recurring respawn, completion rate, agenda/day-plan/schedule views, grocery list.

**Files:**
- Modify: `packages/all-of-oyl/src/plan/planner.ts` (replace the stub)
- Test: `packages/all-of-oyl/src/plan/planner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/plan/planner.test.ts
import { describe, expect, it } from 'vitest'
import { Planner } from './planner'
import { Task } from './task'
import { Appointment } from './appointment'
import { PlannedMeal } from './planned-meal'
import { Project } from './project'
import { DayPlan } from './day-plan'
import { Cadence } from '../core/cadence'
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const NY = 'America/New_York'
const foodId = Id.of('00000000-0000-4000-8000-000000000031')

describe('Planner', () => {
  it('strict adds, idempotent removes, lookup', () => {
    const planner = new Planner()
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    planner.add(task)
    expect(planner.get(task.id)).toBe(task)
    let caught: unknown
    try {
      planner.add(task)
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('DUPLICATE_ID')
    planner.remove(task.id)
    planner.remove(task.id) // no-op
    expect(planner.get(task.id)).toBeUndefined()
    expect(planner.all()).toHaveLength(0)
  })

  it('dueOn / overdue / upcoming consider only open plans', () => {
    const planner = new Planner()
    const today = new Task({ title: 'Today', due: day('2026-06-05') })
    const late = new Task({ title: 'Late', due: day('2026-06-01') })
    const soon = new Task({ title: 'Soon', due: day('2026-06-08') })
    const doneLate = new Task({ title: 'Done late', due: day('2026-06-01') })
    doneLate.complete(day('2026-06-02'))
    const canceled = new Task({ title: 'Canceled', due: day('2026-06-05') })
    canceled.cancel()
    const undated = new Task({ title: 'Someday' })
    for (const p of [today, late, soon, doneLate, canceled, undated]) planner.add(p)

    expect(planner.dueOn(day('2026-06-05')).map((p) => p.title)).toEqual(['Today'])
    expect(planner.overdue(day('2026-06-05')).map((p) => p.title)).toEqual(['Late'])
    expect(planner.upcoming(range('2026-06-05', '2026-06-10')).map((p) => p.title)).toEqual(['Today', 'Soon'])
  })

  it('complete() fulfills and respawns recurring tasks via the planner', () => {
    const planner = new Planner()
    const chore = new Task({ title: 'Water the plants', due: day('2026-06-05'), cadence: Cadence.of(7, 'days') })
    planner.add(chore)
    const entryId = Id.create()
    const spawned = planner.complete(chore.id, day('2026-06-08'), entryId)
    expect(chore.status).toBe('done')
    expect(chore.fulfilledBy).toEqual([entryId])
    expect(spawned).toBeDefined()
    expect(spawned?.due?.value).toBe('2026-06-15') // re-anchored on actual completion
    expect(planner.get(spawned!.id)).toBe(spawned)
    // a late respawn can be born overdue — honest, not a bug
    expect(planner.overdue(day('2026-06-20')).map((p) => p.id)).toContain(spawned!.id)

    const oneOff = new Task({ title: 'File taxes', due: day('2026-06-05') })
    planner.add(oneOff)
    expect(planner.complete(oneOff.id, day('2026-06-05'))).toBeUndefined()

    let caught: unknown
    try {
      planner.complete(Id.create(), day('2026-06-05'))
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('ILLEGAL_TRANSITION')
  })

  it('completionRate counts done/(done+open) among plans due in range; undefined when none', () => {
    const planner = new Planner()
    expect(planner.completionRate(range('2026-06-01', '2026-06-07'))).toBeUndefined()
    const a = new Task({ title: 'a', due: day('2026-06-02') })
    const b = new Task({ title: 'b', due: day('2026-06-03') })
    const c = new Task({ title: 'c', due: day('2026-06-04') })
    const x = new Task({ title: 'x', due: day('2026-06-04') })
    x.cancel()
    for (const p of [a, b, c, x]) planner.add(p)
    planner.complete(a.id, day('2026-06-02'))
    expect(planner.completionRate(range('2026-06-01', '2026-06-07'))).toBeCloseTo(1 / 3)
  })

  it('project progress reads its tasks through the planner', () => {
    const planner = new Planner()
    const project = new Project({ name: 'Spring reset' })
    const done = new Task({ title: 'd', due: day('2026-06-02'), projectId: project.id })
    const open = new Task({ title: 'o', due: day('2026-06-03'), projectId: project.id })
    const unrelated = new Task({ title: 'u', due: day('2026-06-03') })
    for (const p of [done, open, unrelated]) planner.add(p)
    planner.complete(done.id, day('2026-06-02'))
    expect(project.progress(planner)).toBeCloseTo(0.5)
    expect(new Project({ name: 'Empty' }).progress(planner)).toBeUndefined()
  })

  it('agendaFor orders appointments by startsAt, then tasks, then meals; canceled excluded', () => {
    const planner = new Planner()
    const lateAppt = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-05T19:00:00Z'), tz: NY })
    const earlyAppt = new Appointment({ title: 'Standup', startsAt: new Date('2026-06-05T13:00:00Z'), tz: NY })
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    const meal = new PlannedMeal({ title: 'Oatmeal', day: day('2026-06-05'), food: { id: foodId } })
    const canceled = new Task({ title: 'Nope', due: day('2026-06-05') })
    canceled.cancel()
    for (const p of [lateAppt, task, meal, earlyAppt, canceled]) planner.add(p)
    expect(planner.agendaFor(day('2026-06-05')).map((p) => p.title)).toEqual(['Standup', 'Dentist', 'File taxes', 'Oatmeal'])
  })

  it('dayPlanFor returns the stored plan or a derived default; scheduleFor skips stale slots', () => {
    const planner = new Planner()
    const task = new Task({ title: 'File taxes', due: day('2026-06-05') })
    const ghost = new Task({ title: 'Ghost', due: day('2026-06-05') })
    planner.add(task)
    planner.add(ghost)

    // derived default: ordered slots, no time boxes, not stored
    const derived = planner.dayPlanFor(day('2026-06-05'))
    expect(derived.slots.map((s) => s.planId)).toEqual([task.id, ghost.id])

    const stored = new DayPlan({
      day: day('2026-06-05'),
      slots: [
        { planId: ghost.id, start: '09:00', end: '10:00' },
        { planId: task.id, start: '10:00', end: '11:00' },
      ],
    })
    planner.setDayPlan(stored)
    expect(planner.dayPlanFor(day('2026-06-05'))).toBe(stored)

    // replacing for the same day
    const replacement = new DayPlan({ day: day('2026-06-05'), slots: [{ planId: task.id }] })
    planner.setDayPlan(replacement)
    expect(planner.dayPlanFor(day('2026-06-05'))).toBe(replacement)

    // stale slots are skipped by the reading query but kept in storage
    planner.setDayPlan(stored)
    planner.remove(ghost.id)
    const schedule = planner.scheduleFor(day('2026-06-05'))
    expect(schedule.map((s) => s.plan.id)).toEqual([task.id])
    expect(schedule[0]?.start).toBe('10:00')
    expect(planner.dayPlanFor(day('2026-06-05')).slots).toHaveLength(2) // storage untouched
  })

  it('groceryList aggregates servings per food across open planned meals in range', () => {
    const planner = new Planner()
    const otherFood = Id.of('00000000-0000-4000-8000-000000000034')
    planner.add(new PlannedMeal({ title: 'Oatmeal Mon', day: day('2026-06-01'), food: { id: foodId }, servings: 1.5 }))
    planner.add(new PlannedMeal({ title: 'Oatmeal Tue', day: day('2026-06-02'), food: { id: foodId } }))
    planner.add(new PlannedMeal({ title: 'Bowl Tue', day: day('2026-06-02'), food: { id: otherFood }, servings: 2 }))
    planner.add(new PlannedMeal({ title: 'Next week', day: day('2026-06-09'), food: { id: foodId } }))
    const eaten = new PlannedMeal({ title: 'Eaten', day: day('2026-06-01'), food: { id: foodId } })
    planner.add(eaten)
    planner.complete(eaten.id, day('2026-06-01'))

    const list = planner.groceryList(range('2026-06-01', '2026-06-07'))
    expect(list.get(foodId)?.amount).toBe(2.5)
    expect(list.get(foodId)?.unit).toBe('servings')
    expect(list.get(otherFood)?.amount).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan/planner.test.ts`
Expected: FAIL — the stub lacks everything beyond `all()`.

- [ ] **Step 3: Implement the Planner (replace the stub file entirely)**

```ts
// packages/all-of-oyl/src/plan/planner.ts
import type { DayKey } from '../core/day-key'
import type { DayRange } from '../core/day-range'
import { DomainError } from '../core/domain-error'
import type { Id } from '../core/id'
import type { Plan } from '../core/plan'
import { Quantity } from '../core/quantity'
import { Appointment } from './appointment'
import { DayPlan, type DayPlanSlot } from './day-plan'
import { PlannedMeal } from './planned-meal'
import { Task } from './task'

export type ScheduledSlot = { plan: Plan; start?: string; end?: string }

/**
 * One person's record of what's supposed to happen. A plain in-memory
 * aggregate (apps hydrate it from repositories), mirroring Journal: strict
 * adds, idempotent removes. Completion routes through the planner so
 * recurring tasks respawn into it.
 */
export class Planner {
  /** Insertion order is the documented secondary order for queries. */
  private readonly plans: Plan[] = []
  private readonly byId = new Map<Id, Plan>()
  private readonly dayPlans = new Map<string, DayPlan>()

  add(plan: Plan): void {
    if (this.byId.has(plan.id)) {
      throw new DomainError('DUPLICATE_ID', `plan already in planner: ${plan.id}`)
    }
    this.byId.set(plan.id, plan)
    this.plans.push(plan)
  }

  /** Idempotent — removing a missing id is a no-op. */
  remove(id: Id): void {
    if (!this.byId.delete(id)) return
    const index = this.plans.findIndex((p) => p.id === id)
    this.plans.splice(index, 1)
  }

  get(id: Id): Plan | undefined {
    return this.byId.get(id)
  }

  all(): readonly Plan[] {
    return [...this.plans]
  }

  /** Open plans due exactly on `day`. */
  dueOn(day: DayKey): readonly Plan[] {
    return this.plans.filter((p) => p.status === 'open' && p.due !== undefined && p.due.equals(day))
  }

  /** Open plans whose due day has passed. */
  overdue(day: DayKey): readonly Plan[] {
    return this.plans.filter((p) => p.status === 'open' && p.due !== undefined && p.due.compare(day) < 0)
  }

  /** Open plans due in the range, ordered by due day then insertion. */
  upcoming(range: DayRange): readonly Plan[] {
    return this.plans
      .filter((p) => p.status === 'open' && p.due !== undefined && range.contains(p.due))
      .sort((a, b) => (a.due as DayKey).compare(b.due as DayKey))
  }

  /**
   * Complete a plan through the planner. If it was a recurring task, the
   * successor (due cadence.nextAfter(completedOn) — re-anchored on actual
   * completion) is added and returned; it can be born overdue, which is
   * honest. Returns undefined otherwise.
   */
  complete(planId: Id, on: DayKey, entryId?: Id): Task | undefined {
    const plan = this.byId.get(planId)
    if (plan === undefined) {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot complete an unknown plan: ${planId}`)
    }
    plan.complete(on, entryId)
    if (plan instanceof Task && plan.cadence !== undefined) {
      const next = plan.spawnNext()
      this.add(next)
      return next
    }
    return undefined
  }

  /** done ÷ (done + open) among plans due in the range; canceled excluded; undefined when none. */
  completionRate(range: DayRange): number | undefined {
    const inRange = this.plans.filter((p) => p.due !== undefined && range.contains(p.due))
    const done = inRange.filter((p) => p.status === 'done').length
    const open = inRange.filter((p) => p.status === 'open').length
    const total = done + open
    return total === 0 ? undefined : done / total
  }

  /** The derived default agenda: appointments by startsAt, then tasks, then planned meals. Canceled plans excluded. */
  agendaFor(day: DayKey): readonly Plan[] {
    const today = this.plans.filter((p) => p.status !== 'canceled' && p.due !== undefined && p.due.equals(day))
    const appointments = today
      .filter((p): p is Appointment => p instanceof Appointment)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    const tasks = today.filter((p) => p instanceof Task)
    const meals = today.filter((p) => p instanceof PlannedMeal)
    const rest = today.filter((p) => !(p instanceof Appointment) && !(p instanceof Task) && !(p instanceof PlannedMeal))
    return [...appointments, ...tasks, ...meals, ...rest]
  }

  /** At most one DayPlan per day; setting replaces (it's the user's edited version). */
  setDayPlan(dayPlan: DayPlan): void {
    this.dayPlans.set(dayPlan.day.value, dayPlan)
  }

  /** The stored DayPlan for the day, or a derived default (agenda order, no time boxes; not stored). */
  dayPlanFor(day: DayKey): DayPlan {
    const stored = this.dayPlans.get(day.value)
    if (stored !== undefined) return stored
    const slots: DayPlanSlot[] = this.agendaFor(day).map((p) => ({ planId: p.id }))
    return new DayPlan({ day, slots })
  }

  /** The consumable day view: slots resolved against live plans; canceled/missing skipped (storage untouched). */
  scheduleFor(day: DayKey): readonly ScheduledSlot[] {
    const resolved: ScheduledSlot[] = []
    for (const slot of this.dayPlanFor(day).slots) {
      const plan = this.byId.get(slot.planId)
      if (plan === undefined || plan.status === 'canceled') continue
      resolved.push({
        plan,
        ...(slot.start !== undefined ? { start: slot.start } : {}),
        ...(slot.end !== undefined ? { end: slot.end } : {}),
      })
    }
    return resolved
  }

  /** Servings per food id across OPEN planned meals due in the range. */
  groceryList(range: DayRange): ReadonlyMap<Id, Quantity> {
    const list = new Map<Id, Quantity>()
    for (const plan of this.plans) {
      if (!(plan instanceof PlannedMeal) || plan.status !== 'open' || !range.contains(plan.day)) continue
      const existing = list.get(plan.foodId)
      const addition = Quantity.of(plan.servings, 'servings')
      list.set(plan.foodId, existing === undefined ? addition : existing.add(addition))
    }
    return list
  }
}
```

- [ ] **Step 4: Run + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/plan` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/plan/planner.ts packages/all-of-oyl/src/plan/planner.test.ts
git commit -m "feat(all-of-oyl): Planner root with respawn, agenda, and grocery list"
```

---

### Task 6: `revivePlan` + barrel

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Test: `packages/all-of-oyl/src/index.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `packages/all-of-oyl/src/index.test.ts` (extend the import from './index' with `Appointment, PlannedMeal, Task, revivePlan`):

```ts
describe('revivePlan', () => {
  it('dispatches every plan kind to the right class', () => {
    const task = new Task({ title: 'File taxes' })
    const appt = new Appointment({ title: 'Dentist', startsAt: when, tz: 'America/New_York' })
    const meal = new PlannedMeal({ title: 'Oatmeal', day: DayKey.of('2026-06-02'), foodId: Id.of('00000000-0000-4000-8000-000000000031') })
    expect(revivePlan(task.toJSON())).toBeInstanceOf(Task)
    expect(revivePlan(appt.toJSON())).toBeInstanceOf(Appointment)
    expect(revivePlan(meal.toJSON())).toBeInstanceOf(PlannedMeal)
  })

  it('throws UNKNOWN_KIND for unregistered kinds, including prototype keys', () => {
    for (const shape of [{ kind: 'reminder' }, { kind: 'toString' }, { kind: 'constructor' }, {}, null, 42]) {
      let caught: unknown
      try {
        revivePlan(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('UNKNOWN_KIND')
    }
  })
})
```

Also extend the file's other imports if missing: `DayKey` and `Id` from their core modules (check the file's existing imports first).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/index.test.ts`
Expected: FAIL — `revivePlan` (and plan classes) not exported.

- [ ] **Step 3: Extend the barrel**

In `packages/all-of-oyl/src/index.ts`, add the module exports (with the other export blocks, before the reviver section):

```ts
export { Task } from './plan/task'
export { Appointment } from './plan/appointment'
export { PlannedMeal } from './plan/planned-meal'
export { Project } from './plan/project'
export { DayPlan, type DayPlanSlot } from './plan/day-plan'
export { Planner, type ScheduledSlot } from './plan/planner'
```

And in the reviver section, add imports + the dispatcher (mirroring `reviveEntry` exactly, including `Object.hasOwn`):

```ts
import type { Plan } from './core/plan'
import { Task } from './plan/task'
import { Appointment } from './plan/appointment'
import { PlannedMeal } from './plan/planned-meal'

const PLAN_REVIVERS: Readonly<Record<string, (shape: unknown) => Plan>> = {
  task: Task.fromJSON,
  appointment: Appointment.fromJSON,
  'planned-meal': PlannedMeal.fromJSON,
}

/** Revive a heterogeneous plan shape by its kind discriminant. Unknown kinds throw — louder and safer than silently dropping a user's data. */
export function revivePlan(shape: unknown): Plan {
  const kind = (shape as { kind?: unknown } | null)?.kind
  const revive = typeof kind === 'string' && Object.hasOwn(PLAN_REVIVERS, kind) ? PLAN_REVIVERS[kind] : undefined
  if (!revive) {
    throw new DomainError('UNKNOWN_KIND', `unknown plan kind: ${JSON.stringify(kind)}`)
  }
  return revive(shape)
}
```

- [ ] **Step 4: Run + gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/index.ts packages/all-of-oyl/src/index.test.ts
git commit -m "feat(all-of-oyl): revivePlan dispatcher + phase 4 barrel exports"
```

---

### Task 7: Fixtures — builders + Avery's plans

**Files:**
- Modify: `packages/all-of-oyl/src/fixtures/builders.ts`
- Modify: `packages/all-of-oyl/src/fixtures/seed.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (builders export)
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `fixtures.test.ts` (extend imports: `makeAppointment, makeDayPlan, makePlannedMeal, makeProject, makeTask` from `./builders`; `revivePlan` from `../index`; `Planner` from `../plan/planner`; `Project` from `../plan/project`; `DayPlan` from `../plan/day-plan`; `Task` from `../plan/task`):

```ts
  it('phase 4 builders produce valid objects with overridable fields', () => {
    expect(makeTask().title.length).toBeGreaterThan(0)
    expect(makeTask({ title: 'Custom' }).title).toBe('Custom')
    expect(makeProject().name).toBe('Spring reset')
    expect(makeAppointment().kind).toBe('appointment')
    expect(makePlannedMeal().servings).toBe(1)
    expect(makeDayPlan().slots.length).toBeGreaterThan(0)
  })

  it('seed plans revive, hydrate a Planner, and answer real questions', () => {
    expect(seed.plans.length).toBeGreaterThanOrEqual(7)
    expect(seed.projects).toHaveLength(1)
    expect(seed.dayPlans).toHaveLength(1)

    const planner = new Planner()
    for (const shape of seed.plans) planner.add(revivePlan(shape))
    planner.setDayPlan(DayPlan.fromJSON(seed.dayPlans[0]))
    const project = Project.fromJSON(seed.projects[0])

    // the showcase: a recurring chore completed late, with its respawned successor
    const doneChore = planner.all().find((p) => p instanceof Task && p.cadence !== undefined && p.status === 'done') as Task
    expect(doneChore).toBeDefined()
    const successor = planner.all().find((p) => p instanceof Task && p.cadence !== undefined && p.status === 'open' && p.title === doneChore.title) as Task
    expect(successor).toBeDefined()
    expect(successor.due?.value).toBe(doneChore.cadence!.nextAfter(doneChore.completedOn!).value)

    // taxes are overdue today
    expect(planner.overdue(FIXTURE_TODAY).map((p) => p.title)).toContain('File taxes')

    // the project is half done
    expect(project.progress(planner)).toBeCloseTo(0.5)

    // groceries for the coming week include the planned oatmeal
    const nextWeek = DayRange.of(FIXTURE_TODAY, FIXTURE_TODAY.addDays(6))
    expect(planner.groceryList(nextWeek).get(fixtureId(31))?.amount).toBeGreaterThanOrEqual(2)

    // the stored day plan wins for today; schedule resolves its live slots
    expect(planner.dayPlanFor(FIXTURE_TODAY).slots.length).toBeGreaterThan(0)
    expect(planner.scheduleFor(FIXTURE_TODAY).length).toBeGreaterThan(0)

    // serialization idempotence
    for (const shape of seed.plans) {
      expect(revivePlan(revivePlan(shape).toJSON()).toJSON()).toEqual(revivePlan(shape).toJSON())
    }
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — `makeTask` not exported.

- [ ] **Step 3: Extend builders**

Append to `packages/all-of-oyl/src/fixtures/builders.ts` (extend imports: `Task` from `../plan/task`, `Appointment` from `../plan/appointment`, `PlannedMeal` from `../plan/planned-meal`, `Project` from `../plan/project`, `DayPlan, type DayPlanSlot` from `../plan/day-plan`, `Cadence` from `../core/cadence`, `DayKey` from `../core/day-key`, and `FIXTURE_TODAY` is already imported via `./constants` — verify and add if missing):

```ts
export function makeTask(
  overrides: { id?: Id; title?: string; due?: DayKey; projectId?: Id; cadence?: Cadence; possessionId?: Id } = {},
): Task {
  return new Task({
    id: overrides.id ?? fixtureId(1001),
    title: overrides.title ?? 'Water the plants',
    due: overrides.due ?? FIXTURE_TODAY.addDays(1),
    ...(overrides.projectId !== undefined ? { projectId: overrides.projectId } : {}),
    ...(overrides.cadence !== undefined ? { cadence: overrides.cadence } : {}),
    ...(overrides.possessionId !== undefined ? { possessionId: overrides.possessionId } : {}),
  })
}

export function makeProject(overrides: { id?: Id; name?: string; areaId?: Id } = {}): Project {
  return new Project({
    id: overrides.id ?? fixtureId(1000),
    name: overrides.name ?? 'Spring reset',
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : {}),
  })
}

export function makeAppointment(
  overrides: { id?: Id; title?: string; startsAt?: Date; durationMinutes?: number; tz?: string } = {},
): Appointment {
  return new Appointment({
    id: overrides.id ?? fixtureId(1006),
    title: overrides.title ?? 'Dentist',
    startsAt: overrides.startsAt ?? new Date('2026-06-03T15:00:00Z'),
    tz: overrides.tz ?? FIXTURE_TZ,
    ...(overrides.durationMinutes !== undefined ? { durationMinutes: overrides.durationMinutes } : {}),
  })
}

export function makePlannedMeal(
  overrides: { id?: Id; title?: string; day?: DayKey; foodId?: Id; servings?: number } = {},
): PlannedMeal {
  return new PlannedMeal({
    id: overrides.id ?? fixtureId(1007),
    title: overrides.title ?? 'Oatmeal breakfast',
    day: overrides.day ?? FIXTURE_TODAY.addDays(1),
    foodId: overrides.foodId ?? fixtureId(31),
    ...(overrides.servings !== undefined ? { servings: overrides.servings } : {}),
  })
}

export function makeDayPlan(overrides: { id?: Id; day?: DayKey; slots?: readonly DayPlanSlot[] } = {}): DayPlan {
  return new DayPlan({
    id: overrides.id ?? fixtureId(1010),
    day: overrides.day ?? FIXTURE_TODAY,
    slots: overrides.slots ?? [{ planId: fixtureId(1003), start: '09:00', end: '10:00' }],
  })
}
```

- [ ] **Step 4: Extend the seed**

In `packages/all-of-oyl/src/fixtures/seed.ts`: extend the `Seed` type with `plans`, `projects`, `dayPlans` (all `Record<string, unknown>[]`); inside `makeSeed()` after the goals block add (extend the `./builders` import with the five new builders; `Cadence` from `../core/cadence`):

```ts
  // ── Plans (id block 1000-1999) ──────────────────────────────────────────
  const project = makeProject({ id: fixtureId(1000), name: 'Spring reset', areaId: fixtureId(12) })
  // showcase: a recurring chore completed late + its respawned (already overdue from today's view) successor
  const wateredLate = makeTask({ id: fixtureId(1001), title: 'Water the plants', due: FIXTURE_TODAY.addDays(-9), cadence: Cadence.of(7, 'days') })
  wateredLate.complete(FIXTURE_TODAY.addDays(-6))
  // the successor is constructed explicitly with a fixture id — spawnNext() would
  // generate a random id and break the seed's byte-stability contract
  const wateringNext = makeTask({
    id: fixtureId(1002),
    title: 'Water the plants',
    due: wateredLate.cadence!.nextAfter(wateredLate.completedOn!), // -6 + 7 = TODAY+1
    cadence: Cadence.of(7, 'days'),
  })
  const taxes = makeTask({ id: fixtureId(1003), title: 'File taxes', due: FIXTURE_TODAY.addDays(-3) })
  const projectDone = makeTask({ id: fixtureId(1004), title: 'Declutter closet', due: FIXTURE_TODAY.addDays(-5), projectId: project.id })
  projectDone.complete(FIXTURE_TODAY.addDays(-5))
  const projectOpen = makeTask({ id: fixtureId(1005), title: 'Donate the pile', due: FIXTURE_TODAY.addDays(3), projectId: project.id })
  const dentist = makeAppointment({ id: fixtureId(1006), title: 'Dentist', startsAt: new Date('2026-06-03T15:00:00Z') })
  const mealTomorrow = makePlannedMeal({ id: fixtureId(1007), title: 'Oatmeal breakfast', day: FIXTURE_TODAY.addDays(1) })
  const mealLater = makePlannedMeal({ id: fixtureId(1008), title: 'Oatmeal again', day: FIXTURE_TODAY.addDays(3) })
  const todayPlan = makeDayPlan({
    id: fixtureId(1010),
    day: FIXTURE_TODAY,
    slots: [{ planId: fixtureId(1003), start: '09:00', end: '10:00' }],
  })
```

and extend the cached object with:

```ts
    plans: [wateredLate.toJSON(), wateringNext.toJSON(), taxes.toJSON(), projectDone.toJSON(), projectOpen.toJSON(), dentist.toJSON(), mealTomorrow.toJSON(), mealLater.toJSON()],
    projects: [project.toJSON()],
    dayPlans: [todayPlan.toJSON()],
```

- [ ] **Step 5: Export the new builders from the barrel**

In `packages/all-of-oyl/src/index.ts`, add `makeAppointment, makeDayPlan, makePlannedMeal, makeProject, makeTask,` to the builders export list (keep it alphabetical).

- [ ] **Step 6: Run the full gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.
Confirm `packages/all-of-oyl/package.json` dependencies unchanged.

```bash
git add packages/all-of-oyl/src/fixtures packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): phase 4 fixtures — Avery's plans, project, and day plan"
```

---

## Phase 4 exit criteria

- [ ] All gates green; no dependencies added.
- [ ] Import discipline: `plan/` imports `core/` only (+ intra-module siblings); food/possession references are bare `Id`s; `project.ts` → `planner.ts` is type-only with no reverse import.
- [ ] Every phase-4 spec behavior tested: plan state-machine serialization (incl. done⇔completedOn consistency), recurring respawn re-anchored on `completedOn` (late completion spawns an already-overdue successor — honest), spawn refusal for non-recurring/non-completed, Appointment tz-derived due + revival without tz, PlannedMeal provenance guard + fulfillment links, DayPlan slot validation (format, end-requires-start, end-after-start) + stale-slot skipping with storage untouched, Planner strict-add/idempotent-remove, dueOn/overdue/upcoming open-only, completionRate undefined-when-empty + canceled-excluded, project progress through the planner, agenda ordering, day-plan replacement, grocery list (open meals only, servings summed), revivePlan incl. prototype-key rejection.
- [ ] Kind discriminants exactly: `task`, `appointment`, `planned-meal`.
- [ ] Seed showcases the late-completed recurring chore + respawned successor, an overdue task, a half-done project, planned meals feeding the grocery list, and a stored DayPlan for FIXTURE_TODAY.

## Explicitly NOT in phase 4 (resist the urge)

`vault/` (phase 5 — including any `Due` interface work; `nextDueOn` belongs to vault items and recurring contacts, not plans), `insights/` (phase 6 — planned-vs-actual analytics, reviews), `share/` (phase 7 — the day-plan grant), notification delivery, and `reopen()` (explicitly parked in the spec).
