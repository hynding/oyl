# Shared Formatters (`@oyl/all-of-oyl/format`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the value-object display formatters out of the vanilla-oyl app into a shared, DOM-free `@oyl/all-of-oyl/format` subpath, collapsing the two divergent money formatters into one.

**Architecture:** Task 1 creates the core `src/format/` module (free functions over `Money`/`DayKey`/`Cadence`/`Appointment`, referenced type-only) + colocated Vitest tests + the `exports` entry. Task 2 is the atomic app cutover: importmap/vendoring, rewrite the 4 app `format.js` files to their end-state, repoint the 9 component call sites at the subpath, and trim the app tests.

**Tech Stack:** TypeScript (NodeNext, no-DOM build), Vitest; vanilla JS + JSDoc app, importmap + vendored ESM.

Spec: `docs/superpowers/specs/2026-06-16-all-of-oyl-shared-formatters-design.md`

## Global Constraints

- Core `src/format/` is DOM-free, `Intl`-only; value objects are imported **type-only** (`import type`) so `dist/format/*.js` have zero/relative imports and `pnpm all-of build` (no-DOM + no-bare-import guard) stays green.
- Free functions at the `@oyl/all-of-oyl/format` subpath. **The main barrel `src/index.ts` does NOT re-export them.**
- Exactly one money formatter: `formatMoney` in core; insights formats its major-unit numbers via a single `usd` app helper.
- `formatClockTime` is ICU/locale-dependent — tests assert the loose regex `/\d{1,2}:\d{2}/`, never an exact string.
- Stays app-side (not moved): `measurementUnit`, `overdueBadge`, `stalenessLabel`, `reviewGoalLabel`, `areaStatsLabel`.
- Git: end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch already isolated by the executor.

---

### Task 1: Core `format/` module + tests + exports

**Files:**
- Create: `packages/all-of-oyl/src/format/money.ts`
- Create: `packages/all-of-oyl/src/format/day.ts`
- Create: `packages/all-of-oyl/src/format/plan.ts`
- Create: `packages/all-of-oyl/src/format/index.ts`
- Create: `packages/all-of-oyl/src/format/money.test.ts`
- Create: `packages/all-of-oyl/src/format/day.test.ts`
- Create: `packages/all-of-oyl/src/format/plan.test.ts`
- Modify: `packages/all-of-oyl/package.json` (`exports` map)
- Modify: `packages/all-of-oyl/scripts/check-no-bare-imports.mjs` (comment only)

**Interfaces:**
- Consumes: `Money` (`../core/money.js`), `DayKey` (`../core/day-key.js`), `Cadence` (`../core/cadence.js`), `Appointment` (`../plan/appointment.js`) — type-only.
- Produces (importable from `@oyl/all-of-oyl/format`):
  - `formatMoney(m: Money): string`, `monthlyTotalLabel(totals: ReadonlyMap<string, Money>): string`
  - `relativeDayLabel(day: DayKey, today: DayKey): string`, `formatDayHeading(day: DayKey): string`, `monthDayLabel(day: DayKey): string`, `formatClockTime(date: Date): string`, `spanLabel(n: number): string`, `dueInLabel(due: DayKey, today: DayKey): string`
  - `cadenceLabel(c: Cadence): string`, `appointmentTime(appt: Appointment): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/all-of-oyl/src/format/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Money } from '../core/money.js'
import { formatMoney, monthlyTotalLabel } from './money.js'

describe('formatMoney', () => {
  it('uses a symbol for known currencies', () => {
    expect(formatMoney(Money.of(64900, 'USD', 2))).toBe('$649.00')
    expect(formatMoney(Money.of(1000, 'EUR', 2))).toBe('€10.00')
    expect(formatMoney(Money.of(500, 'GBP', 2))).toBe('£5.00')
  })
  it('falls back to a trailing code for unknown currencies and respects exponent', () => {
    expect(formatMoney(Money.of(1000, 'JPY', 0))).toBe('1000 JPY')
  })
  it('renders negatives with the sign before the symbol', () => {
    expect(formatMoney(Money.of(-20000, 'USD', 2))).toBe('-$200.00')
    expect(formatMoney(Money.of(-1000, 'JPY', 0))).toBe('-1000 JPY')
  })
})

describe('monthlyTotalLabel', () => {
  it('returns empty string for no entries', () => {
    expect(monthlyTotalLabel(new Map())).toBe('')
  })
  it('formats a single currency', () => {
    expect(monthlyTotalLabel(new Map([['USD', Money.of(1399, 'USD', 2)]]))).toBe('$13.99/mo')
  })
  it('sorts multiple currencies by code regardless of insertion order', () => {
    const totals = new Map([['USD', Money.of(1399, 'USD', 2)], ['GBP', Money.of(500, 'GBP', 2)]])
    expect(monthlyTotalLabel(totals)).toBe('£5.00 + $13.99/mo')
  })
})
```

Create `packages/all-of-oyl/src/format/day.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DayKey } from '../core/day-key.js'
import { relativeDayLabel, formatDayHeading, monthDayLabel, formatClockTime, spanLabel, dueInLabel } from './day.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

describe('relativeDayLabel', () => {
  it('today/yesterday/tomorrow else empty', () => {
    const today = DayKey.of('2026-06-10')
    expect(relativeDayLabel(today, today)).toBe('Today')
    expect(relativeDayLabel(today.addDays(-1), today)).toBe('Yesterday')
    expect(relativeDayLabel(today.addDays(1), today)).toBe('Tomorrow')
    expect(relativeDayLabel(today.addDays(-3), today)).toBe('')
  })
})

describe('formatDayHeading', () => {
  it('"Weekday, Mon D"', () => {
    const day = DayKey.of('2026-06-10')
    expect(formatDayHeading(day)).toBe(`${WEEKDAYS[day.weekday() - 1]}, Jun 10`)
  })
})

describe('monthDayLabel', () => {
  it('formats month and day, ignoring the year', () => {
    expect(monthDayLabel(DayKey.of('1990-06-20'))).toBe('Jun 20')
  })
})

describe('formatClockTime', () => {
  it('HH:MM-ish from a Date (locale-dependent → loose match)', () => {
    expect(formatClockTime(new Date('2026-06-10T08:05:00'))).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('spanLabel', () => {
  it('days under two weeks, weeks under ~two months, months beyond', () => {
    expect(spanLabel(1)).toBe('1 day')
    expect(spanLabel(13)).toBe('13 days')
    expect(spanLabel(14)).toBe('2 weeks')
    expect(spanLabel(59)).toBe('8 weeks')
    expect(spanLabel(60)).toBe('2 months')
  })
})

describe('dueInLabel', () => {
  const today = DayKey.of('2026-06-13')
  it('phrases near and far future days', () => {
    expect(dueInLabel(today, today)).toBe('today')
    expect(dueInLabel(today.addDays(1), today)).toBe('tomorrow')
    expect(dueInLabel(today.addDays(5), today)).toBe('in 5 days')
    expect(dueInLabel(today.addDays(21), today)).toBe('in 3 weeks')
    expect(dueInLabel(today.addDays(90), today)).toBe('in 3 months')
  })
  it('phrases past days', () => {
    expect(dueInLabel(today.addDays(-1), today)).toBe('yesterday')
    expect(dueInLabel(today.addDays(-5), today)).toBe('5 days ago')
  })
})
```

Create `packages/all-of-oyl/src/format/plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Cadence } from '../core/cadence.js'
import { Appointment } from '../plan/appointment.js'
import { cadenceLabel, appointmentTime } from './plan.js'

describe('cadenceLabel', () => {
  it('singular for n=1, plural otherwise', () => {
    expect(cadenceLabel(Cadence.of(1, 'weeks'))).toBe('every week')
    expect(cadenceLabel(Cadence.of(1, 'days'))).toBe('every day')
    expect(cadenceLabel(Cadence.of(2, 'weeks'))).toBe('every 2 weeks')
    expect(cadenceLabel(Cadence.of(3, 'months'))).toBe('every 3 months')
  })
})

describe('appointmentTime', () => {
  it('clock time, with duration suffix when set', () => {
    const a = new Appointment({ title: 'Dentist', startsAt: new Date('2026-06-16T15:00:00'), durationMinutes: 60, tz: 'America/New_York' })
    expect(appointmentTime(a)).toMatch(/\d{1,2}:\d{2}.*·.*60m/)
    const b = new Appointment({ title: 'Quick', startsAt: new Date('2026-06-16T09:00:00'), tz: 'America/New_York' })
    expect(appointmentTime(b)).toMatch(/^\d{1,2}:\d{2}/)
    expect(appointmentTime(b)).not.toContain('·')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/format/`
Expected: FAIL — `Cannot find module './money.js'` / `'./day.js'` / `'./plan.js'` (sources not created yet).

- [ ] **Step 3: Create the source modules**

Create `packages/all-of-oyl/src/format/money.ts`:

```ts
import type { Money } from '../core/money.js'

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }

/** "$649.00" for USD/EUR/GBP, else "<amount> <CUR>"; negatives as "-$200.00". */
export function formatMoney(m: Money): string {
  const neg = m.minor < 0
  const amount = (Math.abs(m.minor) / 10 ** m.exponent).toFixed(m.exponent)
  const sym = SYMBOLS[m.currency]
  const body = sym ? `${sym}${amount}` : `${amount} ${m.currency}`
  return neg ? `-${body}` : body
}

/**
 * "$13.99/mo" for one currency, "£5.00 + $13.99/mo" for several, "" when empty.
 * Sorted by currency code so output is deterministic.
 */
export function monthlyTotalLabel(totals: ReadonlyMap<string, Money>): string {
  const parts = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, m]) => formatMoney(m))
  return parts.length === 0 ? '' : `${parts.join(' + ')}/mo`
}
```

Create `packages/all-of-oyl/src/format/day.ts`:

```ts
import type { DayKey } from '../core/day-key.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today"/"Yesterday"/"Tomorrow" relative to `today`, else "". */
export function relativeDayLabel(day: DayKey, today: DayKey): string {
  if (day.equals(today)) return 'Today'
  if (day.equals(today.addDays(-1))) return 'Yesterday'
  if (day.equals(today.addDays(1))) return 'Tomorrow'
  return ''
}

/** "Wednesday, Jun 10" from a DayKey. */
export function formatDayHeading(day: DayKey): string {
  return `${WEEKDAYS[day.weekday() - 1] ?? ''}, ${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}

/** "Jun 20" — month/day only (birthdays ignore the year). */
export function monthDayLabel(day: DayKey): string {
  return `${MONTHS[day.month - 1] ?? ''} ${day.dayOfMonth}`
}

/** Locale clock time (HH:MM) for an instant. */
export function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

/** Positive-day-count magnitude: "5 days" / "3 weeks" / "2 months". */
export function spanLabel(n: number): string {
  if (n < 14) return `${n} day${n === 1 ? '' : 's'}`
  if (n < 60) return `${Math.round(n / 7)} weeks`
  return `${Math.round(n / 30)} months`
}

/**
 * "today"/"tomorrow"/"yesterday"/"in 5 days"/"in 3 weeks"/"in 3 months", and
 * past → "yesterday"/"5 days ago".
 */
export function dueInLabel(due: DayKey, today: DayKey): string {
  const days = Math.round((Date.parse(due.value) - Date.parse(today.value)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  const phrase = spanLabel(Math.abs(days))
  return days > 0 ? `in ${phrase}` : `${phrase} ago`
}
```

Create `packages/all-of-oyl/src/format/plan.ts`:

```ts
import type { Cadence } from '../core/cadence.js'
import type { Appointment } from '../plan/appointment.js'
import { formatClockTime } from './day.js'

/** "every week" / "every 2 weeks". */
export function cadenceLabel(c: Cadence): string {
  return c.n === 1 ? `every ${c.unit.slice(0, -1)}` : `every ${c.n} ${c.unit}`
}

/** Clock time, plus "· Nm" when a duration is set. */
export function appointmentTime(appt: Appointment): string {
  const base = formatClockTime(appt.startsAt)
  return appt.durationMinutes !== undefined ? `${base} · ${appt.durationMinutes}m` : base
}
```

Create `packages/all-of-oyl/src/format/index.ts`:

```ts
export { formatMoney, monthlyTotalLabel } from './money.js'
export { relativeDayLabel, formatDayHeading, monthDayLabel, formatClockTime, spanLabel, dueInLabel } from './day.js'
export { cadenceLabel, appointmentTime } from './plan.js'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/all-of-oyl exec vitest run src/format/`
Expected: PASS (all suites).

- [ ] **Step 5: Add the `exports` entry and fix the guard comment**

In `packages/all-of-oyl/package.json`, add the `./format` key to `exports` (between `.` and `./testing`):

```json
  "exports": {
    ".": "./src/index.ts",
    "./format": "./src/format/index.ts",
    "./testing": "./src/core/http-repository-contract.ts",
    "./package.json": "./package.json"
  },
```

In `packages/all-of-oyl/scripts/check-no-bare-imports.mjs`, update the header comment (logic unchanged): change "The app's importmap has exactly one entry" to "The app's importmap has two entries (root + /format)".

- [ ] **Step 6: Run the full core gate**

Run: `pnpm --filter @oyl/all-of-oyl test && pnpm --filter @oyl/all-of-oyl typecheck:src && pnpm all-of build`
Expected: all tests PASS; strict `src/` typecheck clean; `pnpm all-of build` prints `dist/ is bare-import free.` (proves the format module added no bare imports and is DOM-safe).

- [ ] **Step 7: Commit**

```bash
git add packages/all-of-oyl/src/format packages/all-of-oyl/package.json packages/all-of-oyl/scripts/check-no-bare-imports.mjs
git commit -m "feat(all-of-oyl): add shared @oyl/all-of-oyl/format module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: App cutover to the shared formatters

This is one atomic cutover (partial migration won't typecheck). `pnpm vanilla test`/`typecheck` resolve `@oyl/all-of-oyl/format` via the package `exports` map to TS source, so they validate without a prior build; the importmap + `build:lib` make the browser runtime resolve the vendored copy.

**Files:**
- Modify: `apps/vanilla-oyl/index.html` (importmap + modulepreload)
- Rewrite: `apps/vanilla-oyl/src/insights/format.js`, `journal/format.js`, `planner/format.js`, `vault/format.js`
- Modify (import lines): `apps/vanilla-oyl/src/components/oyl-subscription-row.js:4-5`, `oyl-plan-row.js:5`, `oyl-entry-row.js:5`, `oyl-contact-row.js:4`, `oyl-insights.js`, `oyl-planner.js:6`, `oyl-vault.js:6`, `oyl-finance.js:5`, `oyl-journal.js:6`
- Rewrite tests: `apps/vanilla-oyl/src/insights/format.test.js`, `journal/format.test.js`, `planner/format.test.js`, `vault/format.test.js`

**Interfaces:**
- Consumes: everything from `@oyl/all-of-oyl/format` (Task 1) + `Money` from `@oyl/all-of-oyl`.
- Produces: app-local survivors — `insights/format.js` `usd`/`reviewGoalLabel`/`areaStatsLabel`; `journal/format.js` `measurementUnit`; `planner/format.js` `overdueBadge`; `vault/format.js` `stalenessLabel`.

- [ ] **Step 1: Add the importmap entry + modulepreload**

In `apps/vanilla-oyl/index.html`, change the importmap and add a preload:

```html
    <script type="importmap">
      {
        "imports": {
          "@oyl/all-of-oyl": "/vendor/all-of-oyl/index.js",
          "@oyl/all-of-oyl/format": "/vendor/all-of-oyl/format/index.js"
        }
      }
    </script>
    <link rel="modulepreload" href="/vendor/all-of-oyl/index.js" />
    <link rel="modulepreload" href="/vendor/all-of-oyl/format/index.js" />
    <link rel="modulepreload" href="/src/main.js" />
```

- [ ] **Step 2: Vendor the new module**

Run: `pnpm vanilla build:lib`
Expected: builds all-of-oyl and prints `Copied all-of-oyl/dist → vendor/all-of-oyl`. Confirm `apps/vanilla-oyl/vendor/all-of-oyl/format/index.js` now exists.

- [ ] **Step 3: Rewrite the four app `format.js` files to their end-state**

Replace the entire contents of `apps/vanilla-oyl/src/insights/format.js`:

```js
import { formatMoney } from '@oyl/all-of-oyl/format'
import { Money } from '@oyl/all-of-oyl'

/** @typedef {import('@oyl/all-of-oyl').GoalProgress} GoalProgress */
/** @typedef {import('@oyl/all-of-oyl').AreaRollup} AreaRollup */

/** Format a major-unit number as USD (insights spending is single-currency). @param {number} n @returns {string} */
export const usd = (n) => formatMoney(Money.fromMajor(n, 'USD'))

/** A goal's review label from its progress alone (GoalReview lacks direction/unit). @param {GoalProgress} p @returns {string} */
export function reviewGoalLabel(p) {
  if (p.paused) return 'Paused'
  if (p.empty) return 'No data'
  if (p.met === true) return 'Met'
  return `${Math.round(p.ratio * 100)}%`
}

/** "2/3 goals · 120 min · 1 project" from the present parts; "Nothing tracked" when all empty. @param {AreaRollup} a @returns {string} */
export function areaStatsLabel(a) {
  const parts = []
  if (a.goalsTotal > 0) parts.push(`${a.goalsMet}/${a.goalsTotal} goals`)
  if (a.activityMinutes > 0) parts.push(`${Math.round(a.activityMinutes)} min`)
  if (a.projectsTouched > 0) parts.push(`${a.projectsTouched} project${a.projectsTouched === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Nothing tracked'
}
```

Replace the entire contents of `apps/vanilla-oyl/src/journal/format.js`:

```js
/** Display unit for known measurement metric keys ("" when unknown). @param {string} metric @returns {string} */
export function measurementUnit(metric) {
  const units = /** @type {Record<string, string>} */ ({
    'body.weight_kg': 'kg',
    'sleep.hours': 'h',
    'screen.minutes': 'min',
  })
  return units[metric] ?? ''
}
```

Replace the entire contents of `apps/vanilla-oyl/src/planner/format.js`:

```js
import { monthDayLabel } from '@oyl/all-of-oyl/format'

/** @typedef {import('@oyl/all-of-oyl').DayKey} DayKey */

/** "Due Jun 13 · 3d ago" for an overdue plan. @param {DayKey} due @param {DayKey} today @returns {string} */
export function overdueBadge(due, today) {
  const days = Math.round((Date.parse(today.value) - Date.parse(due.value)) / 86400000)
  return `Due ${monthDayLabel(due)} · ${days}d ago`
}
```

Replace the entire contents of `apps/vanilla-oyl/src/vault/format.js`:

```js
import { spanLabel } from '@oyl/all-of-oyl/format'

/** "Last contacted 3 months ago" / "Last contacted today" / "Never contacted". @param {number | undefined} days @returns {string} */
export function stalenessLabel(days) {
  if (days === undefined) return 'Never contacted'
  if (days <= 0) return 'Last contacted today'
  if (days === 1) return 'Last contacted yesterday'
  return `Last contacted ${spanLabel(days)} ago`
}
```

- [ ] **Step 4: Repoint the component import lines**

Update each import so the *moved* names come from `@oyl/all-of-oyl/format` and the *survivors* stay app-local. Exact edits:

- `oyl-subscription-row.js` lines 4-5 → replace with:
  ```js
  import { formatMoney, dueInLabel, cadenceLabel } from '@oyl/all-of-oyl/format'
  ```
- `oyl-plan-row.js` line 5 → replace with:
  ```js
  import { cadenceLabel, appointmentTime } from '@oyl/all-of-oyl/format'
  import { overdueBadge } from '../planner/format.js'
  ```
- `oyl-entry-row.js` line 5 → replace with:
  ```js
  import { formatClockTime } from '@oyl/all-of-oyl/format'
  import { measurementUnit } from '../journal/format.js'
  ```
- `oyl-contact-row.js` line 4 → replace with:
  ```js
  import { monthDayLabel } from '@oyl/all-of-oyl/format'
  import { stalenessLabel } from '../vault/format.js'
  ```
- `oyl-vault.js` line 6 → replace with:
  ```js
  import { dueInLabel, formatMoney, monthlyTotalLabel } from '@oyl/all-of-oyl/format'
  ```
- `oyl-finance.js` line 5 → replace with:
  ```js
  import { formatMoney } from '@oyl/all-of-oyl/format'
  ```
- `oyl-planner.js` line 6 → replace with:
  ```js
  import { relativeDayLabel, formatDayHeading } from '@oyl/all-of-oyl/format'
  ```
- `oyl-journal.js` line 6 → replace with:
  ```js
  import { relativeDayLabel, formatDayHeading } from '@oyl/all-of-oyl/format'
  ```
- `oyl-insights.js` line 6 (currently `import { money, reviewGoalLabel, areaStatsLabel } from '../insights/format.js'`) → replace with:
  ```js
  import { usd, reviewGoalLabel, areaStatsLabel } from '../insights/format.js'
  ```
  Then replace the three `money(` call sites with `usd(`: line 97 `usd(r.totals.spending)`, line 113 `usd(s.total)`, line 197 `usd(Math.abs(delta))`.

Note: `oyl-contact-row.js` line 56 uses `monthDayLabel(o.anchor)` — now from the subpath; no call-site text change, only the import. Same pattern for the other components (only import lines change; call sites are unchanged except `money`→`usd` in `oyl-insights.js`).

- [ ] **Step 5: Trim/rewrite the four app test files**

Replace the entire contents of `apps/vanilla-oyl/src/insights/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { usd, reviewGoalLabel, areaStatsLabel } from './format.js'

describe('usd', () => {
  it('formats a major-unit number as USD via the shared formatter', () => {
    expect(usd(42.5)).toBe('$42.50')
    expect(usd(0)).toBe('$0.00')
    expect(usd(1234)).toBe('$1234.00')
  })
})

describe('reviewGoalLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').GoalProgress>} [o] @returns {any} */
  const p = (o = {}) => ({ current: 0, target: 10, ratio: 0, paused: false, empty: false, ...o })
  it('prioritizes paused, then empty, then met, else percent', () => {
    expect(reviewGoalLabel(p({ paused: true }))).toBe('Paused')
    expect(reviewGoalLabel(p({ empty: true }))).toBe('No data')
    expect(reviewGoalLabel(p({ met: true }))).toBe('Met')
    expect(reviewGoalLabel(p({ ratio: 0.8 }))).toBe('80%')
  })
})

describe('areaStatsLabel', () => {
  /** @param {Partial<import('@oyl/all-of-oyl').AreaRollup>} [o] @returns {any} */
  const a = (o = {}) => ({ name: 'Health', goalsMet: 0, goalsTotal: 0, activityMinutes: 0, projectsTouched: 0, ...o })
  it('composes present parts and pluralizes', () => {
    expect(areaStatsLabel(a({ goalsMet: 2, goalsTotal: 3, activityMinutes: 120, projectsTouched: 1 }))).toBe('2/3 goals · 120 min · 1 project')
    expect(areaStatsLabel(a({ projectsTouched: 2 }))).toBe('2 projects')
    expect(areaStatsLabel(a())).toBe('Nothing tracked')
  })
})
```

Replace the entire contents of `apps/vanilla-oyl/src/journal/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { measurementUnit } from './format.js'

describe('measurementUnit', () => {
  it('known keys map to a unit, unknown to empty', () => {
    expect(measurementUnit('body.weight_kg')).toBe('kg')
    expect(measurementUnit('sleep.hours')).toBe('h')
    expect(measurementUnit('screen.minutes')).toBe('min')
    expect(measurementUnit('mood.score')).toBe('')
    expect(measurementUnit('custom.whatever')).toBe('')
  })
})
```

Replace the entire contents of `apps/vanilla-oyl/src/planner/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { DayKey } from '@oyl/all-of-oyl'
import { overdueBadge } from './format.js'

describe('overdueBadge', () => {
  it('"Due Mon D · Nd ago"', () => {
    expect(overdueBadge(DayKey.of('2026-06-13'), DayKey.of('2026-06-16'))).toBe('Due Jun 13 · 3d ago')
    expect(overdueBadge(DayKey.of('2026-06-15'), DayKey.of('2026-06-16'))).toBe('Due Jun 15 · 1d ago')
  })
})
```

Replace the entire contents of `apps/vanilla-oyl/src/vault/format.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { stalenessLabel } from './format.js'

describe('stalenessLabel', () => {
  it('phrases never / today / yesterday / longer gaps', () => {
    expect(stalenessLabel(undefined)).toBe('Never contacted')
    expect(stalenessLabel(0)).toBe('Last contacted today')
    expect(stalenessLabel(1)).toBe('Last contacted yesterday')
    expect(stalenessLabel(95)).toBe('Last contacted 3 months ago')
  })
})
```

- [ ] **Step 6: Run the full app gate**

Run: `pnpm vanilla test && pnpm vanilla typecheck`
Expected: all tests PASS (the moved-formatter cases now live in core; the app suite covers the survivors + components); typecheck clean (proves every component import of `@oyl/all-of-oyl/format` resolves via the exports map).

- [ ] **Step 7: Verify the dedup and commit**

Run: `grep -rn "export function money\b" apps/vanilla-oyl/src` → expect no output. Then:

```bash
git add apps/vanilla-oyl/index.html apps/vanilla-oyl/src/insights apps/vanilla-oyl/src/journal apps/vanilla-oyl/src/planner apps/vanilla-oyl/src/vault apps/vanilla-oyl/src/components
git commit -m "refactor(vanilla-oyl): consume @oyl/all-of-oyl/format; one money formatter

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(Do NOT stage `apps/vanilla-oyl/vendor/` — it is gitignored.)

---

## Definition of Done (whole feature)

- `pnpm all-of test`, `pnpm all-of typecheck:src`, `pnpm all-of build` green.
- `pnpm vanilla test`, `pnpm vanilla typecheck` green.
- One money formatter: `grep -rn "export function money\b" apps/vanilla-oyl/src` empty; `formatMoney` defined once in `packages/all-of-oyl/src/format/money.ts`.
- The main barrel `src/index.ts` does not re-export any format function.
