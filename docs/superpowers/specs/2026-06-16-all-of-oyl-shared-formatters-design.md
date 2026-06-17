# Shared formatters: `@oyl/all-of-oyl/format`

**Date:** 2026-06-16
**Status:** Approved — ready for planning
**Packages:** `@oyl/all-of-oyl` (new module), `apps/vanilla-oyl` (consumer)

> Sub-project #1 of a 3-part program (formatters → account balance/spend → Nutrition
> screen). This one is first because the Nutrition screen will consume it.

## Goal

Consolidate the value-object display formatters that currently live (and partly
duplicate) in `apps/vanilla-oyl/src/{journal,planner,vault,insights}/format.js`
into a shared, DOM-free `@oyl/all-of-oyl/format` subpath, so any app or the
backend formats `Money`/`DayKey`/`Cadence`/`Appointment` consistently — and so
the **two divergent money formatters collapse into one**.

## Problem

- `Money` (`core/money.ts`) has arithmetic but **no formatter**, so the app
  fills the gap — twice, inconsistently: `vault/format.js` `formatMoney(Money)`
  handles currency symbols + negatives, while `insights/format.js` `money(n)`
  hardcodes `` `$${n.toFixed(2)}` ``.
- `DayKey`/`Cadence`/`Appointment` formatting is re-derived per screen
  (duplicate `MONTHS`/`WEEKDAYS` tables across three files).
- A second consumer (the backend, future apps, the Nutrition screen) would
  re-implement all of it.

## Decisions (locked)

1. **Free functions at a `@oyl/all-of-oyl/format` subpath** (not methods on the
   value objects, not the main barrel). Keeps value objects lean, matches the
   `insights/` free-function style, quarantines English/locale copy from the
   pure domain barrel.
2. **Boundary = "value formatting" vs "sentence templates."** Generic
   value/quantity phrasing moves to core; screen-voiced sentence templates with
   a domain-noun prefix stay app-side, composed from the moved primitives.

## Design

### New module (`packages/all-of-oyl/src/format/`)

DOM-free, `Intl`-only. (Precedent: `core/day-key.ts` already uses
`Intl.DateTimeFormat` and builds under `lib:["ES2022"]` with no DOM lib — so
these pass `pnpm all-of build`.) Value objects are referenced **type-only**
(`import type { Money } from '../core/money.js'`), which `tsc` erases — so the
emitted `dist/format/*.js` have **zero runtime imports** and the no-bare-import
guard stays trivially green.

- `format/money.ts`
  - `formatMoney(m: Money): string` — `"$649.00"` for USD/EUR/GBP (symbol map),
    else `"<amount> <CUR>"`; negatives `"-$200.00"`.
  - `monthlyTotalLabel(totals: ReadonlyMap<string, Money>): string` —
    `"$13.99/mo"`, `"£5.00 + $13.99/mo"` (sorted by currency), `""` when empty.
- `format/day.ts` (one shared `MONTHS`/`WEEKDAYS` table)
  - `formatDayHeading(day: DayKey): string` — `"Wednesday, Jun 10"`.
  - `relativeDayLabel(day: DayKey, today: DayKey): string` —
    `"Today"`/`"Yesterday"`/`"Tomorrow"`/`""`.
  - `monthDayLabel(day: DayKey): string` — `"Jun 20"`.
  - `formatClockTime(date: Date): string` — locale `HH:MM` via `Intl`.
  - `dueInLabel(due: DayKey, today: DayKey): string` —
    `"today"`/`"tomorrow"`/`"yesterday"`/`"in 5 days"`/`"in 3 weeks"`/
    `"in 3 months"`/`"5 days ago"`.
  - `spanLabel(n: number): string` — positive-day-count magnitude
    (`"5 days"`/`"3 weeks"`/`"2 months"`); this is the ex-private `relativeSpan`,
    now exported so the app's `stalenessLabel`/`overdueBadge` reuse it.
- `format/plan.ts`
  - `cadenceLabel(c: Cadence): string` — `"every week"`/`"every 2 weeks"`.
  - `appointmentTime(appt: Appointment): string` — `"10:00 · 30m"` (uses
    `formatClockTime`).
- `format/index.ts` — barrel re-exporting `money`, `day`, `plan`.

### Plumbing

- `packages/all-of-oyl/package.json` `exports`: add
  `"./format": "./src/format/index.ts"`. (`moduleResolution:"bundler"`/`nodenext`
  honor the exports map — proven by the existing `/testing` subpath consumed in
  `apps/strapi-oyl/test/conformance.test.ts`. No tsconfig `paths` needed.)
- The build (`tsc -p tsconfig.build.json`) emits `dist/format/*.js`
  automatically; `apps/vanilla-oyl/scripts/copy-lib.mjs` vendors the whole
  `dist/` → `vendor/all-of-oyl/format/` automatically.
- `apps/vanilla-oyl/index.html`: add a second importmap entry
  `"@oyl/all-of-oyl/format": "/vendor/all-of-oyl/format/index.js"` and a
  `<link rel="modulepreload" href="/vendor/all-of-oyl/format/index.js">`.
- `packages/all-of-oyl/scripts/check-no-bare-imports.mjs`: update the comment
  (the importmap now has **two** entries: root + `/format`). The guard logic is
  unchanged and still passes.
- **The main barrel (`src/index.ts`) does NOT re-export the format functions** —
  the subpath isolation is intentional; do not re-add them to the barrel.

### The money dedup (the bug fix)

`insights/format.js` `money(n)` takes a **major-unit `number`**, not a `Money`
(insights spending is `number`: `ReviewTotals.spending`, `topSpending[].total`,
deltas — all from `journal.totalsByPrefix('finance.spend')`, which is
currency-less). So the four call sites in `oyl-insights.js` route through the
canonical formatter via a single app helper:

```js
// apps/vanilla-oyl/src/insights/format.js
import { formatMoney } from '@oyl/all-of-oyl/format'
import { Money } from '@oyl/all-of-oyl'
/** Format a major-unit number as USD (insights is single-currency). */
export const usd = (n) => formatMoney(Money.fromMajor(n, 'USD'))
```

Verified output parity: `money(42.5)`→`"$42.50"` == `usd(42.5)`; same for `0`,
`1234`. `money()` is deleted; **exactly one money formatter (`formatMoney`)
remains**, and insights' single-currency-USD assumption (already implicit in the
hardcoded `$`) is now explicit at the presentation boundary.

### App end-state (what each `format.js` keeps)

- `journal/format.js` → keeps `measurementUnit` only.
- `planner/format.js` → keeps `overdueBadge` (rebuilt to compose core
  `monthDayLabel`; retains its compact `"3d ago"` voice). Drops `cadenceLabel`,
  `appointmentTime`.
- `vault/format.js` → keeps `stalenessLabel` (composes core `spanLabel`). Drops
  `formatMoney`, `monthlyTotalLabel`, `dueInLabel`, `monthDayLabel`,
  `relativeSpan`.
- `insights/format.js` → keeps `reviewGoalLabel`, `areaStatsLabel`; adds `usd`;
  drops `money`.
- All other call sites (components under `apps/vanilla-oyl/src/components/`)
  import the moved formatters from `@oyl/all-of-oyl/format`. The plan enumerates
  every call site via `grep`.

## Testing

- **Core (Vitest, TS, colocated):** `src/format/money.test.ts`, `day.test.ts`,
  `plan.test.ts` — port the existing app cases
  (`journal/format.test.js`, `planner/format.test.js`, `vault/format.test.js`)
  for the moved functions into framework-free core tests.
  - `formatClockTime` is ICU/locale-dependent: assert with the loose regex
    `/\d{1,2}:\d{2}/` (as the existing app test does) — never an exact string.
- **App:** trim each `format.test.js` to what stays (`measurementUnit`,
  `overdueBadge`, `stalenessLabel`, `reviewGoalLabel`/`areaStatsLabel`); replace
  the `insights` `money()` tests with `usd()` tests.

## Out of scope

- `measurementUnit` (metric→unit display table) stays app-side — borderline
  domain, but tiny; revisit if a second app needs it.
- i18n/localization of the moved copy (English month/weekday names, `$`
  default). Centralizing here is the *prerequisite* for it, not the work.
- Account balance/spend (sub-project #2) and the Nutrition screen (#3).

## Definition of Done

- `pnpm all-of test`, `pnpm all-of typecheck:src`, and `pnpm all-of build`
  (DOM-safety + no-bare-import guard) green.
- `pnpm vanilla test` and `pnpm vanilla typecheck` green.
- `grep -rn "function money\|\$\${" apps/vanilla-oyl/src` shows no second money
  formatter; one `formatMoney` in core.
