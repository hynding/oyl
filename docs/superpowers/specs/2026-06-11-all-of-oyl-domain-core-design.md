# all-of-oyl Domain Core — Design

**Date:** 2026-06-11
**Scope:** `packages/all-of-oyl/src/` only. Greenfield. Nothing outside this directory is a constraint or a dependency. Existing `modules/` code is untouched and ignored.

## Purpose

A DRY, minimalistic set of TypeScript classes that can drive a complete "Organize Your Life" application: what you **did** (activities, meals, spending, sleep, mood, vitals), what you **intend** (tasks, projects, appointments, meal plans), what you **have** (documents, possessions, subscriptions, contacts), and what it all **means** (goals, budgets, streaks, reviews, correlations). Pure domain layer — no HTTP, no Strapi, no storage technology. Built test-first with Vitest.

## Architecture: three roots and a read side

Everything hangs off three aggregate roots plus one read-side module, all sharing the same core value objects:

| Root | Question it answers | Contents |
|---|---|---|
| **`Journal`** | What happened? | Timestamped `Entry` records that emit metrics |
| **`Planner`** | What's supposed to happen? | `Plan` items (tasks, appointments, planned meals) with due dates and fulfillment links |
| **`Vault`** | What do I have? | Registry items (documents, possessions, subscriptions, contacts) that surface due dates |
| **`insights/`** | What does it mean? | Pure functions over the Journal: goals feed off it; streaks, reviews, correlations |

The library is **single-user by design**: one `Journal`/`Planner`/`Vault` triple is one person's life. Multi-user apps instantiate per user. No `userId` plumbing anywhere.

### The two unifying contracts

1. **Metrics (Journal side):** every `Entry` implements `metrics(): ReadonlyMap<MetricKey, number>` — what that moment contributed to your life, in numbers. Goals, budgets, streaks, reviews, and correlations all reduce to one operation, `journal.totalOf(metric, range)`, implemented once.
2. **Dues (Planner/Vault side):** plans and many vault items implement `Due { nextDueOn(asOf: DayKey): DayKey | undefined }`. The `asOf` parameter exists because recurring dues (birthdays, subscription renewals) have no single due date — only a *next occurrence relative to a day*; fixed dues (a document's expiry, a task's deadline) simply ignore it. (`nextDueOn`, not `dueOn`, so it never collides with `planner.dueOn(day)`, which returns plans.) Reminders, overdue lists, and "upcoming" feeds all reduce to one operation, collecting and sorting dues — also implemented once.

## Directory layout

```
packages/all-of-oyl/src/
  core/        Id, DayKey, DayRange, Cadence, Quantity, Money, MetricKey,
               DomainError, LifeArea, Catalog<T>, Entry (abstract), Journal,
               Plan (abstract), Due interface, Repository<T>, InMemoryRepository<T>
  activity/    Activity (definition), ActivitySession (entry)
  nutrition/   Food (definition), Consumption (entry)
  finance/     Account (definition), Transaction (entry)
  goal/        Goal, GoalProgress, Budget
  track/       Measurement (entry), Note (entry)
  plan/        Task, Project, Appointment, PlannedMeal, Planner (root)
  vault/       Document, Possession, Subscription, Contact, GiftIdea, Vault (root)
  insights/    streaks, review, correlate
  index.ts     public surface
```

Root placement follows the import rule, not symmetry: `Journal` lives in `core/` because it operates purely on the abstract `Entry`. `Planner` and `Vault` need their concrete item types (`groceryList` reads `PlannedMeal`s; the due feed walks all six registries), so they live in their own modules — `core/` never imports upward. `Budget` lives in `goal/` because it wraps the goal engine; it needs no finance types (a category slug and `Money` suffice), so the no-cross-domain-imports rule holds.

Tests are colocated: `core/money.test.ts` next to `core/money.ts`, etc.

## Core value objects (immutable, constructor-validated, `equals()`)

- **`Id`** — branded string; `Id.create()` generates (crypto.randomUUID), `Id.of(string)` validates.
- **`DayKey`** — a calendar day as `YYYY-MM-DD`. Constructed from a `Date` + explicit IANA timezone, so "today's calories" never bleeds across midnight. Comparable; `addDays(n)`, `weekday()` (for ISO week windows).
- **`DayRange`** — inclusive `start`/`end` pair of `DayKey`s; iterable over its days; `contains(day)`. The one range type every `between`/`upcoming`/`totalOf` signature shares. Construction with `end < start` throws.
- **`Cadence`** — simple recurrence: every N `days | weeks | months | years`. `nextAfter(day): DayKey`. Month/year steps clamp to the last day of shorter months (Jan 31 + 1 month = Feb 28/29). Used by subscriptions, maintenance, occasions. (Deliberately not rrule; if complex recurrence is ever needed, `Cadence` is the seam to extend.)
- **`Quantity`** — `amount` + `unit` string (`30 min`, `2 servings`, `8000 steps`). Arithmetic only between matching units; mismatches throw.
- **`Money`** — integer minor units + ISO currency code + minor-unit exponent (defaults to 2; pass explicitly for outliers like JPY's 0). No float arithmetic. `Money.usd(4210)` is $42.10. Add/subtract require matching currency. `toNumber()` exposes major units for metric emission.
- **`MetricKey`** — dot-namespaced string (`nutrition.calories`, `finance.spend.groceries`): two or more segments joined by `.`, each segment matching `[a-z0-9_]+`. Validated format; the cross-domain contract between entries and everything that reads them.

**One slug grammar everywhere.** Activity slugs, transaction categories, note tags, and `LifeArea` slugs all share the segment rule `[a-z0-9_]+` — because each of them gets embedded into a `MetricKey` segment. One validator in `core/`, reused by every domain.

## Journal: records of what happened

- **`Entry`** (abstract): `id`, `occurredAt` (Date), optional `note`, `metrics()`.
- **`Journal`**: constructed with an explicit IANA timezone — the one place the timezone decision lives. Entries store instants (`occurredAt`); the Journal buckets them into `DayKey`s using its timezone, so `entriesOn(day)`, `entriesIn(range)`, and every period window agree on where days begin. (Entries logged while traveling land on the day of your home journal — an accepted simplification.)
- Query surface: `add(entry)` / `remove(id)`, `entriesOn(day)`, `entriesIn(range)` (collection queries are named for what they return; bare `on()` would read like an event-listener registration), `span(): DayRange | undefined` (first to last entry day — bounds streak walks and review deltas), `aggregate(metric, range, kind: 'sum' | 'avg' | 'last')`, `totalOf(metric, range)` (alias for `aggregate(..., 'sum')`), and `totalsByPrefix(prefix, range): ReadonlyMap<MetricKey, number>` — the enumerating sibling of `totalOf` that powers "top spending categories" and "minutes per activity" without a second aggregation path.

**Counters vs. gauges.** Summing is right for counters (calories, minutes, dollars) but nonsense for gauges — two weigh-ins of 80 kg are not 160 kg. Hence the `kind` parameter: `'last'` (most recent value in range) and `'avg'` serve gauge metrics like `body.weight_kg` and `mood.score`. Goals carry a matching optional `aggregation` (default `'sum'`), so "weigh at most 80 kg" is `{ metric: "body.weight_kg", target: 80, direction: "atMost", period: "day", aggregation: "last" }`.

### Entry subclasses and what they emit

| Class | Module | Emits (examples) |
|---|---|---|
| `ActivitySession` | activity | `activity.<slug>.count: 1`, `activity.<slug>.minutes`, plus any logged quantities (`activity.run.km`). Doubles as time tracking — minutes against an activity *is* "where my hours go". |
| `Consumption` | nutrition | `nutrition.calories/protein/carbs/fat`, `nutrition.water_ml` — Food nutrients × servings |
| `Transaction` | finance | expense: `finance.spend.<category>`; income: `finance.income.<category>` — major currency units |
| `Measurement` | track | One generic class for any numeric observation: `body.weight_kg`, `body.bp_systolic`, `sleep.hours`, `mood.score`, `screen.minutes`, `home.kwh`. Constructed as `new Measurement({ metric, value, occurredAt })`. Conventional keys documented in the module. |
| `Note` | track | Free-text journaling/gratitude: `text`, optional `tags`; emits `note.count: 1` (and `note.<tag>.count` per tag) so streaks like "journal daily" work |

`Measurement` is the deliberate DRY move: sleep, mood, vitals, screen time, and utilities are all *one* class with conventional metric keys — five suggested domains for the cost of zero new abstractions.

### Definitions vs. entries

Each concrete domain splits into a reusable **definition** and dated **entries** that reference it by id:

- **`Activity`** — name, slug, optional default unit, optional `areaId` ("Run", "Meditate").
- **`Food`** — name, nutrients per serving (calories/protein/carbs/fat/water).
- **`Account`** — name, currency. Transactions belong to an account; currency must match.

Definitions live in **`Catalog<T>`** instances (a small keyed collection in `core/`: `add`, `get`, `bySlug`, `all`) held by the app — *not* on the `Journal`. Two reasons: the Journal would otherwise need to know every domain's definition types (an upward import `core/` is forbidden from making), and entries don't need the catalog after construction anyway — they capture a snapshot of the definition's values at log time (e.g., `Consumption` copies nutrients), so later catalog edits never rewrite history.

## Planner: intentions and their fulfillment

- **`Plan`** (abstract): `id`, `title`, optional `due` (DayKey), `status` (`open | done | canceled`), optional `fulfilledBy: Id[]` linking to the Journal entries that satisfied it. `complete(entryId?)` sets status and records the link.
- **`Task`** — the plain to-do; optional `projectId`, optional `cadence` (completing a recurring task spawns the next occurrence via `Cadence.nextAfter`), optional `possessionId` (a bare `Id` — no vault import). Recurring tasks deliberately cover *all* recurring duties — chores, asset upkeep ("replace HVAC filter"), watering plants. There is exactly one recurrence-of-duty mechanism in the system.
- **`Project`** — a named group of tasks, optional `areaId`; `progress(planner)` = done/total of its tasks.
- **`Appointment`** — a plan with a specific `startsAt` (Date) and optional duration; calendar/time-blocking primitive. Its `due` day is derived at construction from `startsAt` + an explicit IANA timezone argument (same no-hidden-clock rule as everywhere else).
- **`PlannedMeal`** — Food + servings + day; fulfilled by a `Consumption`. `planner.groceryList(range): ReadonlyMap<Id, Quantity>` aggregates servings per Food id across the range's planned meals.
- **`Planner`** (root): `add/remove`, `dueOn(day)`, `overdue(day)` (open plans with `due < day`), `upcoming(range)`, `completionRate(range)` (done ÷ (done + open) among plans due in the range; canceled plans are excluded from both sides).

**Planned vs. actual** is the payoff of fulfillment links: the planner knows what was intended, the journal knows what happened, and the link makes adherence computable (meals followed, tasks done on time) without either side knowing the other's internals.

## Vault: registries of what you have

Not time-series — these live beside the Journal, keyed collections with one shared trait: anything with a future date implements `Due`, and `vault.upcoming(range)` collects them all into a single reminder feed (document expiries, subscription renewals, birthdays). Apps merge it with `planner.upcoming(range)` for the complete what's-coming view.

- **`Document`** — name, kind (passport/insurance/warranty/...), optional `expiresOn`.
- **`Possession`** — name, optional location, optional `warrantyUntil`, optional purchase info (Money, date). Upkeep of a possession is *not* a vault concept — it's a recurring `Task` carrying the `possessionId` (see Planner); the system has one recurrence-of-duty mechanism, not two.
- **`Subscription`** — name, `amount: Money`, `cadence: Cadence`, `nextRenewal: DayKey`, category, optional `accountId`. `renew(on: DayKey)` advances `nextRenewal` and returns a `Transaction` (dated `on`, charged to `accountId`) for the caller to add to the Journal — the registry that *generates* finance entries. `vault.monthlySubscriptionTotal(): Money` answers "what do my subscriptions cost per month?" (annual amounts prorated).
- **`Contact`** — name, optional `lastContactedOn`, occasions (name + anchor `DayKey` + `Cadence`, e.g. birthday = anchor date, yearly); an occasion's `nextDueOn(asOf)` is its next occurrence on or after `asOf`, correct across year boundaries. `staleness(day)` supports "you haven't talked to Sam in 3 months" nudges.
- **`GiftIdea`** — text + contact link; surfaces alongside that contact's next occasion.

## Life areas: the top-level taxonomy

People organize their lives by *area* — health, family, career, money, growth — not by data type. **`LifeArea`** (in `core/`) is a minimal definition: `id`, `name`, `slug`. Apps hold the catalog (a user typically has 4–8). `Activity`, `Goal`, and `Project` carry an optional `areaId`. That single tag is enough for the read side to answer *"which areas am I investing in, and which am I neglecting?"* — the life-wheel view. Untagged items roll up into an implicit "unassigned" bucket; areas are an overlay, never a requirement.

## Goals, budgets, and insights (the read side)

### Goal

```ts
new Goal({ metric: "nutrition.calories", target: 2200, direction: "atMost", period: "day" })
new Goal({ metric: "activity.run.minutes", target: 150, direction: "atLeast", period: "week" })
new Goal({ metric: "sleep.hours", target: 7, direction: "atLeast", period: "day" })
```

- `period`: `day | week | month`. `direction`: `atLeast | atMost`. Optional `areaId`. Optional `aggregation: 'sum' | 'avg' | 'last'` (default `'sum'`; see counters vs. gauges above).
- Period windows are deterministic: a `day` is the `DayKey` itself; a `week` is the ISO week (Monday–Sunday) containing it; a `month` is its calendar month. All derived from `DayKey`, so the Journal's timezone decision flows through unchanged.
- `progressOn(journal, day): GoalProgress` — resolves the period window containing `day`, computes `current` via `journal.aggregate(metric, window, aggregation)`, returns `{ current, target, ratio, met, paused }`. `ratio` clamped to [0, 1]: attainment for `atLeast`, consumption-of-allowance for `atMost`.

### Pause semantics (humane tracking)

Streaks motivate until life intervenes — then a broken 90-day streak makes people quit the app. Goals support paused ranges:

- `goal.pause(from: DayKey, to?: DayKey)` — `to` omitted means "until resumed" (vacation mode); `goal.resume(on: DayKey)` closes an open pause. Ranges with `to < from` throw `DomainError`.
- A period window that overlaps any paused range is **paused**: `progressOn` still reports numbers but sets `paused: true`, and `met` is not asserted either way.
- Streak math **bridges** paused periods: they neither break nor extend a streak. A 30-day streak, a two-week pause, and a met day resumes at 31.

### Budget

Sugar over the goal engine: per-category, per-month spending control. `budget.spent(journal, month)`, `budget.remaining(journal, month)` (Money), built on `finance.spend.<category>` totals. No second aggregation implementation.

Metric totals are major-unit numbers, so `Budget` reconstructs `Money` by rounding to minor units. Each emitted value originates from an exact minor-unit amount, so float drift across a realistic month of transactions stays far below half a cent — and the rounding makes it exact again.

### insights/

Pure functions over the Journal (and Planner where noted) — zero new data entry, pure read-side analysis:

- **`streak(journal, goal, asOf): number`** — consecutive periods (ending at `asOf`) where the goal was met. Works for any goal, any domain. Paused periods are bridged, not broken. The in-progress period containing `asOf` is asymmetric by direction: for `atLeast` it counts as soon as it's met (you ran your 150 minutes by Wednesday); for `atMost` it's excluded until complete (you can't have "kept under budget" for a month that isn't over).
- **`review({ journal, planner, goals, activities, areas, period }): Review`** — takes the catalogs it needs explicitly (activities for the area mapping, areas for labels); the weekly/monthly/annual review object: per-goal progress and streaks, top spending categories, activity totals, planner completion rate, period-over-period deltas, and a **per-area rollup** (goals met, activity minutes, and projects touched per `LifeArea` — the life-wheel data). A `Review` is plain data an app can render.
- **`correlate(journal, metricA, metricB, range): number | undefined`** — Pearson correlation over daily totals of two metrics ("does mood track sleep?", "does spending spike when exercise drops?"). Returns NaN-safe r in [-1, 1]; requires a minimum number of overlapping days (else `undefined`).

## Persistence boundary

One interface in `core/`:

```ts
interface Repository<T extends { id: Id }> {
  get(id: Id): Promise<T | undefined>
  list(): Promise<T[]>
  save(item: T): Promise<void>
  delete(id: Id): Promise<void>
}
```

Plus `InMemoryRepository<T>` — the reference implementation, used by tests. Apps supply real adapters; the domain never imports one.

`Journal`, `Planner`, and `Vault` are plain in-memory aggregates, not repository-backed: apps load items from their repositories and hydrate the roots to ask questions of them. This keeps every method synchronous and trivially testable.

## Code design decisions

- **Zero runtime dependencies.** The package keeps no production deps (the existing `rrule` is not used by `src/`). Ids come from `crypto.randomUUID()`; timezone math uses the platform `Intl` APIs. A pure domain layer that needs nothing installed is maximally portable across the Vite/Next/Strapi consumers.
- **Two tiers of value object.** `Id` and `MetricKey` are **branded strings** (`string & { readonly __brand: 'Id' }`) created through validating factory functions — zero allocation, `===` equality, JSON-native. `Money`, `Quantity`, `DayKey`, and `Cadence` are **classes** with `equals()`, since they carry structure and behavior. Don't pay for a class where a brand suffices.
- **Construction style.** One pattern everywhere: constructors take a single named-props object and validate; static factories exist only where they add meaning (`Money.usd(4210)`, `DayKey.from(date, tz)`, `Id.create()`). No builders, no `init()` methods — an object that exists is valid.
- **Immutability split.** Value objects and entries are deeply immutable (`readonly` fields). Aggregate roots (`Journal`, `Planner`, `Vault`) and stateful entities (`Goal` pause state, `Task` status) mutate in place — they're in-memory aggregates, and copy-on-write would buy nothing here. All getters return readonly views (`ReadonlyArray`, `ReadonlyMap`); internal collections never escape.
- **Equality semantics.** Entities compare by `id`; value objects by value. No generic deep-equal utility — each class states its own rule.
- **Explicit time, no hidden clock.** Nothing in the domain calls `Date.now()` or reads the system timezone. Every time-sensitive operation takes its reference point as a parameter (`occurredAt`, `asOf`, `day`, `tz`). This makes every test deterministic without clock mocking and every result reproducible.
- **Serialization built in.** Every persistable class has `toJSON(): PlainShape` and a static `fromJSON(shape)`. `Entry` and `Plan` subclasses carry a `kind` discriminant so a single dispatcher can revive a heterogeneous list. Dates serialize as ISO strings, `DayKey` as `YYYY-MM-DD`, `Money` as `{ minor, currency, exponent }`. Malformed input throws `DomainError('MALFORMED_JSON')`. No version field in the shapes — structural validation suffices until the first breaking change (YAGNI). Round-tripping (`fromJSON(toJSON(x))` equals `x`) is a standing test for every class.
- **Inheritance budget: two.** `Entry` and `Plan` are the only abstract classes; everything else composes. New behavior enters via the `metrics()` and `Due` contracts, not subclass trees.
- **Import discipline.** Domain modules (`activity/`, `nutrition/`, `finance/`, `goal/`, `track/`, `plan/`, `vault/`) import from `core/` only — never from each other. `insights/` may import anything. `index.ts` is the only barrel; files are kebab-case, one class per file, named exports only (no `default`).
- **Strict TypeScript.** `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` on for `src/`. No `any`; `unknown` only at the `fromJSON` boundary, narrowed immediately. ESM modules.
- **Errors are exceptions, results are values.** Invalid operations throw `DomainError` with a `code` from a closed union type (`'INVALID_ID' | 'CURRENCY_MISMATCH' | ...`); queries return `undefined`/empty/zero. No Result/Either types — this is an in-process domain layer, not an IO boundary.

## Naming conventions

Every name in the public surface follows one of these rules; a name that fits no rule is wrong:

- **Entries are occurrence nouns** — the thing that happened, not the record of it: `ActivitySession`, `Consumption`, `Transaction`, `Measurement`, `Note`. (Hence `ActivitySession`, not `ActivityLog`; qualified because a bare `Session` is ambiguous at the barrel.)
- **Definitions are catalog nouns, no filler suffixes** — `Activity`, `Food`, `Account`, `LifeArea`. Never `FoodItem`/`FoodEntity`/`FoodModel`; if a noun needs `Item` to sound like a class, the noun is wrong.
- **Collection queries are named for what they return** — `entriesOn(day)`, `entriesIn(range)`, `plansDueOn`→`dueOn(day)` is acceptable inside `Planner` where context disambiguates, but core-level methods never use bare prepositions (`on()` reads as event-listener registration).
- **Single-value lookups state their relation** — `nextDueOn(asOf)`, `nextAfter(day)`, `span()`. The `next` prefix marks recurrence-aware answers.
- **Mutations are imperative verbs and stay consistent across classes** — `add`/`remove`, `pause`/`resume`, `complete`, `renew`, `markDone` is banned (it's `complete` everywhere a plan-like thing finishes).
- **Branded types pair with a same-named namespace constant** — the type `Id` and the value `Id` (`{ create, of }`) share a name and a file; callers write `Id.create()` without caring that no class exists.
- **Booleans read as predicates** (`met`, `paused`, `contains(day)`); **counts and totals say their unit in the metric key**, not the method name (`totalOf("activity.run.minutes", ...)`, never `totalMinutes()`).
- **Files are kebab-case singular** (`day-key.ts`, `activity-session.ts`); test files mirror exactly (`day-key.test.ts`).

## Error handling

- Invalid construction throws `DomainError` (single error class, `code` field) — invalid id format, negative servings, mismatched currency/unit arithmetic, malformed metric keys, target ≤ 0, completing an already-canceled plan.
- Queries never throw for "not found"; they return `undefined` / empty arrays / zero totals.

## Testing & TDD

- Vitest, strict red-green-refactor. Each class begins life as a failing test.
- No mocking frameworks: the domain is pure; tests construct real objects and use `InMemoryRepository`.
- Behavioral coverage targets: timezone edges for `DayKey`, `Cadence` month-end arithmetic (Jan 31 + 1 month), currency/unit mismatch rejection, snapshot semantics of `Consumption`, period-window resolution for weekly/monthly goals, atMost vs atLeast ratio semantics, recurring-task respawn, subscription `renew()` producing a correct `Transaction`, streak boundary conditions, streak bridging across paused ranges (incl. open-ended pause + resume), pause ranges overlapping period boundaries, gauge aggregation (`last`/`avg` with multiple same-day measurements, empty ranges), occasion recurrence across year boundaries (incl. Feb 29 birthdays), per-area rollup with untagged items, correlation with missing days.

## Build phases

Each phase is independently shippable and gets its own implementation plan. Order matters: every phase depends only on what came before.

1. **Core spine** — value objects (`Id`, `DayKey`, `DayRange`, `Cadence`, `Quantity`, `Money`, `MetricKey`, `DomainError`), `LifeArea`, `Catalog`, `Entry`, `Journal` (incl. aggregation kinds), `Repository`/`InMemoryRepository`.
2. **Recording domains** — activity, nutrition, finance, plus `track/` (`Measurement`, `Note`). After this phase the app can log a whole life.
3. **Goals & budgets** — `Goal` (incl. pause semantics), `GoalProgress`, `Budget`.
4. **Planner** — `Task`, `Project`, `Appointment`, `PlannedMeal`, `Planner` root, fulfillment links, grocery list (`Plan` abstract ships in phase 1 with core).
5. **Vault** — the five registries, the shared `Due` feed, subscription→transaction generation.
6. **Insights** — `streak`, `review`, `correlate`.

## Extending the app's purpose

The purpose *will* grow (sleep coaching, career tracking, household sharing — see the suggestion history). These are the seams that absorb growth without core changes, plus the bookkeeping that keeps growth orderly:

**Metric namespace registry.** Top-level `MetricKey` namespaces are owned, and the ownership list lives in one place (`core/metric-key.ts` doc comment + a `KNOWN_NAMESPACES` constant): `activity`, `nutrition`, `finance`, `body`, `sleep`, `mood`, `screen`, `home`, `note`. App- or user-defined metrics use the reserved `custom.` namespace and are never claimed by a future built-in — so a user tracking `custom.guitar_practice_minutes` today can never collide with tomorrow's release. Claiming a new namespace is a one-line, reviewed change.

**Adding a new life domain** is a checklist, not a design exercise:
1. New module directory importing `core/` only.
2. An `Entry` subclass with a unique `kind` and a claimed metric namespace — goals, streaks, reviews, and correlations work immediately, for free.
3. Optional definition class + `Catalog<T>` if entries reference something reusable.
4. Conventional metric keys documented in the module.
5. Register the `kind` in the `index.ts` reviver; export from the barrel.

**The reviver lives in `index.ts`.** Deserializing a heterogeneous entry list needs a `kind → fromJSON` map that knows every subclass — and the barrel is the *only* file allowed to know all modules. `reviveEntry(json)` / `revivePlan(json)` are assembled there, never in `core/` (which can't import upward) and never in a domain module (which can't import siblings). An unknown `kind` throws `DomainError('UNKNOWN_KIND')` — louder and safer than silently dropping a user's data.

**What growth must never do:** add a second aggregation path, a second recurrence-of-duty mechanism, a third abstract class, or a cross-domain import. If a new feature seems to need one of these, the feature is mis-factored — recheck against the `metrics()`/`Due` contracts first.

## Out of scope

Complex recurrence (rrule — `Cadence` is the extension seam), multi-currency conversion, goal milestones, sync/offline semantics, notification delivery (the domain surfaces dues; apps decide how to notify), and any UI or API concerns. Wiring `src/index.ts` into the package's `exports` map (so apps import it alongside the legacy `modules/*`) is an integration step taken when the first consumer adopts the new core, not part of this design.
