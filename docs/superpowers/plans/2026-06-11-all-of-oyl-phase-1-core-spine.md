# all-of-oyl Phase 1: Core Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core spine of the all-of-oyl domain layer — value objects, `Entry`/`Plan` abstracts, `Journal`, `Catalog`, the repository boundary, `User`, and the fixture conventions — exactly as specified in `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`.

**Architecture:** Pure TypeScript domain layer in `packages/all-of-oyl/src/`, zero runtime dependencies (platform `crypto.randomUUID()` and `Intl.DateTimeFormat` only). Branded strings for `Id`/`MetricKey`; classes with `equals()` for `Money`/`Quantity`/`DayKey`/`DayRange`/`Cadence`. No hidden clock anywhere in domain code. Strict TDD: every class begins as a failing Vitest test.

**Tech Stack:** TypeScript 5 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, ES2022, ESM), Vitest 4. No production dependencies.

**Read the spec first.** Every behavior below is mandated by `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`. When in doubt, the spec wins.

**Working conventions for every task:**
- Run tests from the repo root: `pnpm --filter @oyl/all-of-oyl test -- <path>` runs one file; `pnpm --filter @oyl/all-of-oyl test` runs all.
- Files are kebab-case, one class per file, named exports only, colocated `*.test.ts`.
- Commit after every green test run, from the repo root.

---

### Task 1: Tooling — vitest include + strict src tsconfig

The package's vitest config only includes `modules/**`; the tsconfig targets ES2017 without the spec's strict flags. Scope the new strictness to `src/` so legacy `modules/` is untouched.

**Files:**
- Modify: `packages/all-of-oyl/vitest.config.ts`
- Create: `packages/all-of-oyl/src/tsconfig.json`
- Modify: `packages/all-of-oyl/package.json` (add `typecheck:src` script)

- [ ] **Step 1: Add src to vitest include**

Edit `packages/all-of-oyl/vitest.config.ts` to:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['modules/**/*.test.ts', 'src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 2: Create the strict src tsconfig**

Create `packages/all-of-oyl/src/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "allowJs": false,
    "jsx": "preserve",
    "types": ["vitest/globals"],
    "incremental": false
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 3: Add the typecheck script**

In `packages/all-of-oyl/package.json`, add to `"scripts"`:

```json
"typecheck:src": "tsc -p src --noEmit"
```

- [ ] **Step 4: Verify the test runner on the empty src**

Run: `pnpm --filter @oyl/all-of-oyl test`
Expected: passes (`passWithNoTests`).

Note: `typecheck:src` will fail with "No inputs were found" until Task 2 creates the first `.ts` file — that's expected; first run it at the end of Task 2.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/vitest.config.ts packages/all-of-oyl/src/tsconfig.json packages/all-of-oyl/package.json
git commit -m "chore(all-of-oyl): vitest + strict tsconfig for src domain core"
```

---

### Task 2: DomainError

The single error class with a closed code union. Two codes (`INVALID_DAY`, `INVALID_TIMEZONE`) are deliberate additions to the spec's registry — update the spec line in the same commit.

**Files:**
- Create: `packages/all-of-oyl/src/core/domain-error.ts`
- Test: `packages/all-of-oyl/src/core/domain-error.test.ts`
- Modify: `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md` (error registry line)

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/domain-error.test.ts
import { describe, expect, it } from 'vitest'
import { DomainError } from './domain-error'

describe('DomainError', () => {
  it('carries a code and message and is an Error', () => {
    const err = new DomainError('CURRENCY_MISMATCH', 'cannot add USD to EUR')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('CURRENCY_MISMATCH')
    expect(err.message).toBe('cannot add USD to EUR')
    expect(err.name).toBe('DomainError')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/domain-error.test.ts`
Expected: FAIL — cannot resolve `./domain-error`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/domain-error.ts
export type DomainErrorCode =
  | 'INVALID_ID'
  | 'INVALID_SLUG'
  | 'INVALID_METRIC_KEY'
  | 'RESERVED_NAMESPACE'
  | 'INVALID_QUANTITY'
  | 'UNIT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'INVALID_RANGE'
  | 'INVALID_DAY'
  | 'INVALID_TIMEZONE'
  | 'ILLEGAL_TRANSITION'
  | 'DUPLICATE_ID'
  | 'REVISION_CONFLICT'
  | 'MALFORMED_JSON'
  | 'UNKNOWN_KIND'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/domain-error.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the spec's error registry**

In `docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md`, in the "Error handling" section, extend the code list: after `` `INVALID_RANGE` (`end < start`, pause `to < from`, `end ≤ start` time boxes), `` insert `` `INVALID_DAY` (malformed `YYYY-MM-DD`), `INVALID_TIMEZONE` (unknown IANA zone), ``.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/core/domain-error.ts packages/all-of-oyl/src/core/domain-error.test.ts docs/superpowers/specs/2026-06-11-all-of-oyl-domain-core-design.md
git commit -m "feat(all-of-oyl): DomainError with closed code union"
```

---

### Task 3: Slug validator

One grammar (`[a-z0-9_]+`) shared by activity slugs, categories, tags, and area slugs (spec: "One slug grammar everywhere").

**Files:**
- Create: `packages/all-of-oyl/src/core/slug.ts`
- Test: `packages/all-of-oyl/src/core/slug.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/slug.test.ts
import { describe, expect, it } from 'vitest'
import { assertSlug, isSlug } from './slug'
import { DomainError } from './domain-error'

describe('slug', () => {
  it.each(['run', 'guitar_practice', 'a1', '_x'])('accepts %s', (s) => {
    expect(isSlug(s)).toBe(true)
    expect(assertSlug(s)).toBe(s)
  })

  it.each(['', 'Run', 'two words', 'has-dash', 'dot.ted', 'émoji'])('rejects %s', (s) => {
    expect(isSlug(s)).toBe(false)
    expect(() => assertSlug(s)).toThrowError(DomainError)
    try {
      assertSlug(s)
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_SLUG')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/slug.test.ts`
Expected: FAIL — cannot resolve `./slug`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/slug.ts
import { DomainError } from './domain-error'

const SLUG_RE = /^[a-z0-9_]+$/

export function isSlug(value: string): boolean {
  return SLUG_RE.test(value)
}

export function assertSlug(value: string): string {
  if (!isSlug(value)) {
    throw new DomainError('INVALID_SLUG', `not a valid slug: "${value}" (expected [a-z0-9_]+)`)
  }
  return value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/slug.ts packages/all-of-oyl/src/core/slug.test.ts
git commit -m "feat(all-of-oyl): shared slug grammar validator"
```

---

### Task 4: Id (branded string)

Branded type + same-named namespace constant (`Id.create()`, `Id.of()`). Fixture ids are hand-assigned UUIDs, so `of` must accept any RFC-shaped UUID.

**Files:**
- Create: `packages/all-of-oyl/src/core/id.ts`
- Test: `packages/all-of-oyl/src/core/id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/id.test.ts
import { describe, expect, it } from 'vitest'
import { Id } from './id'
import { DomainError } from './domain-error'

describe('Id', () => {
  it('creates valid, unique ids', () => {
    const a = Id.create()
    const b = Id.create()
    expect(a).not.toBe(b)
    expect(Id.of(a)).toBe(a)
  })

  it('validates existing id strings', () => {
    const fixture = '00000000-0000-4000-8000-000000000001'
    expect(Id.of(fixture)).toBe(fixture)
  })

  it('rejects non-UUID strings with INVALID_ID', () => {
    for (const bad of ['', 'abc', '00000000-0000-4000-8000-00000000000']) {
      try {
        Id.of(bad)
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as DomainError).code).toBe('INVALID_ID')
      }
    }
  })

  it('compares with === (branded string)', () => {
    const a = Id.of('00000000-0000-4000-8000-000000000001')
    const b = Id.of('00000000-0000-4000-8000-000000000001')
    expect(a === b).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/id.test.ts`
Expected: FAIL — cannot resolve `./id`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/id.ts
import { DomainError } from './domain-error'

export type Id = string & { readonly __brand: 'Id' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function create(): Id {
  return crypto.randomUUID() as Id
}

function of(value: string): Id {
  if (!UUID_RE.test(value)) {
    throw new DomainError('INVALID_ID', `not a valid id: "${value}"`)
  }
  return value as Id
}

export const Id = { create, of }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/id.ts packages/all-of-oyl/src/core/id.test.ts
git commit -m "feat(all-of-oyl): branded Id with create/of factories"
```

---

### Task 5: MetricKey (branded string) + namespace registry

Dot-namespaced, ≥2 segments, each a slug. `KNOWN_NAMESPACES` is the ownership registry; `MEASUREMENT_NAMESPACES` is the subset hand-loggable by `Measurement` (used in phase 2, defined here with the registry).

**Files:**
- Create: `packages/all-of-oyl/src/core/metric-key.ts`
- Test: `packages/all-of-oyl/src/core/metric-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/metric-key.test.ts
import { describe, expect, it } from 'vitest'
import { KNOWN_NAMESPACES, MEASUREMENT_NAMESPACES, MetricKey } from './metric-key'
import { DomainError } from './domain-error'

describe('MetricKey', () => {
  it.each(['nutrition.calories', 'finance.spend.groceries', 'custom.guitar_practice_minutes'])(
    'accepts %s',
    (k) => {
      expect(MetricKey.of(k)).toBe(k)
    },
  )

  it.each(['calories', 'nutrition.', '.calories', 'a.B', 'a.two words', 'a..b', ''])(
    'rejects %s with INVALID_METRIC_KEY',
    (k) => {
      try {
        MetricKey.of(k)
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as DomainError).code).toBe('INVALID_METRIC_KEY')
      }
    },
  )

  it('exposes the namespace', () => {
    expect(MetricKey.namespaceOf(MetricKey.of('finance.spend.groceries'))).toBe('finance')
  })

  it('publishes the ownership registry from the spec', () => {
    expect(KNOWN_NAMESPACES).toEqual([
      'activity', 'nutrition', 'finance', 'body', 'sleep', 'mood', 'screen', 'home', 'note',
    ])
    expect(MEASUREMENT_NAMESPACES).toEqual(['body', 'sleep', 'mood', 'screen', 'home', 'custom'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/metric-key.test.ts`
Expected: FAIL — cannot resolve `./metric-key`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/metric-key.ts
import { DomainError } from './domain-error'
import { isSlug } from './slug'

export type MetricKey = string & { readonly __brand: 'MetricKey' }

/**
 * Ownership registry for top-level metric namespaces (see spec, "Extending
 * the app's purpose"). `custom.` is permanently reserved for user-defined
 * metrics and never claimed by a built-in. Claiming a new namespace is a
 * one-line, reviewed change here.
 */
export const KNOWN_NAMESPACES = [
  'activity', 'nutrition', 'finance', 'body', 'sleep', 'mood', 'screen', 'home', 'note',
] as const

/** Namespaces a hand-logged Measurement may write into (phase 2). */
export const MEASUREMENT_NAMESPACES = ['body', 'sleep', 'mood', 'screen', 'home', 'custom'] as const

function of(value: string): MetricKey {
  const segments = value.split('.')
  if (segments.length < 2 || !segments.every(isSlug)) {
    throw new DomainError(
      'INVALID_METRIC_KEY',
      `not a valid metric key: "${value}" (expected 2+ dot-joined [a-z0-9_]+ segments)`,
    )
  }
  return value as MetricKey
}

function namespaceOf(key: MetricKey): string {
  return key.split('.', 1)[0] as string
}

export const MetricKey = { of, namespaceOf }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/metric-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/metric-key.ts packages/all-of-oyl/src/core/metric-key.test.ts
git commit -m "feat(all-of-oyl): branded MetricKey + namespace registry"
```

---

### Task 6: DayKey

Timezone-explicit calendar day. The only `Intl` consumer in the codebase. Serializes as its `YYYY-MM-DD` string.

**Files:**
- Create: `packages/all-of-oyl/src/core/day-key.ts`
- Test: `packages/all-of-oyl/src/core/day-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/day-key.test.ts
import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

describe('DayKey', () => {
  it('buckets an instant into a day per explicit timezone', () => {
    // 2026-06-02T01:30Z is the evening of June 1 in New York, morning of June 2 in Tokyo
    const instant = new Date('2026-06-02T01:30:00Z')
    expect(DayKey.from(instant, 'America/New_York').value).toBe('2026-06-01')
    expect(DayKey.from(instant, 'Asia/Tokyo').value).toBe('2026-06-02')
  })

  it('handles DST transition days (spring forward in New York, 2026-03-08)', () => {
    // 06:59Z is 01:59 EST (still Mar 8); 23:59Z on Mar 8 is 19:59 EDT (still Mar 8)
    expect(DayKey.from(new Date('2026-03-08T06:59:00Z'), 'America/New_York').value).toBe('2026-03-08')
    expect(DayKey.from(new Date('2026-03-08T23:59:00Z'), 'America/New_York').value).toBe('2026-03-08')
  })

  it('parses and validates day strings', () => {
    expect(DayKey.of('2026-06-01').value).toBe('2026-06-01')
    for (const bad of ['2026-6-1', '2026-13-01', '2026-02-30', 'garbage', '']) {
      try {
        DayKey.of(bad)
        expect.unreachable(`should have thrown for ${bad}`)
      } catch (e) {
        expect((e as DomainError).code).toBe('INVALID_DAY')
      }
    }
  })

  it('rejects unknown timezones with INVALID_TIMEZONE', () => {
    try {
      DayKey.from(new Date(), 'Mars/Olympus_Mons')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_TIMEZONE')
    }
  })

  it('adds days across month and year boundaries', () => {
    expect(DayKey.of('2026-01-31').addDays(1).value).toBe('2026-02-01')
    expect(DayKey.of('2026-12-31').addDays(1).value).toBe('2027-01-01')
    expect(DayKey.of('2026-03-01').addDays(-1).value).toBe('2026-02-28')
    expect(DayKey.of('2024-03-01').addDays(-1).value).toBe('2024-02-29') // leap year
  })

  it('compares and equals', () => {
    const a = DayKey.of('2026-06-01')
    const b = DayKey.of('2026-06-02')
    expect(a.compare(b)).toBeLessThan(0)
    expect(b.compare(a)).toBeGreaterThan(0)
    expect(a.equals(DayKey.of('2026-06-01'))).toBe(true)
    expect(a.equals(b)).toBe(false)
  })

  it('reports ISO weekday (Mon=1 … Sun=7)', () => {
    expect(DayKey.of('2026-06-01').weekday()).toBe(1) // Monday
    expect(DayKey.of('2026-06-07').weekday()).toBe(7) // Sunday
  })

  it('serializes as its string', () => {
    expect(DayKey.of('2026-06-01').toJSON()).toBe('2026-06-01')
    expect(DayKey.fromJSON('2026-06-01').equals(DayKey.of('2026-06-01'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/day-key.test.ts`
Expected: FAIL — cannot resolve `./day-key`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/day-key.ts
import { DomainError } from './domain-error'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function assertTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return tz
  } catch {
    throw new DomainError('INVALID_TIMEZONE', `unknown IANA timezone: "${tz}"`)
  }
}

export class DayKey {
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /** Bucket an instant into a calendar day in an explicit IANA timezone. */
  static from(instant: Date, tz: string): DayKey {
    assertTimezone(tz)
    // en-CA formats as YYYY-MM-DD
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant)
    return new DayKey(formatted)
  }

  static of(value: string): DayKey {
    const m = DAY_RE.exec(value)
    if (!m) throw new DomainError('INVALID_DAY', `not a valid day: "${value}"`)
    const [, y, mo, d] = m as unknown as [string, string, string, string]
    const year = Number(y)
    const month = Number(mo)
    const day = Number(d)
    // Round-trip through UTC to reject impossible dates like 2026-02-30
    const probe = new Date(Date.UTC(year, month - 1, day))
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new DomainError('INVALID_DAY', `no such day: "${value}"`)
    }
    return new DayKey(value)
  }

  static fromJSON(value: string): DayKey {
    return DayKey.of(value)
  }

  private toUTC(): Date {
    const [y, m, d] = this.value.split('-').map(Number) as [number, number, number]
    return new Date(Date.UTC(y, m - 1, d))
  }

  addDays(n: number): DayKey {
    const utc = this.toUTC()
    utc.setUTCDate(utc.getUTCDate() + n)
    const y = utc.getUTCFullYear()
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
    const d = String(utc.getUTCDate()).padStart(2, '0')
    return new DayKey(`${y}-${m}-${d}`)
  }

  /** ISO weekday: Monday = 1 … Sunday = 7. */
  weekday(): number {
    const sundayBased = this.toUTC().getUTCDay() // 0=Sun … 6=Sat
    return sundayBased === 0 ? 7 : sundayBased
  }

  compare(other: DayKey): number {
    return this.value < other.value ? -1 : this.value > other.value ? 1 : 0
  }

  equals(other: DayKey): boolean {
    return this.value === other.value
  }

  toJSON(): string {
    return this.value
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/day-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/day-key.ts packages/all-of-oyl/src/core/day-key.test.ts
git commit -m "feat(all-of-oyl): timezone-explicit DayKey value object"
```

---

### Task 7: DayRange

Inclusive, iterable, the one range type every range-taking signature shares.

**Files:**
- Create: `packages/all-of-oyl/src/core/day-range.ts`
- Test: `packages/all-of-oyl/src/core/day-range.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/day-range.test.ts
import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { DayRange } from './day-range'
import { DomainError } from './domain-error'

describe('DayRange', () => {
  it('is inclusive on both ends and iterable', () => {
    const range = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect([...range].map((d) => d.value)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('contains its boundary days', () => {
    const range = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect(range.contains(DayKey.of('2026-06-01'))).toBe(true)
    expect(range.contains(DayKey.of('2026-06-03'))).toBe(true)
    expect(range.contains(DayKey.of('2026-05-31'))).toBe(false)
    expect(range.contains(DayKey.of('2026-06-04'))).toBe(false)
  })

  it('allows a single-day range', () => {
    const day = DayKey.of('2026-06-01')
    expect([...DayRange.of(day, day)].map((d) => d.value)).toEqual(['2026-06-01'])
  })

  it('rejects end < start with INVALID_RANGE', () => {
    try {
      DayRange.of(DayKey.of('2026-06-02'), DayKey.of('2026-06-01'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_RANGE')
    }
  })

  it('equals by value', () => {
    const a = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    const b = DayRange.of(DayKey.of('2026-06-01'), DayKey.of('2026-06-03'))
    expect(a.equals(b)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/day-range.test.ts`
Expected: FAIL — cannot resolve `./day-range`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/day-range.ts
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

export class DayRange {
  readonly start: DayKey
  readonly end: DayKey

  private constructor(start: DayKey, end: DayKey) {
    this.start = start
    this.end = end
  }

  static of(start: DayKey, end: DayKey): DayRange {
    if (end.compare(start) < 0) {
      throw new DomainError('INVALID_RANGE', `range end ${end.value} precedes start ${start.value}`)
    }
    return new DayRange(start, end)
  }

  contains(day: DayKey): boolean {
    return day.compare(this.start) >= 0 && day.compare(this.end) <= 0
  }

  *[Symbol.iterator](): Iterator<DayKey> {
    for (let day = this.start; day.compare(this.end) <= 0; day = day.addDays(1)) {
      yield day
    }
  }

  equals(other: DayRange): boolean {
    return this.start.equals(other.start) && this.end.equals(other.end)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/day-range.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/day-range.ts packages/all-of-oyl/src/core/day-range.test.ts
git commit -m "feat(all-of-oyl): inclusive iterable DayRange"
```

---

### Task 8: Cadence

Anchor-based recurrence — occurrences are always computed from the anchor (occurrence k), clamping each independently, so schedules never drift. `nextAfter` is the deliberate re-anchoring sugar.

**Files:**
- Create: `packages/all-of-oyl/src/core/cadence.ts`
- Test: `packages/all-of-oyl/src/core/cadence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/cadence.test.ts
import { describe, expect, it } from 'vitest'
import { Cadence } from './cadence'
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

const day = (s: string) => DayKey.of(s)

describe('Cadence', () => {
  it('steps days and weeks from the anchor', () => {
    expect(Cadence.of(10, 'days').nextOnOrAfter(day('2026-06-01'), day('2026-06-02')).value).toBe('2026-06-11')
    expect(Cadence.of(2, 'weeks').nextOnOrAfter(day('2026-06-01'), day('2026-06-16')).value).toBe('2026-06-29')
  })

  it('returns the anchor itself when asOf is on or before it', () => {
    expect(Cadence.of(1, 'months').nextOnOrAfter(day('2026-06-15'), day('2026-06-01')).value).toBe('2026-06-15')
    expect(Cadence.of(1, 'months').nextOnOrAfter(day('2026-06-15'), day('2026-06-15')).value).toBe('2026-06-15')
  })

  it('clamps month-end per occurrence without drifting', () => {
    const monthly = Cadence.of(1, 'months')
    const anchor = day('2026-01-31')
    expect(monthly.nextOnOrAfter(anchor, day('2026-02-01')).value).toBe('2026-02-28')
    // the anchor is preserved: March returns to the 31st, not the 28th
    expect(monthly.nextOnOrAfter(anchor, day('2026-03-01')).value).toBe('2026-03-31')
  })

  it('handles Feb 29 anchors yearly', () => {
    const yearly = Cadence.of(1, 'years')
    const anchor = day('2024-02-29')
    expect(yearly.nextOnOrAfter(anchor, day('2025-01-01')).value).toBe('2025-02-28')
    expect(yearly.nextOnOrAfter(anchor, day('2028-01-01')).value).toBe('2028-02-29')
  })

  it('nextAfter re-anchors from the given day', () => {
    expect(Cadence.of(7, 'days').nextAfter(day('2026-06-03')).value).toBe('2026-06-10')
  })

  it('rejects n < 1 with INVALID_QUANTITY', () => {
    for (const n of [0, -1, 1.5]) {
      try {
        Cadence.of(n, 'days')
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as DomainError).code).toBe('INVALID_QUANTITY')
      }
    }
  })

  it('equals by value and serializes', () => {
    expect(Cadence.of(2, 'weeks').equals(Cadence.of(2, 'weeks'))).toBe(true)
    expect(Cadence.of(2, 'weeks').toJSON()).toEqual({ n: 2, unit: 'weeks' })
    expect(Cadence.fromJSON({ n: 2, unit: 'weeks' }).equals(Cadence.of(2, 'weeks'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/cadence.test.ts`
Expected: FAIL — cannot resolve `./cadence`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/cadence.ts
import { DayKey } from './day-key'
import { DomainError } from './domain-error'

export type CadenceUnit = 'days' | 'weeks' | 'months' | 'years'

const UNITS: readonly CadenceUnit[] = ['days', 'weeks', 'months', 'years']

function parts(day: DayKey): { y: number; m: number; d: number } {
  const [y, m, d] = day.value.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** k-th occurrence from the anchor; month/year occurrences clamp independently. */
function occurrence(anchor: DayKey, n: number, unit: CadenceUnit, k: number): DayKey {
  if (unit === 'days') return anchor.addDays(k * n)
  if (unit === 'weeks') return anchor.addDays(k * n * 7)
  const { y, m, d } = parts(anchor)
  const monthStep = unit === 'months' ? k * n : k * n * 12
  const total = (m - 1) + monthStep
  const year = y + Math.floor(total / 12)
  const month = (total % 12) + 1
  const day = Math.min(d, daysInMonth(year, month))
  return DayKey.of(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  )
}

export class Cadence {
  readonly n: number
  readonly unit: CadenceUnit

  private constructor(n: number, unit: CadenceUnit) {
    this.n = n
    this.unit = unit
  }

  static of(n: number, unit: CadenceUnit): Cadence {
    if (!Number.isInteger(n) || n < 1) {
      throw new DomainError('INVALID_QUANTITY', `cadence n must be an integer >= 1, got ${n}`)
    }
    return new Cadence(n, unit)
  }

  /** First anchored occurrence on or after asOf. Anchor-based: never drifts. */
  nextOnOrAfter(anchor: DayKey, asOf: DayKey): DayKey {
    if (asOf.compare(anchor) <= 0) return anchor
    // Estimate k, then walk to the exact first occurrence >= asOf.
    let k = 1
    if (this.unit === 'days' || this.unit === 'weeks') {
      const span = this.unit === 'days' ? this.n : this.n * 7
      const diffDays = Math.round(
        (Date.parse(`${asOf.value}T00:00:00Z`) - Date.parse(`${anchor.value}T00:00:00Z`)) / 86_400_000,
      )
      k = Math.max(1, Math.ceil(diffDays / span))
    } else {
      const a = parts(anchor)
      const b = parts(asOf)
      const monthsPerStep = this.unit === 'months' ? this.n : this.n * 12
      const diffMonths = (b.y - a.y) * 12 + (b.m - a.m)
      k = Math.max(1, Math.floor(diffMonths / monthsPerStep))
    }
    while (occurrence(anchor, this.n, this.unit, k).compare(asOf) < 0) k += 1
    while (k > 1 && occurrence(anchor, this.n, this.unit, k - 1).compare(asOf) >= 0) k -= 1
    return occurrence(anchor, this.n, this.unit, k)
  }

  /** Sugar for deliberate re-anchoring (duty cadences): next occurrence strictly after day. */
  nextAfter(day: DayKey): DayKey {
    return this.nextOnOrAfter(day, day.addDays(1))
  }

  equals(other: Cadence): boolean {
    return this.n === other.n && this.unit === other.unit
  }

  toJSON(): { n: number; unit: CadenceUnit } {
    return { n: this.n, unit: this.unit }
  }

  static fromJSON(shape: unknown): Cadence {
    const s = shape as { n?: unknown; unit?: unknown }
    if (typeof s?.n !== 'number' || !UNITS.includes(s?.unit as CadenceUnit)) {
      throw new DomainError('MALFORMED_JSON', 'not a Cadence shape')
    }
    return Cadence.of(s.n, s.unit as CadenceUnit)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/cadence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/cadence.ts packages/all-of-oyl/src/core/cadence.test.ts
git commit -m "feat(all-of-oyl): anchor-based Cadence recurrence"
```

---

### Task 9: Quantity

Amount + unit string; arithmetic only between matching units.

**Files:**
- Create: `packages/all-of-oyl/src/core/quantity.ts`
- Test: `packages/all-of-oyl/src/core/quantity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/quantity.test.ts
import { describe, expect, it } from 'vitest'
import { Quantity } from './quantity'
import { DomainError } from './domain-error'

describe('Quantity', () => {
  it('holds an amount and a unit', () => {
    const q = Quantity.of(30, 'min')
    expect(q.amount).toBe(30)
    expect(q.unit).toBe('min')
  })

  it('adds matching units', () => {
    expect(Quantity.of(30, 'min').add(Quantity.of(15, 'min')).amount).toBe(45)
  })

  it('rejects mismatched units with UNIT_MISMATCH', () => {
    try {
      Quantity.of(30, 'min').add(Quantity.of(2, 'km'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('UNIT_MISMATCH')
    }
  })

  it('rejects non-finite amounts and invalid units', () => {
    for (const bad of [NaN, Infinity]) {
      try {
        Quantity.of(bad, 'min')
        expect.unreachable('should have thrown')
      } catch (e) {
        expect((e as DomainError).code).toBe('INVALID_QUANTITY')
      }
    }
    try {
      Quantity.of(1, '')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_QUANTITY')
    }
  })

  it('equals by value and serializes', () => {
    expect(Quantity.of(2, 'servings').equals(Quantity.of(2, 'servings'))).toBe(true)
    expect(Quantity.of(2, 'servings').toJSON()).toEqual({ amount: 2, unit: 'servings' })
    expect(Quantity.fromJSON({ amount: 2, unit: 'servings' }).amount).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/quantity.test.ts`
Expected: FAIL — cannot resolve `./quantity`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/quantity.ts
import { DomainError } from './domain-error'

export class Quantity {
  readonly amount: number
  readonly unit: string

  private constructor(amount: number, unit: string) {
    this.amount = amount
    this.unit = unit
  }

  static of(amount: number, unit: string): Quantity {
    if (!Number.isFinite(amount)) {
      throw new DomainError('INVALID_QUANTITY', `amount must be finite, got ${amount}`)
    }
    if (unit.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'unit must be a non-empty string')
    }
    return new Quantity(amount, unit)
  }

  private assertSameUnit(other: Quantity): void {
    if (this.unit !== other.unit) {
      throw new DomainError('UNIT_MISMATCH', `cannot combine ${this.unit} with ${other.unit}`)
    }
  }

  add(other: Quantity): Quantity {
    this.assertSameUnit(other)
    return new Quantity(this.amount + other.amount, this.unit)
  }

  subtract(other: Quantity): Quantity {
    this.assertSameUnit(other)
    return new Quantity(this.amount - other.amount, this.unit)
  }

  equals(other: Quantity): boolean {
    return this.amount === other.amount && this.unit === other.unit
  }

  toJSON(): { amount: number; unit: string } {
    return { amount: this.amount, unit: this.unit }
  }

  static fromJSON(shape: unknown): Quantity {
    const s = shape as { amount?: unknown; unit?: unknown }
    if (typeof s?.amount !== 'number' || typeof s?.unit !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a Quantity shape')
    }
    return Quantity.of(s.amount, s.unit)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/quantity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/quantity.ts packages/all-of-oyl/src/core/quantity.test.ts
git commit -m "feat(all-of-oyl): unit-checked Quantity value object"
```

---

### Task 10: Money

Integer minor units + currency + exponent. Negative legal (refunds). No float arithmetic.

**Files:**
- Create: `packages/all-of-oyl/src/core/money.ts`
- Test: `packages/all-of-oyl/src/core/money.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/money.test.ts
import { describe, expect, it } from 'vitest'
import { Money } from './money'
import { DomainError } from './domain-error'

describe('Money', () => {
  it('stores integer minor units; usd factory', () => {
    const m = Money.usd(4210)
    expect(m.minor).toBe(4210)
    expect(m.currency).toBe('USD')
    expect(m.exponent).toBe(2)
    expect(m.toNumber()).toBe(42.1)
  })

  it('supports exponent-0 currencies', () => {
    const yen = Money.of(500, 'JPY', 0)
    expect(yen.toNumber()).toBe(500)
  })

  it('allows negative amounts (refunds)', () => {
    expect(Money.usd(-1500).toNumber()).toBe(-15)
    expect(Money.usd(2000).add(Money.usd(-1500)).minor).toBe(500)
  })

  it('adds and subtracts matching currency', () => {
    expect(Money.usd(100).add(Money.usd(50)).minor).toBe(150)
    expect(Money.usd(100).subtract(Money.usd(50)).minor).toBe(50)
  })

  it('rejects cross-currency arithmetic with CURRENCY_MISMATCH', () => {
    try {
      Money.usd(100).add(Money.of(100, 'EUR'))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('CURRENCY_MISMATCH')
    }
  })

  it('rejects non-integer minor units', () => {
    try {
      Money.of(10.5, 'USD')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_QUANTITY')
    }
  })

  it('equals by value and round-trips JSON', () => {
    expect(Money.usd(4210).equals(Money.of(4210, 'USD', 2))).toBe(true)
    const shape = Money.usd(4210).toJSON()
    expect(shape).toEqual({ minor: 4210, currency: 'USD', exponent: 2 })
    expect(Money.fromJSON(shape).equals(Money.usd(4210))).toBe(true)
  })

  it('reconstructs exact Money from a major-unit float (Budget seam)', () => {
    expect(Money.fromMajor(42.1, 'USD', 2).minor).toBe(4210)
    expect(Money.fromMajor(0.30000000000000004, 'USD', 2).minor).toBe(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/money.test.ts`
Expected: FAIL — cannot resolve `./money`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/money.ts
import { DomainError } from './domain-error'

export class Money {
  readonly minor: number
  readonly currency: string
  readonly exponent: number

  private constructor(minor: number, currency: string, exponent: number) {
    this.minor = minor
    this.currency = currency
    this.exponent = exponent
  }

  static of(minor: number, currency: string, exponent = 2): Money {
    if (!Number.isInteger(minor)) {
      throw new DomainError('INVALID_QUANTITY', `minor units must be an integer, got ${minor}`)
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${currency}"`)
    }
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
      throw new DomainError('INVALID_QUANTITY', `exponent must be an integer in [0, 4], got ${exponent}`)
    }
    return new Money(minor, currency, exponent)
  }

  static usd(minor: number): Money {
    return Money.of(minor, 'USD', 2)
  }

  /** Round a major-unit number back to exact minor units (the Budget seam). */
  static fromMajor(major: number, currency: string, exponent = 2): Money {
    return Money.of(Math.round(major * 10 ** exponent), currency, exponent)
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency || this.exponent !== other.exponent) {
      throw new DomainError('CURRENCY_MISMATCH', `cannot combine ${this.currency} with ${other.currency}`)
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.minor + other.minor, this.currency, this.exponent)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this.minor - other.minor, this.currency, this.exponent)
  }

  /** Major units, for metric emission only — never for arithmetic. */
  toNumber(): number {
    return this.minor / 10 ** this.exponent
  }

  equals(other: Money): boolean {
    return this.minor === other.minor && this.currency === other.currency && this.exponent === other.exponent
  }

  toJSON(): { minor: number; currency: string; exponent: number } {
    return { minor: this.minor, currency: this.currency, exponent: this.exponent }
  }

  static fromJSON(shape: unknown): Money {
    const s = shape as { minor?: unknown; currency?: unknown; exponent?: unknown }
    if (typeof s?.minor !== 'number' || typeof s?.currency !== 'string' || typeof s?.exponent !== 'number') {
      throw new DomainError('MALFORMED_JSON', 'not a Money shape')
    }
    return Money.of(s.minor, s.currency, s.exponent)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/money.ts packages/all-of-oyl/src/core/money.test.ts
git commit -m "feat(all-of-oyl): integer-minor-unit Money value object"
```

---

### Task 11: LifeArea + the tolerant-reader pattern

First persistable entity. Establishes two patterns every later entity copies: `meta?: PersistedMeta` (mutable, repo-owned) and the tolerant reader (unknown JSON fields preserved through round-trips). `PersistedMeta` is a plain shape defined here.

**Files:**
- Create: `packages/all-of-oyl/src/core/persisted-meta.ts`
- Create: `packages/all-of-oyl/src/core/life-area.ts`
- Test: `packages/all-of-oyl/src/core/life-area.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/life-area.test.ts
import { describe, expect, it } from 'vitest'
import { Id } from './id'
import { LifeArea } from './life-area'
import { DomainError } from './domain-error'

describe('LifeArea', () => {
  it('constructs with generated id and validated slug', () => {
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    expect(area.name).toBe('Health')
    expect(area.slug).toBe('health')
    expect(Id.of(area.id)).toBe(area.id)
    expect(area.meta).toBeUndefined()
  })

  it('rejects invalid slugs', () => {
    try {
      new LifeArea({ name: 'Health', slug: 'Heal th' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_SLUG')
    }
  })

  it('round-trips JSON exactly', () => {
    const area = new LifeArea({ id: Id.of('00000000-0000-4000-8000-000000000010'), name: 'Health', slug: 'health' })
    const revived = LifeArea.fromJSON(area.toJSON())
    expect(revived.id).toBe(area.id)
    expect(revived.name).toBe('Health')
    expect(revived.slug).toBe('health')
  })

  it('tolerant reader: preserves unknown fields through a round-trip', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Health',
      slug: 'health',
      futureField: { nested: true },
    }
    const out = LifeArea.fromJSON(shape).toJSON() as Record<string, unknown>
    expect(out['futureField']).toEqual({ nested: true })
    expect(out['name']).toBe('Health')
  })

  it('throws MALFORMED_JSON on bad known fields', () => {
    try {
      LifeArea.fromJSON({ id: 'nope', name: 'Health', slug: 'health' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('MALFORMED_JSON')
    }
  })

  it('carries meta through JSON when present', () => {
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    area.meta = { createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-01T00:00:00Z'), revision: 1 }
    const out = LifeArea.fromJSON(area.toJSON())
    expect(out.meta?.revision).toBe(1)
    expect(out.meta?.createdAt.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/life-area.test.ts`
Expected: FAIL — cannot resolve `./life-area`.

- [ ] **Step 3: Write PersistedMeta (plain shape + JSON helpers)**

```ts
// packages/all-of-oyl/src/core/persisted-meta.ts
import { DomainError } from './domain-error'

/**
 * Storage bookkeeping for persisted records. A plain shape, not a class:
 * repositories build and replace it wholesale; domain logic never branches
 * on it. Optional on every persistable entity (absent until first save).
 */
export type PersistedMeta = {
  createdAt: Date
  updatedAt: Date
  revision: number
  deletedAt?: Date
}

export type PersistedMetaShape = {
  createdAt: string
  updatedAt: string
  revision: number
  deletedAt?: string
}

export function metaToJSON(meta: PersistedMeta): PersistedMetaShape {
  return {
    createdAt: meta.createdAt.toISOString(),
    updatedAt: meta.updatedAt.toISOString(),
    revision: meta.revision,
    ...(meta.deletedAt ? { deletedAt: meta.deletedAt.toISOString() } : {}),
  }
}

export function metaFromJSON(shape: unknown): PersistedMeta {
  const s = shape as Partial<PersistedMetaShape>
  if (typeof s?.createdAt !== 'string' || typeof s?.updatedAt !== 'string' || typeof s?.revision !== 'number') {
    throw new DomainError('MALFORMED_JSON', 'not a PersistedMeta shape')
  }
  return {
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    revision: s.revision,
    ...(typeof s.deletedAt === 'string' ? { deletedAt: new Date(s.deletedAt) } : {}),
  }
}
```

- [ ] **Step 4: Write LifeArea**

```ts
// packages/all-of-oyl/src/core/life-area.ts
import { DomainError } from './domain-error'
import { Id } from './id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from './persisted-meta'
import { assertSlug } from './slug'

export class LifeArea {
  readonly id: Id
  readonly name: string
  readonly slug: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  /** Tolerant reader: unknown JSON fields preserved through round-trips. */
  private readonly extra: Record<string, unknown>

  constructor(props: { id?: Id; name: string; slug: string }, extra: Record<string, unknown> = {}) {
    if (props.name.length === 0) throw new DomainError('INVALID_QUANTITY', 'name must be non-empty')
    this.id = props.id ?? Id.create()
    this.name = props.name
    this.slug = assertSlug(props.slug)
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      name: this.name,
      slug: this.slug,
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): LifeArea {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a LifeArea shape')
    }
    const { id, name, slug, meta, ...extra } = shape as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof slug !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'not a LifeArea shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `LifeArea has malformed id: "${id}"`)
    }
    const area = new LifeArea({ id: parsedId, name, slug }, extra)
    if (meta !== undefined) area.meta = metaFromJSON(meta)
    return area
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/life-area.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/core/persisted-meta.ts packages/all-of-oyl/src/core/life-area.ts packages/all-of-oyl/src/core/life-area.test.ts
git commit -m "feat(all-of-oyl): PersistedMeta + LifeArea with tolerant-reader serialization"
```

---

### Task 12: Entry (abstract)

The Journal-side spine: `id`, `kind`, `occurredAt`, optional `note`, abstract `metrics()`. Deeply immutable.

**Files:**
- Create: `packages/all-of-oyl/src/core/entry.ts`
- Test: `packages/all-of-oyl/src/core/entry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/entry.test.ts
import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import { Id } from './id'
import { MetricKey } from './metric-key'

class TestEntry extends Entry {
  private readonly values: ReadonlyMap<MetricKey, number>

  constructor(props: { id?: Id; occurredAt: Date; note?: string; values?: Record<string, number> }) {
    const { values = {}, ...base } = props
    super('test', base)
    this.values = new Map(Object.entries(values).map(([k, v]) => [MetricKey.of(k), v]))
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return this.values
  }
}

describe('Entry', () => {
  it('carries id, kind, occurredAt, optional note', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ occurredAt: at, note: 'hello' })
    expect(e.kind).toBe('test')
    expect(e.occurredAt.toISOString()).toBe(at.toISOString())
    expect(e.note).toBe('hello')
    expect(Id.of(e.id)).toBe(e.id)
  })

  it('defends occurredAt against external mutation', () => {
    const at = new Date('2026-06-01T12:00:00Z')
    const e = new TestEntry({ occurredAt: at })
    at.setUTCFullYear(1999)
    expect(e.occurredAt.getUTCFullYear()).toBe(2026)
    e.occurredAt.setUTCFullYear(1999)
    expect(e.occurredAt.getUTCFullYear()).toBe(2026)
  })

  it('subclasses report metrics', () => {
    const e = new TestEntry({ occurredAt: new Date(), values: { 'test.value': 7 } })
    expect(e.metrics().get(MetricKey.of('test.value'))).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/entry.test.ts`
Expected: FAIL — cannot resolve `./entry`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/entry.ts
import { Id } from './id'
import type { MetricKey } from './metric-key'
import type { PersistedMeta } from './persisted-meta'

/**
 * A timestamped record of something you did. One of two abstract classes in
 * the system (the other is Plan). Subclasses fix `kind` (the serialization
 * discriminant) and implement `metrics()` — what this moment contributed to
 * your life, in numbers.
 */
export abstract class Entry {
  readonly id: Id
  readonly kind: string
  readonly note?: string
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private readonly occurredAtMs: number

  protected constructor(kind: string, props: { id?: Id; occurredAt: Date; note?: string }) {
    this.kind = kind
    this.id = props.id ?? Id.create()
    this.occurredAtMs = props.occurredAt.getTime()
    if (props.note !== undefined) this.note = props.note
  }

  /** Always a fresh Date — entries are deeply immutable. */
  get occurredAt(): Date {
    return new Date(this.occurredAtMs)
  }

  abstract metrics(): ReadonlyMap<MetricKey, number>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/entry.ts packages/all-of-oyl/src/core/entry.test.ts
git commit -m "feat(all-of-oyl): abstract Entry with metrics contract"
```

---

### Task 13: Plan (abstract)

The Planner-side spine: status machine (`open → done|canceled`), `complete(on, entryId?)` with `completedOn`, `cancel()`, fulfillment links. Stateful entity (mutates in place).

**Files:**
- Create: `packages/all-of-oyl/src/core/plan.ts`
- Test: `packages/all-of-oyl/src/core/plan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/plan.test.ts
import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { Id } from './id'
import { Plan } from './plan'
import { DomainError } from './domain-error'

class TestPlan extends Plan {
  constructor(props: { id?: Id; title: string; due?: DayKey }) {
    super('test-plan', props)
  }
}

const day = (s: string) => DayKey.of(s)

describe('Plan', () => {
  it('starts open with no completedOn', () => {
    const p = new TestPlan({ title: 'Write tests' })
    expect(p.status).toBe('open')
    expect(p.completedOn).toBeUndefined()
    expect(p.fulfilledBy).toEqual([])
  })

  it('complete(on, entryId?) records when and links the entry', () => {
    const p = new TestPlan({ title: 'Run', due: day('2026-06-02') })
    const entryId = Id.create()
    p.complete(day('2026-06-01'), entryId)
    expect(p.status).toBe('done')
    expect(p.completedOn?.value).toBe('2026-06-01')
    expect(p.fulfilledBy).toEqual([entryId])
  })

  it('cancel() moves open → canceled', () => {
    const p = new TestPlan({ title: 'Skip me' })
    p.cancel()
    expect(p.status).toBe('canceled')
  })

  it('completing or canceling a non-open plan throws ILLEGAL_TRANSITION', () => {
    const done = new TestPlan({ title: 'a' })
    done.complete(day('2026-06-01'))
    const canceled = new TestPlan({ title: 'b' })
    canceled.cancel()

    for (const [plan, op] of [
      [done, () => done.complete(day('2026-06-02'))],
      [done, () => done.cancel()],
      [canceled, () => canceled.complete(day('2026-06-02'))],
      [canceled, () => canceled.cancel()],
    ] as const) {
      try {
        op()
        expect.unreachable(`should have thrown for ${plan.title}`)
      } catch (e) {
        expect((e as DomainError).code).toBe('ILLEGAL_TRANSITION')
      }
    }
  })

  it('fulfilledBy is a readonly view', () => {
    const p = new TestPlan({ title: 'Run' })
    p.complete(day('2026-06-01'), Id.create())
    const view = p.fulfilledBy
    expect(Object.isFrozen(view) || Array.isArray(view)).toBe(true)
    // mutating the returned array must not affect the plan
    ;(view as Id[]).length = 0
    expect(p.fulfilledBy.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/plan.test.ts`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/plan.ts
import type { DayKey } from './day-key'
import { DomainError } from './domain-error'
import { Id } from './id'
import type { PersistedMeta } from './persisted-meta'

export type PlanStatus = 'open' | 'done' | 'canceled'

/**
 * An intention — something supposed to happen. One of two abstract classes
 * in the system (the other is Entry). Stateful: status mutates in place.
 */
export abstract class Plan {
  readonly id: Id
  readonly kind: string
  readonly title: string
  readonly due?: DayKey
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private currentStatus: PlanStatus = 'open'
  private completedOnDay?: DayKey
  private readonly links: Id[] = []

  protected constructor(kind: string, props: { id?: Id; title: string; due?: DayKey }) {
    if (props.title.length === 0) throw new DomainError('INVALID_QUANTITY', 'title must be non-empty')
    this.kind = kind
    this.id = props.id ?? Id.create()
    this.title = props.title
    if (props.due !== undefined) this.due = props.due
  }

  get status(): PlanStatus {
    return this.currentStatus
  }

  get completedOn(): DayKey | undefined {
    return this.completedOnDay
  }

  get fulfilledBy(): readonly Id[] {
    return [...this.links]
  }

  private assertOpen(op: string): void {
    if (this.currentStatus !== 'open') {
      throw new DomainError('ILLEGAL_TRANSITION', `cannot ${op} a ${this.currentStatus} plan`)
    }
  }

  /** Done-on-time and recurring respawn both need `on` — when you actually did it. */
  complete(on: DayKey, entryId?: Id): void {
    this.assertOpen('complete')
    this.currentStatus = 'done'
    this.completedOnDay = on
    if (entryId !== undefined) this.links.push(entryId)
  }

  cancel(): void {
    this.assertOpen('cancel')
    this.currentStatus = 'canceled'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/plan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/plan.ts packages/all-of-oyl/src/core/plan.test.ts
git commit -m "feat(all-of-oyl): abstract Plan with status machine and fulfillment links"
```

---

### Task 14: Journal

The aggregate root for entries. Timezone-explicit bucketing, strict adds / idempotent removes, `span`, and the single aggregation path: `aggregate` (sum flat; avg/last two-stage with insertion-order tie-break), `totalOf`, `totalsByPrefix`. `aggregate` returns `undefined` when no entries carry the metric in range; `totalOf` coalesces to 0.

**Files:**
- Create: `packages/all-of-oyl/src/core/journal.ts`
- Test: `packages/all-of-oyl/src/core/journal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/journal.test.ts
import { describe, expect, it } from 'vitest'
import { DayKey } from './day-key'
import { DayRange } from './day-range'
import { Entry } from './entry'
import { Id } from './id'
import { Journal } from './journal'
import { MetricKey } from './metric-key'
import { DomainError } from './domain-error'

class TestEntry extends Entry {
  private readonly values: ReadonlyMap<MetricKey, number>

  constructor(occurredAt: string, values: Record<string, number>, id?: Id) {
    super('test', { occurredAt: new Date(occurredAt), ...(id ? { id } : {}) })
    this.values = new Map(Object.entries(values).map(([k, v]) => [MetricKey.of(k), v]))
  }

  metrics(): ReadonlyMap<MetricKey, number> {
    return this.values
  }
}

const NY = 'America/New_York'
const day = (s: string) => DayKey.of(s)
const range = (a: string, b: string) => DayRange.of(day(a), day(b))
const key = (s: string) => MetricKey.of(s)

describe('Journal', () => {
  it('requires a valid timezone', () => {
    try {
      new Journal('Nowhere/Nope')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_TIMEZONE')
    }
  })

  it('buckets entries into days using its timezone', () => {
    const j = new Journal(NY)
    // 01:30Z on June 2 is the evening of June 1 in New York
    j.add(new TestEntry('2026-06-02T01:30:00Z', { 'nutrition.calories': 500 }))
    expect(j.entriesOn(day('2026-06-01'))).toHaveLength(1)
    expect(j.entriesOn(day('2026-06-02'))).toHaveLength(0)
  })

  it('strict adds: DUPLICATE_ID on re-add; idempotent removes', () => {
    const j = new Journal(NY)
    const id = Id.create()
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}, id))
    try {
      j.add(new TestEntry('2026-06-01T13:00:00Z', {}, id))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('DUPLICATE_ID')
    }
    j.remove(id)
    j.remove(id) // no-op, no throw
    expect(j.entriesOn(day('2026-06-01'))).toHaveLength(0)
  })

  it('entriesIn returns entries inside an inclusive range', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-03T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-05T12:00:00Z', {}))
    expect(j.entriesIn(range('2026-06-01', '2026-06-03'))).toHaveLength(2)
  })

  it('span covers first to last entry day; undefined when empty', () => {
    const j = new Journal(NY)
    expect(j.span()).toBeUndefined()
    j.add(new TestEntry('2026-06-03T12:00:00Z', {}))
    j.add(new TestEntry('2026-06-01T12:00:00Z', {}))
    expect(j.span()?.start.value).toBe('2026-06-01')
    expect(j.span()?.end.value).toBe('2026-06-03')
  })

  it('sum is flat; totalOf coalesces empty to 0', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', { 'nutrition.calories': 500 }))
    j.add(new TestEntry('2026-06-01T18:00:00Z', { 'nutrition.calories': 700 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'nutrition.calories': 400 }))
    expect(j.totalOf(key('nutrition.calories'), range('2026-06-01', '2026-06-02'))).toBe(1600)
    expect(j.totalOf(key('nutrition.protein'), range('2026-06-01', '2026-06-02'))).toBe(0)
    expect(j.aggregate(key('nutrition.protein'), range('2026-06-01', '2026-06-02'), 'sum')).toBeUndefined()
  })

  it('avg is two-stage: within-day mean, then mean across days-with-data', () => {
    const j = new Journal(NY)
    // Day 1: two moods, 4 and 6 (day value 5). Day 2: one mood, 9. Day 3: nothing.
    j.add(new TestEntry('2026-06-01T09:00:00Z', { 'mood.score': 4 }))
    j.add(new TestEntry('2026-06-01T20:00:00Z', { 'mood.score': 6 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'mood.score': 9 }))
    expect(j.aggregate(key('mood.score'), range('2026-06-01', '2026-06-03'), 'avg')).toBe(7) // (5+9)/2
  })

  it('last takes the most recent value; same-instant ties break by insertion order', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    j.add(new TestEntry('2026-06-02T08:00:00Z', { 'body.weight_kg': 79 }))
    expect(j.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-02'), 'last')).toBe(79)

    const tied = new Journal(NY)
    tied.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    tied.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 81 }))
    expect(tied.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-01'), 'last')).toBe(81)
  })

  it('totalsByPrefix enumerates sums under a prefix', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T12:00:00Z', { 'finance.spend.groceries': 42.1, 'finance.spend.dining': 18 }))
    j.add(new TestEntry('2026-06-02T12:00:00Z', { 'finance.spend.groceries': 10, 'finance.income.salary': 1000 }))
    const totals = j.totalsByPrefix('finance.spend', range('2026-06-01', '2026-06-02'))
    expect(totals.get(key('finance.spend.groceries'))).toBeCloseTo(52.1)
    expect(totals.get(key('finance.spend.dining'))).toBe(18)
    expect(totals.has(key('finance.income.salary'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/journal.test.ts`
Expected: FAIL — cannot resolve `./journal`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/journal.ts
import { DayKey, assertTimezone } from './day-key'
import { DayRange } from './day-range'
import { DomainError } from './domain-error'
import type { Entry } from './entry'
import type { Id } from './id'
import { MetricKey } from './metric-key'

export type AggregateKind = 'sum' | 'avg' | 'last'

/**
 * One person's record of what happened. Constructed with an explicit IANA
 * timezone — the one place the timezone decision lives. A plain in-memory
 * aggregate: apps hydrate it from their repositories.
 */
export class Journal {
  private readonly tz: string
  /** Insertion order is the documented tie-break for 'last'. */
  private readonly entries: Entry[] = []
  private readonly byId = new Set<Id>()

  constructor(tz: string) {
    this.tz = assertTimezone(tz)
  }

  add(entry: Entry): void {
    if (this.byId.has(entry.id)) {
      throw new DomainError('DUPLICATE_ID', `entry already in journal: ${entry.id}`)
    }
    this.byId.add(entry.id)
    this.entries.push(entry)
  }

  /** Idempotent — removing a missing id is a no-op. */
  remove(id: Id): void {
    if (!this.byId.delete(id)) return
    const index = this.entries.findIndex((e) => e.id === id)
    this.entries.splice(index, 1)
  }

  dayOf(entry: Entry): DayKey {
    return DayKey.from(entry.occurredAt, this.tz)
  }

  entriesOn(day: DayKey): readonly Entry[] {
    return this.entries.filter((e) => this.dayOf(e).equals(day))
  }

  entriesIn(range: DayRange): readonly Entry[] {
    return this.entries.filter((e) => range.contains(this.dayOf(e)))
  }

  span(): DayRange | undefined {
    if (this.entries.length === 0) return undefined
    let min = this.dayOf(this.entries[0] as Entry)
    let max = min
    for (const e of this.entries) {
      const d = this.dayOf(e)
      if (d.compare(min) < 0) min = d
      if (d.compare(max) > 0) max = d
    }
    return DayRange.of(min, max)
  }

  /**
   * The single aggregation path. Returns undefined when no entry in range
   * carries the metric. 'sum' is flat; 'avg' and 'last' are two-stage
   * (within-day first) per the spec's counters-vs-gauges rule.
   */
  aggregate(metric: MetricKey, range: DayRange, kind: AggregateKind): number | undefined {
    const perDay = new Map<string, number[]>()
    for (const entry of this.entriesIn(range)) {
      const value = entry.metrics().get(metric)
      if (value === undefined) continue
      const dayValue = this.dayOf(entry).value
      const bucket = perDay.get(dayValue)
      if (bucket) bucket.push(value)
      else perDay.set(dayValue, [value])
    }
    if (perDay.size === 0) return undefined

    if (kind === 'sum') {
      let total = 0
      for (const values of perDay.values()) for (const v of values) total += v
      return total
    }
    if (kind === 'avg') {
      let dayTotal = 0
      for (const values of perDay.values()) {
        dayTotal += values.reduce((a, b) => a + b, 0) / values.length
      }
      return dayTotal / perDay.size
    }
    // 'last': latest day, then last-pushed value that day (insertion order tie-break,
    // and entries within a day keep journal insertion order).
    const lastDay = [...perDay.keys()].sort().at(-1) as string
    const values = perDay.get(lastDay) as number[]
    return values[values.length - 1]
  }

  totalOf(metric: MetricKey, range: DayRange): number {
    return this.aggregate(metric, range, 'sum') ?? 0
  }

  totalsByPrefix(prefix: string, range: DayRange): ReadonlyMap<MetricKey, number> {
    const totals = new Map<MetricKey, number>()
    for (const entry of this.entriesIn(range)) {
      for (const [key, value] of entry.metrics()) {
        if (key !== prefix && !key.startsWith(`${prefix}.`)) continue
        totals.set(key, (totals.get(key) ?? 0) + value)
      }
    }
    return totals
  }
}
```

Note: `'last'` groups per day but must respect *time* order within the latest day, not just insertion order across different times. The test with `08:00` vs. a later same-day entry passes because entries are pushed in time order; the tie test shares one instant. If during implementation you find a counterexample (same-day entries added out of time order), sort the latest day's entries by `occurredAt` with insertion order as tie-break before taking the last value — that is the spec rule.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/journal.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the out-of-order 'last' test and fix if needed**

Append to the `describe` block in `journal.test.ts`:

```ts
  it('last respects time order even when entries are added out of order', () => {
    const j = new Journal(NY)
    j.add(new TestEntry('2026-06-01T20:00:00Z', { 'body.weight_kg': 82 }))
    j.add(new TestEntry('2026-06-01T08:00:00Z', { 'body.weight_kg': 80 }))
    expect(j.aggregate(key('body.weight_kg'), range('2026-06-01', '2026-06-01'), 'last')).toBe(82)
  })
```

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/journal.test.ts`

If it fails, replace the `'last'` branch in `aggregate` with a time-ordered scan:

```ts
    // 'last': latest occurredAt in range carrying the metric; insertion order breaks ties.
    let best: { at: number; index: number; value: number } | undefined
    this.entries.forEach((entry, index) => {
      if (!range.contains(this.dayOf(entry))) return
      const value = entry.metrics().get(metric)
      if (value === undefined) return
      const at = entry.occurredAt.getTime()
      if (!best || at > best.at || (at === best.at && index > best.index)) {
        best = { at, index, value }
      }
    })
    return best?.value
```

(Keep the `perDay` map for `sum`/`avg`; the early `undefined` return can then come from `best === undefined` for `'last'`.)

Run again. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/core/journal.ts packages/all-of-oyl/src/core/journal.test.ts
git commit -m "feat(all-of-oyl): Journal root with two-stage aggregation"
```

---

### Task 15: Catalog

Generic keyed collection for definitions: strict `add`, `get`, `all`, `bySlug` for slugged types.

**Files:**
- Create: `packages/all-of-oyl/src/core/catalog.ts`
- Test: `packages/all-of-oyl/src/core/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/catalog.test.ts
import { describe, expect, it } from 'vitest'
import { Catalog } from './catalog'
import { Id } from './id'
import { LifeArea } from './life-area'
import { DomainError } from './domain-error'

describe('Catalog', () => {
  it('adds and gets by id', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    expect(catalog.get(health.id)).toBe(health)
    expect(catalog.get(Id.create())).toBeUndefined()
  })

  it('strict adds: DUPLICATE_ID', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    try {
      catalog.add(health)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('DUPLICATE_ID')
    }
  })

  it('lists all in insertion order', () => {
    const catalog = new Catalog<LifeArea>()
    const a = new LifeArea({ name: 'A', slug: 'a' })
    const b = new LifeArea({ name: 'B', slug: 'b' })
    catalog.add(a)
    catalog.add(b)
    expect(catalog.all()).toEqual([a, b])
  })

  it('finds by slug for slugged items', () => {
    const catalog = new Catalog<LifeArea>()
    const health = new LifeArea({ name: 'Health', slug: 'health' })
    catalog.add(health)
    expect(catalog.bySlug('health')).toBe(health)
    expect(catalog.bySlug('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/catalog.test.ts`
Expected: FAIL — cannot resolve `./catalog`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/core/catalog.ts
import { DomainError } from './domain-error'
import type { Id } from './id'

/**
 * A small keyed collection of definitions, held by the app — the synchronous,
 * hydrated in-memory view of a Repository (what Journal is to entries).
 */
export class Catalog<T extends { id: Id; slug?: string }> {
  private readonly items = new Map<Id, T>()

  add(item: T): void {
    if (this.items.has(item.id)) {
      throw new DomainError('DUPLICATE_ID', `item already in catalog: ${item.id}`)
    }
    this.items.set(item.id, item)
  }

  get(id: Id): T | undefined {
    return this.items.get(id)
  }

  all(): readonly T[] {
    return [...this.items.values()]
  }

  bySlug(slug: string): T | undefined {
    for (const item of this.items.values()) {
      if (item.slug === slug) return item
    }
    return undefined
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/core/catalog.ts packages/all-of-oyl/src/core/catalog.test.ts
git commit -m "feat(all-of-oyl): generic Catalog for definitions"
```

---

### Task 16: Repository interface + InMemoryRepository

The persistence port and its executable specification: meta stamping (storage clock, injectable for tests), revision conflicts, soft delete by default, purge, corner semantics (create-on-foreign-meta, idempotent delete/purge).

**Files:**
- Create: `packages/all-of-oyl/src/core/repository.ts`
- Create: `packages/all-of-oyl/src/core/in-memory-repository.ts`
- Test: `packages/all-of-oyl/src/core/in-memory-repository.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/core/in-memory-repository.test.ts
import { describe, expect, it } from 'vitest'
import { InMemoryRepository } from './in-memory-repository'
import { LifeArea } from './life-area'
import { Id } from './id'
import { DomainError } from './domain-error'

function makeRepo() {
  let tick = 0
  const clock = () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++))
  return new InMemoryRepository<LifeArea>(clock)
}

describe('InMemoryRepository', () => {
  it('stamps fresh meta on first save and returns the item', async () => {
    const repo = makeRepo()
    const area = new LifeArea({ name: 'Health', slug: 'health' })
    expect(area.meta).toBeUndefined()
    const saved = await repo.save(area)
    expect(saved.meta?.revision).toBe(1)
    expect(saved.meta?.createdAt).toBeInstanceOf(Date)
    expect(saved.meta?.deletedAt).toBeUndefined()
  })

  it('bumps revision and updatedAt on subsequent saves', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const again = await repo.save(area)
    expect(again.meta?.revision).toBe(2)
    expect(again.meta!.updatedAt.getTime()).toBeGreaterThan(again.meta!.createdAt.getTime())
  })

  it('rejects stale revisions with REVISION_CONFLICT', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const stale = LifeArea.fromJSON(area.toJSON()) // snapshot at revision 1
    await repo.save(area) // now revision 2
    await expect(repo.save(stale)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })

  it('rejects a fresh (meta-less) save colliding with an existing record', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    const ghost = new LifeArea({ id: area.id, name: 'Health 2', slug: 'health' })
    await expect(repo.save(ghost)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
  })

  it('save with foreign meta for an unknown id is a create with fresh meta', async () => {
    const repo = makeRepo()
    const imported = LifeArea.fromJSON({
      id: '00000000-0000-4000-8000-000000000010',
      name: 'Health',
      slug: 'health',
      meta: { createdAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z', revision: 99 },
    })
    const saved = await repo.save(imported)
    expect(saved.meta?.revision).toBe(1)
    expect(saved.meta!.createdAt.getUTCFullYear()).toBe(2026)
  })

  it('soft delete: get returns undefined, list excludes unless asked; idempotent', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    await repo.delete(area.id)
    await repo.delete(area.id) // no-op
    expect(await repo.get(area.id)).toBeUndefined()
    expect(await repo.list()).toHaveLength(0)
    const includingDeleted = await repo.list({ includeDeleted: true })
    expect(includingDeleted).toHaveLength(1)
    expect(includingDeleted[0]?.meta?.deletedAt).toBeInstanceOf(Date)
  })

  it('purge removes entirely; idempotent; save after purge recreates', async () => {
    const repo = makeRepo()
    const area = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    await repo.purge(area.id)
    await repo.purge(area.id) // no-op
    expect(await repo.list({ includeDeleted: true })).toHaveLength(0)
    const recreated = await repo.save(area)
    expect(recreated.meta?.revision).toBe(1)
  })

  it('get of unknown id is undefined', async () => {
    const repo = makeRepo()
    expect(await repo.get(Id.create())).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/in-memory-repository.test.ts`
Expected: FAIL — cannot resolve `./in-memory-repository`.

- [ ] **Step 3: Write the interface**

```ts
// packages/all-of-oyl/src/core/repository.ts
import type { Id } from './id'
import type { PersistedMeta } from './persisted-meta'

/**
 * The persistence port. Apps supply adapters (SQL, CMS, IndexedDB, …);
 * the domain never imports one. Adapters are constructed already scoped
 * to one user — ownership lives in the adapter, not the model.
 */
export interface Repository<T extends { id: Id; meta?: PersistedMeta }> {
  /** undefined for missing AND soft-deleted records. */
  get(id: Id): Promise<T | undefined>
  list(opts?: { includeDeleted?: boolean }): Promise<T[]>
  /** Stamps/refreshes meta (storage clock); returns the item. Stale revision → REVISION_CONFLICT. */
  save(item: T): Promise<T>
  /** Soft delete (sets deletedAt). Idempotent. */
  delete(id: Id): Promise<void>
  /** Hard delete — the right-to-erasure path. Idempotent. */
  purge(id: Id): Promise<void>
}
```

- [ ] **Step 4: Write the reference implementation**

```ts
// packages/all-of-oyl/src/core/in-memory-repository.ts
import { DomainError } from './domain-error'
import type { Id } from './id'
import type { PersistedMeta } from './persisted-meta'
import type { Repository } from './repository'

/**
 * Reference implementation and executable specification of Repository
 * semantics: meta stamping, revision conflicts, soft delete, idempotent
 * removal, create-on-foreign-meta. Adapter authors copy these behaviors.
 */
export class InMemoryRepository<T extends { id: Id; meta?: PersistedMeta }> implements Repository<T> {
  private readonly records = new Map<Id, T>()
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  async get(id: Id): Promise<T | undefined> {
    const stored = this.records.get(id)
    if (!stored || stored.meta?.deletedAt) return undefined
    return stored
  }

  async list(opts?: { includeDeleted?: boolean }): Promise<T[]> {
    const all = [...this.records.values()]
    return opts?.includeDeleted ? all : all.filter((r) => !r.meta?.deletedAt)
  }

  async save(item: T): Promise<T> {
    const stored = this.records.get(item.id)
    const now = this.clock()
    if (!stored) {
      // Create — even if the item carries foreign meta (purge-then-restore, imports).
      item.meta = { createdAt: now, updatedAt: now, revision: 1 }
    } else {
      if (item.meta?.revision !== stored.meta?.revision) {
        throw new DomainError(
          'REVISION_CONFLICT',
          `stale save of ${item.id}: have revision ${item.meta?.revision ?? 'none'}, stored ${stored.meta?.revision}`,
        )
      }
      item.meta = {
        createdAt: stored.meta?.createdAt ?? now,
        updatedAt: now,
        revision: (stored.meta?.revision ?? 0) + 1,
      }
    }
    this.records.set(item.id, item)
    return item
  }

  async delete(id: Id): Promise<void> {
    const stored = this.records.get(id)
    if (!stored || !stored.meta || stored.meta.deletedAt) return
    stored.meta = { ...stored.meta, updatedAt: this.clock(), revision: stored.meta.revision + 1, deletedAt: this.clock() }
  }

  async purge(id: Id): Promise<void> {
    this.records.delete(id)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/core/in-memory-repository.test.ts`
Expected: PASS. (The stale-revision test works because `LifeArea.fromJSON` snapshots meta at revision 1 while the live object advances to 2.)

- [ ] **Step 6: Commit**

```bash
git add packages/all-of-oyl/src/core/repository.ts packages/all-of-oyl/src/core/in-memory-repository.ts packages/all-of-oyl/src/core/in-memory-repository.test.ts
git commit -m "feat(all-of-oyl): Repository port + InMemoryRepository reference impl"
```

---

### Task 17: User

The profile, not credentials: `id`, `displayName`, `timezone`, `defaultCurrency`, optional `units`. Lives in `user/` (imports core only). Tolerant-reader serialization, same pattern as `LifeArea`.

**Files:**
- Create: `packages/all-of-oyl/src/user/user.ts`
- Test: `packages/all-of-oyl/src/user/user.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/user/user.test.ts
import { describe, expect, it } from 'vitest'
import { User } from './user'
import { Id } from '../core/id'
import { DomainError } from '../core/domain-error'

describe('User', () => {
  it('constructs the profile shape', () => {
    const user = new User({
      displayName: 'Avery',
      timezone: 'America/New_York',
      defaultCurrency: 'USD',
      units: 'metric',
    })
    expect(user.displayName).toBe('Avery')
    expect(user.timezone).toBe('America/New_York')
    expect(user.defaultCurrency).toBe('USD')
    expect(user.units).toBe('metric')
    expect(Id.of(user.id)).toBe(user.id)
  })

  it('validates timezone and currency', () => {
    try {
      new User({ displayName: 'X', timezone: 'Bad/Zone', defaultCurrency: 'USD' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_TIMEZONE')
    }
    try {
      new User({ displayName: 'X', timezone: 'America/New_York', defaultCurrency: 'dollars' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('INVALID_QUANTITY')
    }
  })

  it('round-trips JSON and preserves unknown fields', () => {
    const shape = {
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Avery',
      timezone: 'America/New_York',
      defaultCurrency: 'USD',
      futureField: 42,
    }
    const user = User.fromJSON(shape)
    expect(user.units).toBeUndefined()
    const out = user.toJSON() as Record<string, unknown>
    expect(out['futureField']).toBe(42)
    expect(out['displayName']).toBe('Avery')
  })

  it('throws MALFORMED_JSON on bad shapes', () => {
    try {
      User.fromJSON({ id: '00000000-0000-4000-8000-000000000001', displayName: 'Avery' })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect((e as DomainError).code).toBe('MALFORMED_JSON')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/user/user.test.ts`
Expected: FAIL — cannot resolve `./user`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/all-of-oyl/src/user/user.ts
import { assertTimezone } from '../core/day-key'
import { DomainError } from '../core/domain-error'
import { Id } from '../core/id'
import { type PersistedMeta, metaFromJSON, metaToJSON } from '../core/persisted-meta'

export type Units = 'metric' | 'imperial'

/**
 * The person's profile, not their credentials. Authentication identity is
 * the backend's record, linked by id. `timezone` is the value every root
 * is hydrated with.
 */
export class User {
  readonly id: Id
  readonly displayName: string
  readonly timezone: string
  readonly defaultCurrency: string
  readonly units?: Units
  /** Repo-owned storage bookkeeping; outside the immutability rule. */
  meta?: PersistedMeta
  private readonly extra: Record<string, unknown>

  constructor(
    props: { id?: Id; displayName: string; timezone: string; defaultCurrency: string; units?: Units },
    extra: Record<string, unknown> = {},
  ) {
    if (props.displayName.length === 0) {
      throw new DomainError('INVALID_QUANTITY', 'displayName must be non-empty')
    }
    if (!/^[A-Z]{3}$/.test(props.defaultCurrency)) {
      throw new DomainError('INVALID_QUANTITY', `not an ISO currency code: "${props.defaultCurrency}"`)
    }
    this.id = props.id ?? Id.create()
    this.displayName = props.displayName
    this.timezone = assertTimezone(props.timezone)
    this.defaultCurrency = props.defaultCurrency
    if (props.units !== undefined) this.units = props.units
    this.extra = extra
  }

  toJSON(): Record<string, unknown> {
    return {
      ...this.extra,
      id: this.id,
      displayName: this.displayName,
      timezone: this.timezone,
      defaultCurrency: this.defaultCurrency,
      ...(this.units !== undefined ? { units: this.units } : {}),
      ...(this.meta ? { meta: metaToJSON(this.meta) } : {}),
    }
  }

  static fromJSON(shape: unknown): User {
    if (typeof shape !== 'object' || shape === null) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    const { id, displayName, timezone, defaultCurrency, units, meta, ...extra } = shape as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      typeof displayName !== 'string' ||
      typeof timezone !== 'string' ||
      typeof defaultCurrency !== 'string' ||
      (units !== undefined && units !== 'metric' && units !== 'imperial')
    ) {
      throw new DomainError('MALFORMED_JSON', 'not a User shape')
    }
    let parsedId: Id
    try {
      parsedId = Id.of(id)
    } catch {
      throw new DomainError('MALFORMED_JSON', `User has malformed id: "${id}"`)
    }
    const user = new User(
      { id: parsedId, displayName, timezone, defaultCurrency, ...(units !== undefined ? { units: units as Units } : {}) },
      extra,
    )
    if (meta !== undefined) user.meta = metaFromJSON(meta)
    return user
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/user/user.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/user/user.ts packages/all-of-oyl/src/user/user.test.ts
git commit -m "feat(all-of-oyl): User profile in user module"
```

---

### Task 18: Fixtures — conventions, builders, seed slice

Phase 1 establishes the conventions: `FIXTURE_TODAY`/`FIXTURE_TZ`, the stable-id scheme, the builder pattern, and `seed.ts` exporting `toJSON` shapes. Later phases extend with their domains.

**Files:**
- Create: `packages/all-of-oyl/src/fixtures/fixture-id.ts`
- Create: `packages/all-of-oyl/src/fixtures/constants.ts`
- Create: `packages/all-of-oyl/src/fixtures/builders.ts`
- Create: `packages/all-of-oyl/src/fixtures/seed.ts`
- Test: `packages/all-of-oyl/src/fixtures/fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/all-of-oyl/src/fixtures/fixtures.test.ts
import { describe, expect, it } from 'vitest'
import { fixtureId } from './fixture-id'
import { FIXTURE_TODAY, FIXTURE_TZ } from './constants'
import { makeLifeArea, makeUser } from './builders'
import { seed } from './seed'
import { LifeArea } from '../core/life-area'
import { User } from '../user/user'
import { Id } from '../core/id'

describe('fixtures', () => {
  it('fixtureId yields valid, stable, distinct ids', () => {
    expect(fixtureId(1)).toBe(Id.of('00000000-0000-4000-8000-000000000001'))
    expect(fixtureId(42)).toBe(fixtureId(42))
    expect(fixtureId(1)).not.toBe(fixtureId(2))
  })

  it('anchors at FIXTURE_TODAY in a DST-rich timezone', () => {
    expect(FIXTURE_TODAY.value).toBe('2026-06-01')
    expect(FIXTURE_TZ).toBe('America/New_York')
  })

  it('builders produce valid objects with overridable fields', () => {
    const user = makeUser()
    expect(user.timezone).toBe(FIXTURE_TZ)
    expect(makeUser({ displayName: 'Blake' }).displayName).toBe('Blake')
    const area = makeLifeArea()
    expect(area.slug).toBe('health')
    expect(makeLifeArea({ slug: 'money', name: 'Money' }).slug).toBe('money')
  })

  it('seed shapes revive through the domain (standing round-trip test)', () => {
    expect(seed.users).toHaveLength(2)
    expect(seed.lifeAreas).toHaveLength(4)
    const users = seed.users.map((shape) => User.fromJSON(shape))
    expect(users.map((u) => u.displayName)).toEqual(['Avery', 'Blake'])
    const areas = seed.lifeAreas.map((shape) => LifeArea.fromJSON(shape))
    expect(new Set(areas.map((a) => a.slug)).size).toBe(4)
    // re-serializing equals the seed (no drift)
    expect(users.map((u) => u.toJSON())).toEqual(seed.users)
    expect(areas.map((a) => a.toJSON())).toEqual(seed.lifeAreas)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: FAIL — cannot resolve `./fixture-id`.

- [ ] **Step 3: Write the fixture modules**

```ts
// packages/all-of-oyl/src/fixtures/fixture-id.ts
import { Id } from '../core/id'

/**
 * Stable, hand-assigned fixture ids: 00000000-0000-4000-8000-<n, 12 digits>.
 * Reserve blocks per domain as fixtures grow:
 *   1-9 users · 10-29 life areas · 30-99 catalogs · 100-999 entries
 *   1000-1999 plans · 2000-2999 vault · 3000+ sharing
 */
export function fixtureId(n: number): Id {
  return Id.of(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
}
```

```ts
// packages/all-of-oyl/src/fixtures/constants.ts
import { DayKey } from '../core/day-key'

/** All fixture dates are relative to this anchor — never the wall clock. */
export const FIXTURE_TODAY = DayKey.of('2026-06-01')

/** DST-rich on purpose; fixture data straddles the 2026-03-08 transition. */
export const FIXTURE_TZ = 'America/New_York'
```

```ts
// packages/all-of-oyl/src/fixtures/builders.ts
import { LifeArea } from '../core/life-area'
import { User, type Units } from '../user/user'
import type { Id } from '../core/id'
import { FIXTURE_TZ } from './constants'
import { fixtureId } from './fixture-id'

type UserProps = { id?: Id; displayName?: string; timezone?: string; defaultCurrency?: string; units?: Units }

export function makeUser(overrides: UserProps = {}): User {
  return new User({
    id: overrides.id ?? fixtureId(1),
    displayName: overrides.displayName ?? 'Avery',
    timezone: overrides.timezone ?? FIXTURE_TZ,
    defaultCurrency: overrides.defaultCurrency ?? 'USD',
    ...(overrides.units !== undefined ? { units: overrides.units } : {}),
  })
}

type LifeAreaProps = { id?: Id; name?: string; slug?: string }

export function makeLifeArea(overrides: LifeAreaProps = {}): LifeArea {
  return new LifeArea({
    id: overrides.id ?? fixtureId(10),
    name: overrides.name ?? 'Health',
    slug: overrides.slug ?? 'health',
  })
}
```

```ts
// packages/all-of-oyl/src/fixtures/seed.ts
import { makeLifeArea, makeUser } from './builders'
import { fixtureId } from './fixture-id'

/**
 * The canonical dataset as wire shapes (toJSON). Sourceable: apps seed any
 * backend by walking these through repository adapters or an API; tests
 * revive them through fromJSON — a standing round-trip test.
 * Personas: Avery (rich account), Blake (sparse). Phase 1 ships users +
 * Avery's life areas; later phases extend.
 */
const avery = makeUser({ id: fixtureId(1), displayName: 'Avery', units: 'metric' })
const blake = makeUser({ id: fixtureId(2), displayName: 'Blake', timezone: 'America/Chicago' })

const areas = [
  makeLifeArea({ id: fixtureId(10), name: 'Health', slug: 'health' }),
  makeLifeArea({ id: fixtureId(11), name: 'Family', slug: 'family' }),
  makeLifeArea({ id: fixtureId(12), name: 'Career', slug: 'career' }),
  makeLifeArea({ id: fixtureId(13), name: 'Money', slug: 'money' }),
]

export const seed = {
  users: [avery.toJSON(), blake.toJSON()],
  lifeAreas: areas.map((a) => a.toJSON()),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @oyl/all-of-oyl test -- src/fixtures/fixtures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/fixtures
git commit -m "feat(all-of-oyl): fixture conventions, builders, and seed slice"
```

---

### Task 19: Barrel, full suite, typecheck

Public surface via `index.ts` (the only barrel). Then the whole-package gates.

**Files:**
- Create: `packages/all-of-oyl/src/index.ts`

- [ ] **Step 1: Write the barrel**

```ts
// packages/all-of-oyl/src/index.ts
// The only barrel — and (in later phases) the only file allowed to know
// every module, which is why the kind→fromJSON revivers will live here.

export { DomainError, type DomainErrorCode } from './core/domain-error'
export { assertSlug, isSlug } from './core/slug'
export { Id } from './core/id'
export { KNOWN_NAMESPACES, MEASUREMENT_NAMESPACES, MetricKey } from './core/metric-key'
export { DayKey, assertTimezone } from './core/day-key'
export { DayRange } from './core/day-range'
export { Cadence, type CadenceUnit } from './core/cadence'
export { Quantity } from './core/quantity'
export { Money } from './core/money'
export { type PersistedMeta, type PersistedMetaShape, metaFromJSON, metaToJSON } from './core/persisted-meta'
export { LifeArea } from './core/life-area'
export { Entry } from './core/entry'
export { Plan, type PlanStatus } from './core/plan'
export { Journal, type AggregateKind } from './core/journal'
export { Catalog } from './core/catalog'
export { type Repository } from './core/repository'
export { InMemoryRepository } from './core/in-memory-repository'
export { User, type Units } from './user/user'
export { fixtureId } from './fixtures/fixture-id'
export { FIXTURE_TODAY, FIXTURE_TZ } from './fixtures/constants'
export { makeLifeArea, makeUser } from './fixtures/builders'
export { seed } from './fixtures/seed'
```

- [ ] **Step 2: Run the full test suite**

Run: `pnpm --filter @oyl/all-of-oyl test`
Expected: all suites pass (legacy `modules/` tests plus every `src/` test from Tasks 2–18).

- [ ] **Step 3: Typecheck src strictly**

Run: `pnpm --filter @oyl/all-of-oyl typecheck:src`
Expected: exit 0, no errors. Fix any strictness fallout (`noUncheckedIndexedAccess` typically flags indexing — prefer narrowing over `as` where reasonable).

- [ ] **Step 4: Verify the package typecheck still passes (legacy untouched)**

Run: `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit`
Expected: exit 0 — the package-wide config still covers `modules/` as before.

- [ ] **Step 5: Commit**

```bash
git add packages/all-of-oyl/src/index.ts
git commit -m "feat(all-of-oyl): phase 1 core spine barrel"
```

---

## Phase 1 exit criteria

- [ ] `pnpm --filter @oyl/all-of-oyl test` green (src + legacy modules).
- [ ] `pnpm --filter @oyl/all-of-oyl typecheck:src` green under `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- [ ] No production dependencies added (`package.json` `dependencies` unchanged or shrunk).
- [ ] Spec error registry updated with `INVALID_DAY` / `INVALID_TIMEZONE` (Task 2).
- [ ] Every spec behavior in phase 1 scope has a test: timezone bucketing, DST day, strict adds / idempotent removes, two-stage gauge aggregation + tie-break, `aggregate` `undefined` vs `totalOf` 0, anchor-preserving cadence (incl. Feb 29), repository semantics (stamping, conflict, soft delete, purge, create-on-foreign-meta), tolerant-reader round-trips, fixture seed revival.

## Explicitly NOT in phase 1 (resist the urge)

Entry subclasses (`ActivitySession`, `Consumption`, `Transaction`, `Measurement`, `Note`), `Goal`/`Budget`, `Planner`/`Task`/`DayPlan`, `Vault` registries, `Connection`/`Grant`, insights functions, `reviveEntry`/`revivePlan` (they need subclasses to dispatch to). Each is a later phase per the spec's build order.
