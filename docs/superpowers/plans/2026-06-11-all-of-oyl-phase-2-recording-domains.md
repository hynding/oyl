# all-of-oyl Phase 2: Recording Domains — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four recording domains (activity, nutrition, finance, track) — three definitions, five `Entry` subclasses, the `reviveEntry` dispatcher, and the extended fixture/seed dataset — so the app can log a whole life.

**Architecture:** Each domain module imports `core/` only. Entries are deeply immutable occurrence nouns that snapshot their definition's values at construction (`Consumption` copies nutrients; `ActivitySession` copies the slug) and emit metrics under their owned namespace. Serialization follows the tolerant-reader template from phase 1 (`User`/`LifeArea`), with shared base helpers added to `core/entry.ts` since five subclasses repeat the same base parsing. The `kind → fromJSON` reviver lives in `src/index.ts` — the only file allowed to know every module.

**Tech Stack:** TypeScript 5 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest 4, zero runtime dependencies. Phase 1 core (merged on `master`) provides everything imported here.

**Read first:** `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` (sections "Entry subclasses and what they emit", "Definitions vs. entries", "Extending the app's purpose") and the phase 1 code in `packages/all-of-oyl/src/core/` — especially `user/user.ts` (the tolerant-reader template every class here copies) and `core/entry.ts`.

**Working conventions (same as phase 1):**
- Run from repo root: `pnpm --filter @oyl/all-of-oyl test -- <path>` for one file, no path for all; `pnpm --filter @oyl/all-of-oyl typecheck:src` for the strict gate.
- TDD per task: write the failing test, SEE it fail, implement, SEE it pass, commit with the exact message.
- Throw-assertions use the `let caught: unknown` capture pattern.
- kebab-case files, named exports, colocated tests, no Node-only imports, only assign optional props when defined (conditional spreads).

**Kind discriminants (fixed, used everywhere):** `activity-session`, `consumption`, `transaction`, `measurement`, `note`.

---

### Task 1: Entry serialization base helpers

Five subclasses will repeat identical base-field handling — extract it once in `core/entry.ts` (the file already owns the Entry contract).

**Files:**
- Modify: `packages/all-of-oyl/src/core/entry.ts`
- Test: `packages/all-of-oyl/src/core/entry.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append inside the existing `describe('Entry', ...)` block in `packages/all-of-oyl/src/core/entry.test.ts` (the `TestEntry` class at the top of the file is reused; also add `entryBaseJSON, parseEntryBase` to the existing `./entry` import and `DomainError` from `./domain-error`):

```ts
  it('entryBaseJSON emits the shared base fields', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ id: Id.of('00000000-0000-4000-8000-000000000100'), occurredAt: at, note: 'hi' })
    e.meta = { createdAt: at, updatedAt: at, revision: 1 }
    expect(entryBaseJSON(e)).toEqual({
      id: '00000000-0000-4000-8000-000000000100',
      kind: 'test',
      occurredAt: '2026-06-01T12:00:00.000Z',
      note: 'hi',
      meta: { createdAt: '2026-06-01T12:00:00.000Z', updatedAt: '2026-06-01T12:00:00.000Z', revision: 1 },
    })
  })

  it('parseEntryBase validates and splits base from rest', () => {
    const base = parseEntryBase(
      {
        id: '00000000-0000-4000-8000-000000000100',
        kind: 'test',
        occurredAt: '2026-06-01T12:00:00.000Z',
        note: 'hi',
        customField: 9,
      },
      'test',
    )
    expect(base.id).toBe('00000000-0000-4000-8000-000000000100')
    expect(base.occurredAt.toISOString()).toBe('2026-06-01T12:00:00.000Z')
    expect(base.note).toBe('hi')
    expect(base.meta).toBeUndefined()
    expect(base.rest).toEqual({ customField: 9 })
  })

  it.each([
    null,
    42,
    { kind: 'other', id: '00000000-0000-4000-8000-000000000100', occurredAt: '2026-06-01T12:00:00.000Z' },
    { kind: 'test', id: 'nope', occurredAt: '2026-06-01T12:00:00.000Z' },
    { kind: 'test', id: '00000000-0000-4000-8000-000000000100', occurredAt: 'garbage' },
    { kind: 'test', id: '00000000-0000-4000-8000-000000000100' },
  ])('parseEntryBase rejects malformed shape %j with MALFORMED_JSON', (shape) => {
    let caught: unknown
    try {
      parseEntryBase(shape, 'test')
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/entry.test.ts`
Expected: FAIL — `entryBaseJSON` / `parseEntryBase` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `packages/all-of-oyl/src/core/entry.ts` (and extend its imports: `import { DomainError } from './domain-error'`, `import { metaFromJSON, metaToJSON } from './persisted-meta'` — note `PersistedMeta` is currently a type-only import; keep the type import and add the value imports):

```ts
export type EntryBaseProps = {
  id: Id
  occurredAt: Date
  note?: string
  meta?: PersistedMeta
  /** Everything that wasn't a base field — subclass fields plus unknown extras. */
  rest: Record<string, unknown>
}

/** Serialize the base fields shared by every entry kind. */
export function entryBaseJSON(entry: Entry): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    occurredAt: entry.occurredAt.toISOString(),
    ...(entry.note !== undefined ? { note: entry.note } : {}),
    ...(entry.meta ? { meta: metaToJSON(entry.meta) } : {}),
  }
}

/** Parse and validate the base fields of an entry shape; subclass fields stay in `rest`. */
export function parseEntryBase(shape: unknown, expectedKind: string): EntryBaseProps {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const { id, kind, occurredAt, note, meta, ...rest } = shape as Record<string, unknown>
  if (
    kind !== expectedKind ||
    typeof id !== 'string' ||
    typeof occurredAt !== 'string' ||
    (note !== undefined && typeof note !== 'string')
  ) {
    throw new DomainError('MALFORMED_JSON', `not a ${expectedKind} shape`)
  }
  const at = new Date(occurredAt)
  if (Number.isNaN(at.getTime())) {
    throw new DomainError('MALFORMED_JSON', `bad occurredAt in ${expectedKind} shape`)
  }
  let parsedId: Id
  try {
    parsedId = Id.of(id)
  } catch {
    throw new DomainError('MALFORMED_JSON', `malformed id in ${expectedKind} shape: "${id}"`)
  }
  return {
    id: parsedId,
    occurredAt: at,
    ...(note !== undefined ? { note } : {}),
    ...(meta !== undefined ? { meta: metaFromJSON(meta) } : {}),
    rest,
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/entry.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/entry.ts packages/all-of-oyl/src/core/entry.test.ts
git commit -m "feat(all-of-oyl): entry serialization base helpers"
```

---

### Task 2: Activity module — `Activity` + `ActivitySession`

**Files:**
- Create: `packages/all-of-oyl/src/activity/activity.ts`
- Create: `packages/all-of-oyl/src/activity/activity-session.ts`
- Test: `packages/all-of-oyl/src/activity/activity.test.ts`
- Test: `packages/all-of-oyl/src/activity/activity-session.test.ts`

- [ ] **Step 1: Write the failing Activity test**

```ts
// packages/all-of-oyl/src/activity/activity.test.ts
import { describe, expect, it } from 'vitest'
import { Activity } from './activity'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Activity', () => {
  it('constructs a definition with validated slug', () => {
    const run = new Activity({ name: 'Run', slug: 'run', defaultUnit: 'minutes', areaId: Id.of('00000000-0000-4000-8000-000000000010') })
    expect(run.name).toBe('Run')
    expect(run.slug).toBe('run')
    expect(run.defaultUnit).toBe('minutes')
    expect(Id.of(run.id)).toBe(run.id)
  })

  it('rejects bad slugs and bad default units', () => {
    for (const props of [
      { name: 'Run', slug: 'no spaces' },
      { name: 'Run', slug: 'run', defaultUnit: 'two words' },
      { name: '', slug: 'run' },
    ]) {
      let caught: unknown
      try {
        new Activity(props)
      } catch (e) {
        caught = e
      }
      expect(['INVALID_SLUG', 'INVALID_QUANTITY']).toContain((caught as DomainError)?.code)
    }
  })

  it('round-trips JSON and preserves unknown fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000030',
      name: 'Run',
      slug: 'run',
      defaultUnit: 'minutes',
      areaId: '00000000-0000-4000-8000-000000000010',
      futureField: true,
    }
    const revived = Activity.fromJSON(shape)
    expect(revived.areaId).toBe('00000000-0000-4000-8000-000000000010')
    expect(revived.toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Run' }, { id: 'nope', name: 'Run', slug: 'run' }]) {
      let caught: unknown
      try {
        Activity.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/activity/activity.test.ts`
Expected: FAIL — cannot resolve `./activity`.

- [ ] **Step 3: Implement Activity**

```ts
// packages/all-of-oyl/src/activity/activity.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'
import { assertSlug } from '../core/slug'

/** A reusable definition of something you do ("Run", "Meditate"). */
export class Activity {
  readonly id: Id
  readonly name: string
  readonly slug: string
  readonly defaultUnit?: string
  readonly areaId?: Id
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; name: string; slug: string; defaultUnit?: string; areaId?: Id },
    extra: Record<string, unknown> = {},
  ) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.slug = assertSlug(props.slug)
    if (props.defaultUnit !== undefined) this.defaultUnit = assertSlug(props.defaultUnit)
    if (props.areaId !== undefined) this.areaId = props.areaId
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      slug: this.slug,
      ...(this.defaultUnit !== undefined ? { defaultUnit: this.defaultUnit } : {}),
      ...(this.areaId !== undefined ? { areaId: this.areaId } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Activity {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not an Activity shape')
    }
    const { id, name, slug, defaultUnit, areaId, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      typeof slug !== 'string' ||
      (defaultUnit !== undefined && typeof defaultUnit !== 'string') ||
      (areaId !== undefined && typeof areaId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not an Activity shape')
    }
    let parsedId: Id
    let parsedAreaId: Id | undefined
    try {
      parsedId = Id.of(id)
      parsedAreaId = areaId !== undefined ? Id.of(areaId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', 'Activity has a malformed id')
    }
    const activity = new Activity(
      {
        id: parsedId,
        name,
        slug,
        ...(defaultUnit !== undefined ? { defaultUnit } : {}),
        ...(parsedAreaId !== undefined ? { areaId: parsedAreaId } : {}),
      },
      extra,
    )
    if (meta !== undefined) activity.meta = metaFromJSON(meta)
    return activity
  }
}
```

- [ ] **Step 4: Verify Activity passes, then write the failing ActivitySession test**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/activity/activity.test.ts` → PASS.

```ts
// packages/all-of-oyl/src/activity/activity-session.test.ts
import { describe, expect, it } from 'vitest'
import { Activity } from './activity'
import { ActivitySession } from './activity-session'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Quantity } from '../core/quantity'
import { DomainError } from '../core/domain-error'

const run = new Activity({ id: Id.of('00000000-0000-4000-8000-000000000030'), name: 'Run', slug: 'run' })
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('ActivitySession', () => {
  it('snapshots the activity slug and emits count + quantity metrics', () => {
    const session = new ActivitySession({
      occurredAt: when,
      activity: run,
      quantities: [Quantity.of(30, 'minutes'), Quantity.of(5, 'km')],
    })
    expect(session.kind).toBe('activity-session')
    expect(session.activityId).toBe(run.id)
    expect(session.slug).toBe('run')
    expect(session.metrics().get(key('activity.run.count'))).toBe(1)
    expect(session.metrics().get(key('activity.run.minutes'))).toBe(30)
    expect(session.metrics().get(key('activity.run.km'))).toBe(5)
  })

  it('merges same-unit quantities and works with none', () => {
    const session = new ActivitySession({
      occurredAt: when,
      activity: run,
      quantities: [Quantity.of(20, 'minutes'), Quantity.of(10, 'minutes')],
    })
    expect(session.metrics().get(key('activity.run.minutes'))).toBe(30)
    const bare = new ActivitySession({ occurredAt: when, activity: run })
    expect(bare.metrics().get(key('activity.run.count'))).toBe(1)
    expect(bare.metrics().size).toBe(1)
  })

  it('rejects quantity units that cannot embed into a metric key', () => {
    let caught: unknown
    try {
      new ActivitySession({ occurredAt: when, activity: run, quantities: [Quantity.of(1, 'two words')] })
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const session = new ActivitySession({
      id: Id.of('00000000-0000-4000-8000-000000000100'),
      occurredAt: when,
      note: 'felt great',
      activity: run,
      quantities: [Quantity.of(30, 'minutes')],
    })
    const out = session.toJSON()
    const revived = ActivitySession.fromJSON({ ...out, futureField: 1 })
    expect(revived.activityId).toBe(run.id)
    expect(revived.slug).toBe('run')
    expect(revived.note).toBe('felt great')
    expect(revived.metrics().get(key('activity.run.minutes'))).toBe(30)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(1)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'activity-session', id: '00000000-0000-4000-8000-000000000100', occurredAt: when.toISOString() }, // no activityId/slug
      { kind: 'consumption', id: '00000000-0000-4000-8000-000000000100', occurredAt: when.toISOString(), activityId: run.id, slug: 'run' }, // wrong kind
    ]) {
      let caught: unknown
      try {
        ActivitySession.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/activity/activity-session.test.ts` → FAIL (cannot resolve `./activity-session`).

- [ ] **Step 5: Implement ActivitySession**

```ts
// packages/all-of-oyl/src/activity/activity-session.ts
import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Quantity } from '../core/quantity'
import { assertSlug } from '../core/slug'

/**
 * Doing an activity — a run, a meditation, an hour of guitar. Snapshots the
 * activity's slug at log time (catalog edits never rewrite history). Doubles
 * as time tracking: minutes against an activity is "where my hours go".
 */
export class ActivitySession extends Entry {
  readonly activityId: Id
  readonly slug: string
  readonly quantities: readonly Quantity[]
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      /** A full Activity works; reviving passes the stored snapshot. */
      activity: { id: Id; slug: string }
      quantities?: readonly Quantity[]
    },
    extra: Record<string, unknown> = {},
  ) {
    const { activity, quantities = [], ...base } = props
    super('activity-session', base)
    this.activityId = activity.id
    this.slug = assertSlug(activity.slug)
    for (const q of quantities) assertSlug(q.unit) // units embed into metric keys
    this.quantities = [...quantities]
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    m.set(MetricKey.of(`activity.${this.slug}.count`), 1)
    for (const q of this.quantities) {
      const key = MetricKey.of(`activity.${this.slug}.${q.unit}`)
      m.set(key, (m.get(key) ?? 0) + q.amount)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      activityId: this.activityId,
      slug: this.slug,
      ...(this.quantities.length > 0 ? { quantities: this.quantities.map((q) => q.toJSON()) } : {}),
    }
  }

  static fromJSON(shape: unknown): ActivitySession {
    const base = parseEntryBase(shape, 'activity-session')
    const { activityId, slug, quantities, ...extra } = base.rest
    if (
      typeof activityId !== 'string' ||
      typeof slug !== 'string' ||
      (quantities !== undefined && !Array.isArray(quantities))
    ) {
      throw new DomainError('MALFORMED_JSON', 'not an activity-session shape')
    }
    let parsedActivityId: Id
    try {
      parsedActivityId = Id.of(activityId)
    } catch {
      throw new DomainError('MALFORMED_JSON', `activity-session has a malformed activityId: "${activityId}"`)
    }
    const session = new ActivitySession(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        activity: { id: parsedActivityId, slug },
        ...(quantities !== undefined ? { quantities: quantities.map((q) => Quantity.fromJSON(q)) } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) session.meta = base.meta
    return session
  }
}
```

- [ ] **Step 6: Verify pass + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/activity` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/activity
git commit -m "feat(all-of-oyl): activity module — Activity definition + ActivitySession entry"
```

---

### Task 3: Nutrition module — `Food` + `Consumption`

**Files:**
- Create: `packages/all-of-oyl/src/nutrition/food.ts` (also owns the `Nutrients` type + helpers)
- Create: `packages/all-of-oyl/src/nutrition/consumption.ts`
- Test: `packages/all-of-oyl/src/nutrition/food.test.ts`
- Test: `packages/all-of-oyl/src/nutrition/consumption.test.ts`

- [ ] **Step 1: Write the failing Food test**

```ts
// packages/all-of-oyl/src/nutrition/food.test.ts
import { describe, expect, it } from 'vitest'
import { Food } from './food'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Food', () => {
  it('constructs with per-serving nutrients', () => {
    const oatmeal = new Food({ name: 'Oatmeal', nutrients: { calories: 150, protein: 5, carbs: 27, fat: 3 } })
    expect(oatmeal.name).toBe('Oatmeal')
    expect(oatmeal.nutrients.calories).toBe(150)
    expect(Id.of(oatmeal.id)).toBe(oatmeal.id)
  })

  it('rejects negative or non-finite nutrient values', () => {
    for (const nutrients of [{ calories: -1 }, { protein: NaN }, { waterMl: Infinity }]) {
      let caught: unknown
      try {
        new Food({ name: 'Bad', nutrients })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Oatmeal',
      nutrients: { calories: 150, protein: 5 },
      futureField: 'x',
    }
    expect(Food.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal' }, { id: '00000000-0000-4000-8000-000000000031', name: 'Oatmeal', nutrients: { calories: 'lots' } }]) {
      let caught: unknown
      try {
        Food.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/nutrition/food.test.ts` → FAIL.

- [ ] **Step 2: Implement Food (+ Nutrients helpers)**

```ts
// packages/all-of-oyl/src/nutrition/food.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** Per-serving nutrient values. Only present fields are emitted as metrics. */
export type Nutrients = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  waterMl?: number
}

/** Field → metric key. The one place the mapping lives. */
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof Nutrients, string]> = [
  ['calories', 'nutrition.calories'],
  ['protein', 'nutrition.protein'],
  ['carbs', 'nutrition.carbs'],
  ['fat', 'nutrition.fat'],
  ['waterMl', 'nutrition.water_ml'],
]

export function assertNutrients(n: Nutrients): Nutrients {
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      throw new DomainError('INVALID_QUANTITY', `nutrient ${field} must be a non-negative finite number, got ${v}`)
    }
  }
  return n
}

export function nutrientsToJSON(n: Nutrients): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined) out[field] = v
  }
  return out
}

export function nutrientsFromJSON(shape: unknown): Nutrients {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not a Nutrients shape')
  }
  const s = shape as Record<string, unknown>
  const out: Nutrients = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = s[field]
    if (v === undefined) continue
    if (typeof v !== 'number') throw new DomainError('MALFORMED_JSON', `nutrient ${field} must be a number`)
    out[field] = v
  }
  return assertNutrients(out)
}

/** A reusable food definition; nutrients are per serving. */
export class Food {
  readonly id: Id
  readonly name: string
  readonly nutrients: Nutrients
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; nutrients: Nutrients }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.nutrients = { ...assertNutrients(props.nutrients) }
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      nutrients: nutrientsToJSON(this.nutrients),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Food {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a Food shape')
    }
    const { id, name, nutrients, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || nutrients === undefined) {
      throw new DomainError('MALFORMED_JSON', 'not a Food shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Food has a malformed id: "${id}"`)
    }
    const food = new Food({ id: parsedId, name, nutrients: nutrientsFromJSON(nutrients) }, extra)
    if (meta !== undefined) food.meta = metaFromJSON(meta)
    return food
  }
}
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/nutrition/food.test.ts` → PASS.

- [ ] **Step 3: Write the failing Consumption test**

```ts
// packages/all-of-oyl/src/nutrition/consumption.test.ts
import { describe, expect, it } from 'vitest'
import { Food } from './food'
import { Consumption } from './consumption'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { DomainError } from '../core/domain-error'

const oatmeal = new Food({
  id: Id.of('00000000-0000-4000-8000-000000000031'),
  name: 'Oatmeal',
  nutrients: { calories: 150, protein: 5, waterMl: 10 },
})
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Consumption', () => {
  it('snapshots food nutrients and emits × servings', () => {
    const meal = new Consumption({ occurredAt: when, food: oatmeal, servings: 2 })
    expect(meal.kind).toBe('consumption')
    expect(meal.foodId).toBe(oatmeal.id)
    expect(meal.servings).toBe(2)
    expect(meal.metrics().get(key('nutrition.calories'))).toBe(300)
    expect(meal.metrics().get(key('nutrition.protein'))).toBe(10)
    expect(meal.metrics().get(key('nutrition.water_ml'))).toBe(20)
    expect(meal.metrics().has(key('nutrition.carbs'))).toBe(false)
  })

  it('supports ad-hoc logging with no food (foodId is provenance, not a requirement)', () => {
    const restaurant = new Consumption({ occurredAt: when, nutrients: { calories: 850, fat: 40 } })
    expect(restaurant.foodId).toBeUndefined()
    expect(restaurant.servings).toBe(1)
    expect(restaurant.metrics().get(key('nutrition.calories'))).toBe(850)
  })

  it('explicit nutrients override the food snapshot', () => {
    const tweaked = new Consumption({ occurredAt: when, food: oatmeal, nutrients: { calories: 100 } })
    expect(tweaked.metrics().get(key('nutrition.calories'))).toBe(100)
    expect(tweaked.foodId).toBe(oatmeal.id)
  })

  it('requires nutrients from somewhere, and a positive serving count', () => {
    let caught1: unknown
    try {
      new Consumption({ occurredAt: when })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    for (const servings of [0, -1, NaN]) {
      let caught: unknown
      try {
        new Consumption({ occurredAt: when, food: oatmeal, servings })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON (incl. ad-hoc) with unknown fields preserved', () => {
    const meal = new Consumption({
      id: Id.of('00000000-0000-4000-8000-000000000101'),
      occurredAt: when,
      food: oatmeal,
      servings: 1.5,
    })
    const revived = Consumption.fromJSON({ ...meal.toJSON(), futureField: 2 })
    expect(revived.foodId).toBe(oatmeal.id)
    expect(revived.servings).toBe(1.5)
    expect(revived.metrics().get(key('nutrition.calories'))).toBe(225)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(2)

    const adHoc = new Consumption({ occurredAt: when, nutrients: { calories: 850 } })
    const revivedAdHoc = Consumption.fromJSON(adHoc.toJSON())
    expect(revivedAdHoc.foodId).toBeUndefined()
    expect(revivedAdHoc.metrics().get(key('nutrition.calories'))).toBe(850)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      Consumption.fromJSON({ kind: 'consumption', id: '00000000-0000-4000-8000-000000000101', occurredAt: when.toISOString(), servings: 1 }) // no nutrients
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/nutrition/consumption.test.ts` → FAIL.

- [ ] **Step 4: Implement Consumption**

```ts
// packages/all-of-oyl/src/nutrition/consumption.ts
import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { NUTRIENT_METRICS, type Nutrients, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './food'

/**
 * Something you ate or drank. Always STORES its per-serving nutrients — a
 * snapshot from the Food at log time, or given directly for ad-hoc logging
 * (a restaurant meal). `foodId` is provenance, not a requirement.
 */
export class Consumption extends Entry {
  readonly foodId?: Id
  readonly servings: number
  readonly nutrients: Nutrients
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      /** Catalog provenance + default nutrient source. */
      food?: { id: Id; nutrients: Nutrients }
      /** Bare provenance when reviving without the catalog at hand. */
      foodId?: Id
      /** Explicit per-serving nutrients (ad-hoc logging, or overrides the food's). */
      nutrients?: Nutrients
      /** Defaults to 1. */
      servings?: number
    },
    extra: Record<string, unknown> = {},
  ) {
    const { food, foodId, nutrients, servings = 1, ...base } = props
    super('consumption', base)
    const resolved = nutrients ?? food?.nutrients
    if (resolved === undefined) {
      throw new DomainError('INVALID_QUANTITY', 'a Consumption needs nutrients — from a food or given directly')
    }
    if (!Number.isFinite(servings) || servings <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servings must be a positive finite number, got ${servings}`)
    }
    const provenance = food?.id ?? foodId
    if (provenance !== undefined) this.foodId = provenance
    this.servings = servings
    this.nutrients = { ...assertNutrients(resolved) }
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    for (const [field, metric] of NUTRIENT_METRICS) {
      const v = this.nutrients[field]
      if (v !== undefined) m.set(MetricKey.of(metric), v * this.servings)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      ...(this.foodId !== undefined ? { foodId: this.foodId } : {}),
      servings: this.servings,
      nutrients: nutrientsToJSON(this.nutrients),
    }
  }

  static fromJSON(shape: unknown): Consumption {
    const base = parseEntryBase(shape, 'consumption')
    const { foodId, servings, nutrients, ...extra } = base.rest
    if (typeof servings !== 'number' || nutrients === undefined || (foodId !== undefined && typeof foodId !== 'string')) {
      throw new DomainError('MALFORMED_JSON', 'not a consumption shape')
    }
    let parsedFoodId: Id | undefined
    try {
      parsedFoodId = foodId !== undefined ? Id.of(foodId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `consumption has a malformed foodId: "${foodId}"`)
    }
    const meal = new Consumption(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        ...(parsedFoodId !== undefined ? { foodId: parsedFoodId } : {}),
        nutrients: nutrientsFromJSON(nutrients),
        servings,
      },
      extra,
    )
    if (base.meta !== undefined) meal.meta = base.meta
    return meal
  }
}
```

- [ ] **Step 5: Verify pass + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/nutrition` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/nutrition
git commit -m "feat(all-of-oyl): nutrition module — Food definition + Consumption entry"
```

---

### Task 4: Finance module — `Account` + `Transaction`

**Files:**
- Create: `packages/all-of-oyl/src/finance/account.ts`
- Create: `packages/all-of-oyl/src/finance/transaction.ts`
- Test: `packages/all-of-oyl/src/finance/account.test.ts`
- Test: `packages/all-of-oyl/src/finance/transaction.test.ts`

- [ ] **Step 1: Write the failing Account test**

```ts
// packages/all-of-oyl/src/finance/account.test.ts
import { describe, expect, it } from 'vitest'
import { Account } from './account'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('Account', () => {
  it('constructs with name and ISO currency', () => {
    const checking = new Account({ name: 'Checking', currency: 'USD' })
    expect(checking.name).toBe('Checking')
    expect(checking.currency).toBe('USD')
    expect(Id.of(checking.id)).toBe(checking.id)
  })

  it('rejects bad currencies and empty names', () => {
    for (const props of [
      { name: 'Checking', currency: 'dollars' },
      { name: 'Checking', currency: 'usd' },
      { name: '', currency: 'USD' },
    ]) {
      let caught: unknown
      try {
        new Account(props)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const shape = { id: '00000000-0000-4000-8000-000000000032', name: 'Checking', currency: 'USD', futureField: [] }
    expect(Account.fromJSON(shape).toJSON()).toEqual(shape)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [null, { name: 'Checking' }, { id: 'nope', name: 'Checking', currency: 'USD' }]) {
      let caught: unknown
      try {
        Account.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/finance/account.test.ts` → FAIL.

- [ ] **Step 2: Implement Account**

```ts
// packages/all-of-oyl/src/finance/account.ts
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

/** A money account ("Checking", "Visa"). Transactions may reference one. */
export class Account {
  readonly id: Id
  readonly name: string
  readonly currency: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; currency: string }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    if (!/^[A-Z]{3}$/.test(props.currency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${props.currency}"`)
    }
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.currency = props.currency
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      currency: this.currency,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): Account {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not an Account shape')
    }
    const { id, name, currency, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof currency !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not an Account shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `Account has a malformed id: "${id}"`)
    }
    const account = new Account({ id: parsedId, name, currency }, extra)
    if (meta !== undefined) account.meta = metaFromJSON(meta)
    return account
  }
}
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/finance/account.test.ts` → PASS.

- [ ] **Step 3: Write the failing Transaction test**

```ts
// packages/all-of-oyl/src/finance/transaction.test.ts
import { describe, expect, it } from 'vitest'
import { Account } from './account'
import { Transaction } from './transaction'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Money } from '../core/money'
import { DomainError } from '../core/domain-error'

const checking = new Account({ id: Id.of('00000000-0000-4000-8000-000000000032'), name: 'Checking', currency: 'USD' })
const when = new Date('2026-06-01T12:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Transaction', () => {
  it('emits expense spending in major units under the category', () => {
    const groceries = new Transaction({ occurredAt: when, amount: Money.usd(4210), category: 'groceries', direction: 'expense', account: checking })
    expect(groceries.kind).toBe('transaction')
    expect(groceries.accountId).toBe(checking.id)
    expect(groceries.metrics().get(key('finance.spend.groceries'))).toBeCloseTo(42.1)
    expect(groceries.metrics().size).toBe(1)
  })

  it('emits income under finance.income', () => {
    const salary = new Transaction({ occurredAt: when, amount: Money.usd(500000), category: 'salary', direction: 'income' })
    expect(salary.accountId).toBeUndefined()
    expect(salary.metrics().get(key('finance.income.salary'))).toBe(5000)
  })

  it('a refund is a negative expense — finance.spend is net-of-refunds', () => {
    const refund = new Transaction({ occurredAt: when, amount: Money.usd(-1500), category: 'groceries', direction: 'expense' })
    expect(refund.metrics().get(key('finance.spend.groceries'))).toBe(-15)
  })

  it('rejects currency mismatch with the account, and bad categories', () => {
    let caught1: unknown
    try {
      new Transaction({ occurredAt: when, amount: Money.of(100, 'EUR'), category: 'groceries', direction: 'expense', account: checking })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('CURRENCY_MISMATCH')

    let caught2: unknown
    try {
      new Transaction({ occurredAt: when, amount: Money.usd(100), category: 'two words', direction: 'expense' })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const tx = new Transaction({
      id: Id.of('00000000-0000-4000-8000-000000000102'),
      occurredAt: when,
      amount: Money.usd(4210),
      category: 'groceries',
      direction: 'expense',
      account: checking,
    })
    const revived = Transaction.fromJSON({ ...tx.toJSON(), futureField: 3 })
    expect(revived.amount.equals(Money.usd(4210))).toBe(true)
    expect(revived.accountId).toBe(checking.id)
    expect(revived.direction).toBe('expense')
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(3)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    for (const shape of [
      { kind: 'transaction', id: '00000000-0000-4000-8000-000000000102', occurredAt: when.toISOString(), category: 'groceries', direction: 'expense' }, // no amount
      { kind: 'transaction', id: '00000000-0000-4000-8000-000000000102', occurredAt: when.toISOString(), amount: Money.usd(1).toJSON(), category: 'groceries', direction: 'sideways' },
    ]) {
      let caught: unknown
      try {
        Transaction.fromJSON(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
    }
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/finance/transaction.test.ts` → FAIL.

- [ ] **Step 4: Implement Transaction**

```ts
// packages/all-of-oyl/src/finance/transaction.ts
import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { Money } from '../core/money'
import { assertSlug } from '../core/slug'

export type TransactionDirection = 'expense' | 'income'

/**
 * Money moved. Expenses emit finance.spend.<category>, income emits
 * finance.income.<category>, both in major units (the metric layer assumes
 * one working currency per journal). Negative expense = refund: spend
 * metrics are net-of-refunds by construction. `accountId` is optional
 * (cash spending); currency match is enforced when a full Account is given
 * at construction — revival trusts the validated wire data.
 */
export class Transaction extends Entry {
  readonly amount: Money
  readonly category: string
  readonly direction: TransactionDirection
  readonly accountId?: Id
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: {
      id?: Id
      occurredAt: Date
      note?: string
      amount: Money
      category: string
      direction: TransactionDirection
      /** Full account enforces the currency match. */
      account?: { id: Id; currency: string }
      /** Bare provenance when reviving without the catalog at hand. */
      accountId?: Id
    },
    extra: Record<string, unknown> = {},
  ) {
    const { amount, category, direction, account, accountId, ...base } = props
    super('transaction', base)
    if (account && account.currency !== amount.currency) {
      throw new DomainError('CURRENCY_MISMATCH', `transaction in ${amount.currency} cannot post to a ${account.currency} account`)
    }
    this.amount = amount
    this.category = assertSlug(category)
    this.direction = direction
    const provenance = account?.id ?? accountId
    if (provenance !== undefined) this.accountId = provenance
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const channel = this.direction === 'expense' ? 'spend' : 'income'
    return new Map([[MetricKey.of(`finance.${channel}.${this.category}`), this.amount.toNumber()]])
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      amount: this.amount.toJSON(),
      category: this.category,
      direction: this.direction,
      ...(this.accountId !== undefined ? { accountId: this.accountId } : {}),
    }
  }

  static fromJSON(shape: unknown): Transaction {
    const base = parseEntryBase(shape, 'transaction')
    const { amount, category, direction, accountId, ...extra } = base.rest
    if (
      amount === undefined ||
      typeof category !== 'string' ||
      (direction !== 'expense' && direction !== 'income') ||
      (accountId !== undefined && typeof accountId !== 'string')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a transaction shape')
    }
    let parsedAccountId: Id | undefined
    try {
      parsedAccountId = accountId !== undefined ? Id.of(accountId) : undefined
    } catch {
      throw new DomainError('MALFORMED_JSON', `transaction has a malformed accountId: "${accountId}"`)
    }
    const tx = new Transaction(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        amount: Money.fromJSON(amount),
        category,
        direction,
        ...(parsedAccountId !== undefined ? { accountId: parsedAccountId } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) tx.meta = base.meta
    return tx
  }
}
```

- [ ] **Step 5: Verify pass + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/finance` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/finance
git commit -m "feat(all-of-oyl): finance module — Account definition + Transaction entry"
```

---

### Task 5: Track module — `Measurement` + `Note`

**Files:**
- Create: `packages/all-of-oyl/src/track/measurement.ts`
- Create: `packages/all-of-oyl/src/track/note.ts`
- Test: `packages/all-of-oyl/src/track/measurement.test.ts`
- Test: `packages/all-of-oyl/src/track/note.test.ts`

- [ ] **Step 1: Write the failing Measurement test**

```ts
// packages/all-of-oyl/src/track/measurement.test.ts
import { describe, expect, it } from 'vitest'
import { Measurement } from './measurement'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { DomainError } from '../core/domain-error'

const when = new Date('2026-06-01T08:00:00Z')

describe('Measurement', () => {
  it('emits exactly its metric and value', () => {
    const weight = new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: 80.5 })
    expect(weight.kind).toBe('measurement')
    expect(weight.metrics().get(MetricKey.of('body.weight_kg'))).toBe(80.5)
    expect(weight.metrics().size).toBe(1)
  })

  it.each(['body.weight_kg', 'sleep.hours', 'mood.score', 'screen.minutes', 'home.kwh', 'custom.guitar_practice_minutes'])(
    'accepts measurement-owned namespace %s',
    (metric) => {
      expect(new Measurement({ occurredAt: when, metric, value: 1 }).metric).toBe(metric)
    },
  )

  it.each(['activity.run.minutes', 'finance.spend.groceries', 'nutrition.calories', 'note.count'])(
    'rejects entry-owned namespace %s with RESERVED_NAMESPACE',
    (metric) => {
      let caught: unknown
      try {
        new Measurement({ occurredAt: when, metric, value: 1 })
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('RESERVED_NAMESPACE')
    },
  )

  it('rejects malformed keys and non-finite values', () => {
    let caught1: unknown
    try {
      new Measurement({ occurredAt: when, metric: 'weight', value: 1 })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_METRIC_KEY')

    let caught2: unknown
    try {
      new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: NaN })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_QUANTITY')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const weight = new Measurement({ id: Id.of('00000000-0000-4000-8000-000000000103'), occurredAt: when, metric: 'body.weight_kg', value: 80.5 })
    const revived = Measurement.fromJSON({ ...weight.toJSON(), futureField: 4 })
    expect(revived.metric).toBe('body.weight_kg')
    expect(revived.value).toBe(80.5)
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(4)
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/track/measurement.test.ts` → FAIL.

- [ ] **Step 2: Implement Measurement**

```ts
// packages/all-of-oyl/src/track/measurement.ts
import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import type { Id } from '../core/id'
import { MEASUREMENT_NAMESPACES, MetricKey } from '../core/metric-key'

/**
 * One generic class for any numeric observation — weight, blood pressure,
 * sleep hours, mood, screen time, kWh. Conventional keys: body.weight_kg,
 * body.bp_systolic, sleep.hours, mood.score, screen.minutes, home.kwh; user
 * metrics live under custom.*. Hand-logged values must not pollute derived
 * metrics, so entry-owned namespaces (activity, nutrition, finance, note)
 * are rejected with RESERVED_NAMESPACE.
 */
export class Measurement extends Entry {
  readonly metric: MetricKey
  readonly value: number
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; occurredAt: Date; note?: string; metric: string; value: number },
    extra: Record<string, unknown> = {},
  ) {
    const { metric, value, ...base } = props
    super('measurement', base)
    const key = MetricKey.of(metric)
    const namespace = MetricKey.namespaceOf(key)
    if (!(MEASUREMENT_NAMESPACES as readonly string[]).includes(namespace)) {
      throw new DomainError(
        'RESERVED_NAMESPACE',
        `measurements may not write into "${namespace}.*" (allowed: ${MEASUREMENT_NAMESPACES.join(', ')})`,
      )
    }
    if (!Number.isFinite(value)) {
      throw new DomainError('INVALID_QUANTITY', `value must be finite, got ${value}`)
    }
    this.metric = key
    this.value = value
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return new Map([[this.metric, this.value]])
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      metric: this.metric,
      value: this.value,
    }
  }

  static fromJSON(shape: unknown): Measurement {
    const base = parseEntryBase(shape, 'measurement')
    const { metric, value, ...extra } = base.rest
    if (typeof metric !== 'string' || typeof value !== 'number') {
      throw new DomainError('MALFORMED_JSON', 'not a measurement shape')
    }
    const m = new Measurement(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        metric,
        value,
      },
      extra,
    )
    if (base.meta !== undefined) m.meta = base.meta
    return m
  }
}
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/track/measurement.test.ts` → PASS.

- [ ] **Step 3: Write the failing Note test**

```ts
// packages/all-of-oyl/src/track/note.test.ts
import { describe, expect, it } from 'vitest'
import { Note } from './note'
import { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { DomainError } from '../core/domain-error'

const when = new Date('2026-06-01T21:00:00Z')
const key = (s: string) => MetricKey.of(s)

describe('Note', () => {
  it('emits note.count plus a count per tag', () => {
    const entry = new Note({ occurredAt: when, text: 'Grateful for the rain.', tags: ['gratitude', 'weather'] })
    expect(entry.kind).toBe('note')
    expect(entry.metrics().get(key('note.count'))).toBe(1)
    expect(entry.metrics().get(key('note.gratitude.count'))).toBe(1)
    expect(entry.metrics().get(key('note.weather.count'))).toBe(1)
  })

  it('dedupes tags and works without them', () => {
    const entry = new Note({ occurredAt: when, text: 'x', tags: ['gratitude', 'gratitude'] })
    expect(entry.tags).toEqual(['gratitude'])
    const plain = new Note({ occurredAt: when, text: 'just journaling' })
    expect(plain.metrics().size).toBe(1)
  })

  it('rejects empty text and invalid tags', () => {
    let caught1: unknown
    try {
      new Note({ occurredAt: when, text: '' })
    } catch (e) {
      caught1 = e
    }
    expect((caught1 as DomainError)?.code).toBe('INVALID_QUANTITY')

    let caught2: unknown
    try {
      new Note({ occurredAt: when, text: 'x', tags: ['Bad Tag'] })
    } catch (e) {
      caught2 = e
    }
    expect((caught2 as DomainError)?.code).toBe('INVALID_SLUG')
  })

  it('round-trips JSON with unknown fields preserved', () => {
    const entry = new Note({ id: Id.of('00000000-0000-4000-8000-000000000104'), occurredAt: when, text: 'Grateful.', tags: ['gratitude'] })
    const revived = Note.fromJSON({ ...entry.toJSON(), futureField: 5 })
    expect(revived.text).toBe('Grateful.')
    expect(revived.tags).toEqual(['gratitude'])
    expect((revived.toJSON() as Record<string, unknown>)['futureField']).toBe(5)
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    let caught: unknown
    try {
      Note.fromJSON({ kind: 'note', id: '00000000-0000-4000-8000-000000000104', occurredAt: when.toISOString(), tags: ['x'] }) // no text
    } catch (e) {
      caught = e
    }
    expect((caught as DomainError)?.code).toBe('MALFORMED_JSON')
  })
})
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/track/note.test.ts` → FAIL.

- [ ] **Step 4: Implement Note**

```ts
// packages/all-of-oyl/src/track/note.ts
import { DomainError } from '../core/domain-error'
import { Entry, entryBaseJSON, parseEntryBase } from '../core/entry'
import type { Id } from '../core/id'
import { MetricKey } from '../core/metric-key'
import { assertSlug } from '../core/slug'

/**
 * Free-text journaling and gratitude. Emits note.count (and a per-tag count)
 * so streaks like "journal daily" work. The inherited `note` field stays the
 * short annotation every entry has; `text` is the content.
 */
export class Note extends Entry {
  readonly text: string
  readonly tags: readonly string[]
  /** Tolerant reader: unknown JSON fields preserved through round-trips. Only ever spread into fresh object literals — never Object.assign or bracket-assign onto an existing object (prototype-pollution guard). */
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; occurredAt: Date; note?: string; text: string; tags?: readonly string[] },
    extra: Record<string, unknown> = {},
  ) {
    const { text, tags = [], ...base } = props
    super('note', base)
    if (text.length === 0) throw new DomainError('INVALID_QUANTITY', 'text must be non-empty')
    for (const tag of tags) assertSlug(tag)
    this.text = text
    this.tags = [...new Set(tags)]
    this.extra = extra
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    const m = new Map<MetricKey, number>()
    m.set(MetricKey.of('note.count'), 1)
    for (const tag of this.tags) {
      m.set(MetricKey.of(`note.${tag}.count`), 1)
    }
    return m
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      ...entryBaseJSON(this),
      text: this.text,
      ...(this.tags.length > 0 ? { tags: [...this.tags] } : {}),
    }
  }

  static fromJSON(shape: unknown): Note {
    const base = parseEntryBase(shape, 'note')
    const { text, tags, ...extra } = base.rest
    if (typeof text !== 'string' || (tags !== undefined && (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')))) {
      throw new DomainError('MALFORMED_JSON', 'not a note shape')
    }
    const entry = new Note(
      {
        id: base.id,
        occurredAt: base.occurredAt,
        ...(base.note !== undefined ? { note: base.note } : {}),
        text,
        ...(tags !== undefined ? { tags: tags as string[] } : {}),
      },
      extra,
    )
    if (base.meta !== undefined) entry.meta = base.meta
    return entry
  }
}
```

- [ ] **Step 5: Verify pass + typecheck, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/track` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/track
git commit -m "feat(all-of-oyl): track module — Measurement and Note entries"
```

---

### Task 6: `reviveEntry` dispatcher + barrel + repo doc caveat

**Files:**
- Modify: `packages/all-of-oyl/src/index.ts`
- Modify: `packages/all-of-oyl/src/core/in-memory-repository.ts` (doc comment only)
- Test: `packages/all-of-oyl/src/index.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/index.test.ts
import { describe, expect, it } from 'vitest'
import { ActivitySession, Consumption, Measurement, Note, Transaction, reviveEntry } from './index'
import { DomainError } from './core/domain-error'

const when = new Date('2026-06-01T12:00:00Z')

describe('reviveEntry', () => {
  it('dispatches every entry kind to the right class', () => {
    const samples = [
      new Measurement({ occurredAt: when, metric: 'body.weight_kg', value: 80 }),
      new Note({ occurredAt: when, text: 'hello' }),
    ]
    const revived = samples.map((e) => reviveEntry(e.toJSON()))
    expect(revived[0]).toBeInstanceOf(Measurement)
    expect(revived[1]).toBeInstanceOf(Note)
    // classes with definitions, via raw shapes
    expect(
      reviveEntry({
        kind: 'activity-session',
        id: '00000000-0000-4000-8000-000000000100',
        occurredAt: when.toISOString(),
        activityId: '00000000-0000-4000-8000-000000000030',
        slug: 'run',
      }),
    ).toBeInstanceOf(ActivitySession)
    expect(
      reviveEntry({
        kind: 'consumption',
        id: '00000000-0000-4000-8000-000000000101',
        occurredAt: when.toISOString(),
        servings: 1,
        nutrients: { calories: 100 },
      }),
    ).toBeInstanceOf(Consumption)
    expect(
      reviveEntry({
        kind: 'transaction',
        id: '00000000-0000-4000-8000-000000000102',
        occurredAt: when.toISOString(),
        amount: { minor: 100, currency: 'USD', exponent: 2 },
        category: 'groceries',
        direction: 'expense',
      }),
    ).toBeInstanceOf(Transaction)
  })

  it('throws UNKNOWN_KIND for unregistered kinds — louder than dropping data', () => {
    for (const shape of [{ kind: 'sleep-log' }, {}, null, 42]) {
      let caught: unknown
      try {
        reviveEntry(shape)
      } catch (e) {
        caught = e
      }
      expect((caught as DomainError)?.code).toBe('UNKNOWN_KIND')
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/index.test.ts`
Expected: FAIL — `reviveEntry` (and the new classes) not exported.

- [ ] **Step 3: Implement — extend the barrel**

Append to `packages/all-of-oyl/src/index.ts`:

```ts
export { Activity } from './activity/activity'
export { ActivitySession } from './activity/activity-session'
export { Food, type Nutrients, NUTRIENT_METRICS, assertNutrients, nutrientsFromJSON, nutrientsToJSON } from './nutrition/food'
export { Consumption } from './nutrition/consumption'
export { Account } from './finance/account'
export { Transaction, type TransactionDirection } from './finance/transaction'
export { Measurement } from './track/measurement'
export { Note } from './track/note'

// ── Revivers ────────────────────────────────────────────────────────────────
// The kind → fromJSON map must know every Entry subclass, and the barrel is
// the only file allowed to know all modules (see spec, "The reviver lives in
// index.ts"). New domains register their kind here (extension checklist #5).

import { DomainError } from './core/domain-error'
import type { Entry } from './core/entry'
import { ActivitySession } from './activity/activity-session'
import { Consumption } from './nutrition/consumption'
import { Transaction } from './finance/transaction'
import { Measurement } from './track/measurement'
import { Note } from './track/note'

const ENTRY_REVIVERS: Readonly<Record<string, (shape: unknown) => Entry>> = {
  'activity-session': ActivitySession.fromJSON,
  consumption: Consumption.fromJSON,
  transaction: Transaction.fromJSON,
  measurement: Measurement.fromJSON,
  note: Note.fromJSON,
}

/** Revive a heterogeneous entry shape by its kind discriminant. Unknown kinds throw — louder and safer than silently dropping a user's data. */
export function reviveEntry(shape: unknown): Entry {
  const kind = (shape as { kind?: unknown } | null)?.kind
  const revive = typeof kind === 'string' ? ENTRY_REVIVERS[kind] : undefined
  if (!revive) {
    throw new DomainError('UNKNOWN_KIND', `unknown entry kind: ${JSON.stringify(kind)}`)
  }
  return revive(shape)
}
```

- [ ] **Step 4: Add the repository doc caveat (final-review follow-up from phase 1)**

In `packages/all-of-oyl/src/core/in-memory-repository.ts`, extend the class JSDoc with one sentence at the end:

```
 * Reference-implementation caveat: this store keeps the caller's live object
 * (and stamps meta on it in place). Real adapters should clone on store/read
 * rather than copying this aliasing.
```

- [ ] **Step 5: Verify pass + gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.

```bash
git add packages/all-of-oyl/src/index.ts packages/all-of-oyl/src/index.test.ts packages/all-of-oyl/src/core/in-memory-repository.ts
git commit -m "feat(all-of-oyl): reviveEntry dispatcher + phase 2 barrel exports"
```

---

### Task 7: Fixtures — builders + Avery's six weeks of life

Extend the canonical dataset: catalogs (ids 30–32), ~6 weeks of generated entries (ids 100+), a March DST cluster, and the showcase cases (refund, ad-hoc meal). Seed entries are heterogeneous — reviving them through `reviveEntry` makes the seed a standing integration test of the whole phase.

**Files:**
- Modify: `packages/all-of-oyl/src/fixtures/builders.ts`
- Modify: `packages/all-of-oyl/src/fixtures/seed.ts`
- Modify: `packages/all-of-oyl/src/index.ts` (export new builders)
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Append to `packages/all-of-oyl/src/fixtures/fixtures.test.ts` (extend the imports: add `makeAccount, makeActivity, makeActivitySession, makeConsumption, makeFood, makeMeasurement, makeNote, makeTransaction` from `./builders`, `reviveEntry` from `../index`, `Journal` from `../core/journal`, `DayKey` from `../core/day-key`, `DayRange` from `../core/day-range`, `MetricKey` from `../core/metric-key`, `Transaction` from `../finance/transaction`, `Consumption` from `../nutrition/consumption`):

```ts
  it('phase 2 builders produce valid objects with overridable fields', () => {
    expect(makeActivity().slug).toBe('run')
    expect(makeFood().nutrients.calories).toBe(150)
    expect(makeAccount().currency).toBe('USD')
    expect(makeActivitySession().slug).toBe('run')
    expect(makeConsumption().servings).toBe(1)
    expect(makeTransaction().direction).toBe('expense')
    expect(makeMeasurement().metric).toBe('body.weight_kg')
    expect(makeNote().text.length).toBeGreaterThan(0)
    expect(makeTransaction({ direction: 'income', category: 'salary' }).direction).toBe('income')
  })

  it('seed contains the phase 2 catalogs and a six-week entry slice', () => {
    expect(seed.activities.length).toBeGreaterThanOrEqual(2)
    expect(seed.foods.length).toBeGreaterThanOrEqual(2)
    expect(seed.accounts).toHaveLength(1)
    expect(seed.entries.length).toBeGreaterThan(150) // ~6 weeks of daily logging
  })

  it('every seed entry revives through reviveEntry and re-serializes identically', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    expect(entries).toHaveLength(seed.entries.length)
    for (let i = 0; i < entries.length; i += 25) {
      const entry = entries[i]!
      expect(reviveEntry(entry.toJSON()).toJSON()).toEqual(entry.toJSON())
    }
  })

  it('seed showcases the spec semantics: a refund and an ad-hoc meal', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const refund = entries.find((e) => e instanceof Transaction && e.amount.minor < 0)
    expect(refund).toBeDefined()
    const adHoc = entries.find((e) => e instanceof Consumption && e.foodId === undefined)
    expect(adHoc).toBeDefined()
  })

  it('seed straddles the DST transition', () => {
    const entries = seed.entries.map((shape) => reviveEntry(shape))
    const journal = new Journal(FIXTURE_TZ)
    for (const e of entries) journal.add(e)
    const dstWeekend = DayRange.of(DayKey.of('2026-03-07'), DayKey.of('2026-03-09'))
    expect(journal.aggregate(MetricKey.of('body.weight_kg'), dstWeekend, 'avg')).toBeGreaterThan(0)
  })

  it('a Journal hydrated from seed answers real questions', () => {
    const journal = new Journal(FIXTURE_TZ)
    for (const shape of seed.entries) journal.add(reviveEntry(shape))
    const lastWeek = DayRange.of(FIXTURE_TODAY.addDays(-6), FIXTURE_TODAY)
    expect(journal.totalOf(MetricKey.of('nutrition.calories'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalOf(MetricKey.of('activity.run.minutes'), lastWeek)).toBeGreaterThan(0)
    expect(journal.totalsByPrefix('finance.spend', lastWeek).size).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — new builders not exported.

- [ ] **Step 3: Extend builders**

Append to `packages/all-of-oyl/src/fixtures/builders.ts` (extend imports accordingly: `Activity` from `../activity/activity`, `ActivitySession` from `../activity/activity-session`, `Food, type Nutrients` from `../nutrition/food`, `Consumption` from `../nutrition/consumption`, `Account` from `../finance/account`, `Transaction, type TransactionDirection` from `../finance/transaction`, `Measurement` from `../track/measurement`, `Note` from `../track/note`, `Money` from `../core/money`, `Quantity` from `../core/quantity`):

```ts
/** Default instant for entry builders: noon UTC on FIXTURE_TODAY (morning in FIXTURE_TZ). */
const DEFAULT_AT = new Date('2026-06-01T12:00:00Z')

export function makeActivity(overrides: { id?: Id; name?: string; slug?: string; defaultUnit?: string; areaId?: Id } = {}): Activity {
  return new Activity({
    id: overrides.id ?? fixtureId(30),
    name: overrides.name ?? 'Run',
    slug: overrides.slug ?? 'run',
    defaultUnit: overrides.defaultUnit ?? 'minutes',
    ...(overrides.areaId !== undefined ? { areaId: overrides.areaId } : { areaId: fixtureId(10) }),
  })
}

export function makeFood(overrides: { id?: Id; name?: string; nutrients?: Nutrients } = {}): Food {
  return new Food({
    id: overrides.id ?? fixtureId(31),
    name: overrides.name ?? 'Oatmeal',
    nutrients: overrides.nutrients ?? { calories: 150, protein: 5, carbs: 27, fat: 3 },
  })
}

export function makeAccount(overrides: { id?: Id; name?: string; currency?: string } = {}): Account {
  return new Account({
    id: overrides.id ?? fixtureId(32),
    name: overrides.name ?? 'Checking',
    currency: overrides.currency ?? 'USD',
  })
}

export function makeActivitySession(
  overrides: { id?: Id; occurredAt?: Date; note?: string; activity?: Activity; quantities?: readonly Quantity[] } = {},
): ActivitySession {
  return new ActivitySession({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    activity: overrides.activity ?? makeActivity(),
    quantities: overrides.quantities ?? [Quantity.of(30, 'minutes')],
  })
}

export function makeConsumption(
  overrides: { id?: Id; occurredAt?: Date; note?: string; food?: Food; nutrients?: Nutrients; servings?: number } = {},
): Consumption {
  return new Consumption({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    ...(overrides.nutrients !== undefined ? { nutrients: overrides.nutrients } : {}),
    food: overrides.food ?? (overrides.nutrients !== undefined ? undefined : makeFood()),
    ...(overrides.servings !== undefined ? { servings: overrides.servings } : {}),
  })
}

export function makeTransaction(
  overrides: { id?: Id; occurredAt?: Date; note?: string; amount?: Money; category?: string; direction?: TransactionDirection; account?: Account } = {},
): Transaction {
  return new Transaction({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    amount: overrides.amount ?? Money.usd(4210),
    category: overrides.category ?? 'groceries',
    direction: overrides.direction ?? 'expense',
    account: overrides.account ?? makeAccount(),
  })
}

export function makeMeasurement(
  overrides: { id?: Id; occurredAt?: Date; note?: string; metric?: string; value?: number } = {},
): Measurement {
  return new Measurement({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    metric: overrides.metric ?? 'body.weight_kg',
    value: overrides.value ?? 80,
  })
}

export function makeNote(
  overrides: { id?: Id; occurredAt?: Date; note?: string; text?: string; tags?: readonly string[] } = {},
): Note {
  return new Note({
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    occurredAt: overrides.occurredAt ?? DEFAULT_AT,
    ...(overrides.note !== undefined ? { note: overrides.note } : {}),
    text: overrides.text ?? 'Weekly reflection: good week.',
    tags: overrides.tags ?? ['gratitude'],
  })
}
```

Note: `makeConsumption`'s `food:` line passes `undefined` explicitly when nutrients are supplied — under `exactOptionalPropertyTypes` that's an error. Restructure to a conditional spread instead:

```ts
    ...(overrides.food !== undefined
      ? { food: overrides.food }
      : overrides.nutrients === undefined
        ? { food: makeFood() }
        : {}),
```

(Replace the `food:` line in `makeConsumption` with this spread.)

- [ ] **Step 4: Extend the seed**

Replace `packages/all-of-oyl/src/fixtures/seed.ts` with:

```ts
import { DayKey } from '../core/day-key'
import { DayRange } from '../core/day-range'
import type { Entry } from '../core/entry'
import { Money } from '../core/money'
import { Quantity } from '../core/quantity'
import {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeConsumption,
  makeFood,
  makeLifeArea,
  makeMeasurement,
  makeNote,
  makeTransaction,
  makeUser,
} from './builders'
import { FIXTURE_TODAY } from './constants'
import { fixtureId } from './fixture-id'

/**
 * The canonical dataset as wire shapes (toJSON). Sourceable: apps seed any
 * backend by walking these through repository adapters or an API; tests
 * revive them through reviveEntry/fromJSON — a standing round-trip test.
 * Personas: Avery (rich account), Blake (sparse). Phase 2 adds Avery's
 * catalogs and ~6 weeks of entries, deliberately exercising the spec's
 * semantics: a refund, an ad-hoc meal, and a DST-straddling March cluster.
 */
const avery = makeUser({ id: fixtureId(1), displayName: 'Avery', units: 'metric' })
const blake = makeUser({ id: fixtureId(2), displayName: 'Blake', timezone: 'America/Chicago' })

const areas = [
  makeLifeArea({ id: fixtureId(10), name: 'Health', slug: 'health' }),
  makeLifeArea({ id: fixtureId(11), name: 'Family', slug: 'family' }),
  makeLifeArea({ id: fixtureId(12), name: 'Career', slug: 'career' }),
  makeLifeArea({ id: fixtureId(13), name: 'Money', slug: 'money' }),
]

// ── Catalogs (id block 30-99) ───────────────────────────────────────────────
const run = makeActivity({ id: fixtureId(30), name: 'Run', slug: 'run', areaId: fixtureId(10) })
const meditate = makeActivity({ id: fixtureId(33), name: 'Meditate', slug: 'meditate', defaultUnit: 'minutes', areaId: fixtureId(10) })
const oatmeal = makeFood({ id: fixtureId(31), name: 'Oatmeal', nutrients: { calories: 150, protein: 5, carbs: 27, fat: 3 } })
const chickenBowl = makeFood({ id: fixtureId(34), name: 'Chicken Bowl', nutrients: { calories: 550, protein: 42, carbs: 45, fat: 18 } })
const checking = makeAccount({ id: fixtureId(32), name: 'Checking', currency: 'USD' })

// ── Entries (id block 100+); all instants are UTC, FIXTURE_TZ is UTC-4 in June ──
let nextEntryId = 100
const eid = () => fixtureId(nextEntryId++)
const at = (day: DayKey, hourUtc: number) => new Date(`${day.value}T${String(hourUtc).padStart(2, '0')}:00:00Z`)

const entries: Entry[] = []
const start = FIXTURE_TODAY.addDays(-41) // six weeks, inclusive of today
let dayIndex = 0
for (const day of DayRange.of(start, FIXTURE_TODAY)) {
  // breakfast every day; dinner most days
  entries.push(makeConsumption({ id: eid(), occurredAt: at(day, 12), food: oatmeal }))
  if (dayIndex % 3 !== 2) {
    entries.push(makeConsumption({ id: eid(), occurredAt: at(day, 23), food: chickenBowl }))
  }
  // run every other day, meditate on the off days
  if (dayIndex % 2 === 0) {
    entries.push(
      makeActivitySession({
        id: eid(),
        occurredAt: at(day, 11),
        activity: run,
        quantities: [Quantity.of(30, 'minutes'), Quantity.of(5, 'km')],
      }),
    )
  } else {
    entries.push(
      makeActivitySession({ id: eid(), occurredAt: at(day, 11), activity: meditate, quantities: [Quantity.of(15, 'minutes')] }),
    )
  }
  // daily gauges: weight drifts down, sleep and mood vary deterministically
  entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 11), metric: 'body.weight_kg', value: 82 - dayIndex * 0.05 }))
  entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 10), metric: 'sleep.hours', value: 6.5 + (dayIndex % 4) * 0.5 }))
  entries.push(makeMeasurement({ id: eid(), occurredAt: at(day, 22), metric: 'mood.score', value: 5 + (dayIndex % 5) }))
  // groceries every third day
  if (dayIndex % 3 === 0) {
    entries.push(
      makeTransaction({ id: eid(), occurredAt: at(day, 19), amount: Money.usd(6500 + (dayIndex % 7) * 300), category: 'groceries', account: checking }),
    )
  }
  // weekly reflection on Sundays
  if (day.weekday() === 7) {
    entries.push(makeNote({ id: eid(), occurredAt: at(day, 23), text: `Week ending ${day.value}: steady progress.`, tags: ['gratitude'] }))
  }
  dayIndex += 1
}

// Showcase: spec semantics a demo should display
entries.push(
  makeTransaction({
    id: eid(),
    occurredAt: at(FIXTURE_TODAY.addDays(-5), 20),
    amount: Money.usd(-1500),
    category: 'groceries',
    note: 'refund: returned the moldy berries',
    account: checking,
  }),
)
entries.push(
  makeConsumption({
    id: eid(),
    occurredAt: at(FIXTURE_TODAY.addDays(-3), 23),
    nutrients: { calories: 850, protein: 35, fat: 40 },
    note: 'ad-hoc: restaurant ramen, no catalog entry',
  }),
)
// March DST cluster (FIXTURE_TZ springs forward 2026-03-08)
for (const dayValue of ['2026-03-07', '2026-03-08', '2026-03-09']) {
  entries.push(makeMeasurement({ id: eid(), occurredAt: at(DayKey.of(dayValue), 11), metric: 'body.weight_kg', value: 84 }))
}

export const seed = {
  users: [avery.toJSON(), blake.toJSON()],
  lifeAreas: areas.map((a) => a.toJSON()),
  activities: [run.toJSON(), meditate.toJSON()],
  foods: [oatmeal.toJSON(), chickenBowl.toJSON()],
  accounts: [checking.toJSON()],
  entries: entries.map((e) => e.toJSON()),
}
```

- [ ] **Step 5: Export the new builders from the barrel**

In `packages/all-of-oyl/src/index.ts`, extend the builders export line:

```ts
export {
  makeAccount,
  makeActivity,
  makeActivitySession,
  makeConsumption,
  makeFood,
  makeLifeArea,
  makeMeasurement,
  makeNote,
  makeTransaction,
  makeUser,
} from './fixtures/builders'
```

(Replace the existing `export { makeLifeArea, makeUser } from './fixtures/builders'` line.)

- [ ] **Step 6: Verify pass + full gates, then commit**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts` → PASS.
Run: `pnpm --filter @oyl/all-of-oyl test` → all green.
Run: `pnpm --filter @oyl/all-of-oyl typecheck:src` → exit 0.
Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit` → exit 0.

```bash
git add packages/all-of-oyl/src/fixtures packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): phase 2 fixtures — builders + Avery's six-week seed"
```

---

## Phase 2 exit criteria

- [ ] `pnpm --filter @oyl/all-of-oyl test` green (all src + legacy modules).
- [ ] `pnpm --filter @oyl/all-of-oyl typecheck:src` green; package-wide `tsc --noEmit` green.
- [ ] No production dependencies added.
- [ ] Import discipline holds: `activity/`, `nutrition/`, `finance/`, `track/` import `core/` only — never each other; only `fixtures/` and `index.ts` know multiple modules.
- [ ] Every spec behavior in phase 2 scope has a test: slug snapshotting, quantity-unit slug validation, nutrient × servings emission, ad-hoc `foodId`-less consumption, explicit-nutrients override, currency match only-when-account-present, refund as negative spend, measurement reserved-namespace rejection, note tag dedupe + per-tag counts, `reviveEntry` dispatch + `UNKNOWN_KIND`, seed revival + idempotence + DST cluster + Journal hydration.
- [ ] Kind discriminants are exactly: `activity-session`, `consumption`, `transaction`, `measurement`, `note`.

## Explicitly NOT in phase 2 (resist the urge)

`Goal`/`GoalProgress`/`Budget` (phase 3), all of `plan/` and `vault/` (phases 4–5), `insights/` (phase 6), `share/` (phase 7), `revivePlan` (no Plan subclasses exist yet), and any aggregation changes to `Journal` — the spec's growth invariant forbids a second aggregation path.
