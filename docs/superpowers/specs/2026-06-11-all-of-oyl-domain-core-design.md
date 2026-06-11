# all-of-oyl Domain Core — Design

**Date:** 2026-06-11
**Scope:** `packages/all-of-oyl/src/` only. Greenfield. Nothing outside this directory is a constraint or a dependency. Existing `modules/` code is untouched and ignored.

## Purpose

A DRY, minimalistic set of TypeScript classes that can drive an "Organize Your Life" application: tracking activities, goals, diet/nutrition, and finances. Pure domain layer — no HTTP, no Strapi, no storage technology. Built test-first with Vitest.

## The unifying idea: a Journal of metric-emitting Entries

A workout, a meal, and a coffee purchase are all *timestamped records of something you did*. The core models exactly that, once:

- **`Entry`** (abstract): `id`, `occurredAt` (Date), optional `note`, and one required contract: `metrics(): ReadonlyMap<MetricKey, number>` — what this moment contributed to your life, in numbers.
- **`Journal`**: the aggregate root for one person's life. Holds entries and definition catalogs, and answers questions: `on(day)`, `between(range)`, `totalOf(metric, range)`.
- **`Goal`**: targets a metric key with a direction and period. Never knows which domain produced the number. One progress algorithm, written once.

The library is **single-user by design**: a `Journal` is one person's life. Multi-user apps instantiate one per user. No `userId` plumbing anywhere.

## Directory layout

```
packages/all-of-oyl/src/
  core/        Id, DayKey, Quantity, Money, MetricKey, Entry, Journal,
               Repository<T> interface, InMemoryRepository<T>
  activity/    Activity (definition), ActivityLog (entry)
  nutrition/   FoodItem (definition), Consumption (entry)
  finance/     Account (definition), Transaction (entry), Budget
  goal/        Goal, GoalProgress
  index.ts     public surface
```

Tests are colocated: `core/money.test.ts` next to `core/money.ts`, etc.

## Core components

### Value objects (immutable, constructor-validated, `equals()`)

- **`Id`** — branded string; `Id.create()` generates (crypto.randomUUID), `Id.of(string)` validates.
- **`DayKey`** — a calendar day as `YYYY-MM-DD`. Constructed from a `Date` + explicit IANA timezone, so "today's calories" never bleeds across midnight. Comparable, supports `next()`, `addDays(n)`, ranges.
- **`Quantity`** — `amount` + `unit` string (`30 min`, `2 servings`, `8000 steps`). Arithmetic only between matching units; mismatches throw.
- **`Money`** — integer minor units + ISO currency code. No float arithmetic. `Money.usd(4210)` is $42.10. Add/subtract require matching currency. `toNumber()` exposes major units for metric emission.
- **`MetricKey`** — dot-namespaced string (`nutrition.calories`, `finance.spend.groceries`, `activity.run.minutes`). Validated format; the cross-domain contract between entries and goals.

### Entry subclasses and what they emit

| Class | Domain | Emits (examples) |
|---|---|---|
| `ActivityLog` | activity | `activity.<slug>.count: 1`, `activity.<slug>.minutes`, plus any logged quantities (`activity.run.km`) |
| `Consumption` | nutrition | `nutrition.calories`, `nutrition.protein`, `nutrition.carbs`, `nutrition.fat` — computed as FoodItem nutrients × servings |
| `Transaction` | finance | expense: `finance.spend.<category>`; income: `finance.income.<category>` — in major currency units |

### Definitions vs. entries

Each domain splits into a reusable **definition** and dated **entries** that reference it by id:

- **`Activity`** — name, slug, optional default unit. The thing you do ("Run", "Meditate").
- **`FoodItem`** — name, nutrients per serving (calories/protein/carbs/fat).
- **`Account`** — name, currency. Transactions belong to an account; currency must match.

Definitions live in typed catalogs on the `Journal`. Entries are constructed against a definition (e.g., `Consumption` takes the `FoodItem`, captures the nutrient snapshot at log time so later edits to the catalog don't rewrite history).

### Journal

- `add(entry)` / `remove(id)` / catalogs for definitions.
- `on(day: DayKey): Entry[]`, `between(start, end): Entry[]`
- `totalOf(metric: MetricKey, range): number` — the single aggregation path everything shares.

### Goal

```ts
new Goal({ metric: "nutrition.calories", target: 2200, direction: "atMost", period: "day" })
new Goal({ metric: "activity.run.minutes", target: 150, direction: "atLeast", period: "week" })
```

- `period`: `day | week | month`. `direction`: `atLeast | atMost`.
- `progressOn(journal, day): GoalProgress` — resolves the period window containing `day`, sums via `journal.totalOf`, returns `{ current, target, ratio, met }`. `ratio` is attainment for `atLeast`, consumption-of-allowance for `atMost`, clamped to [0, 1].

### Budget

Sugar over the goal engine: a `Budget` is per-category, per-month spending control. `budget.spent(journal, month)`, `budget.remaining(journal, month)` (Money), built on the same `finance.spend.<category>` metric totals. No second aggregation implementation.

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

`Journal` itself is a plain in-memory aggregate, not repository-backed: apps load entries/definitions from their repositories and hydrate a `Journal` to ask questions of it. This keeps every `Journal` method synchronous and trivially testable.

## Error handling

- Invalid construction throws `DomainError` (single error class, `code` field) — invalid id format, negative servings, mismatched currency/unit arithmetic, malformed metric keys, target ≤ 0.
- Queries never throw for "not found"; they return `undefined` / empty arrays / zero totals.

## Testing & TDD

- Vitest, strict red-green-refactor. Each class begins life as a failing test.
- Build order (each step depends only on previous): **value objects → Entry + Journal → activity → nutrition → finance → Goal → Budget**.
- No mocking frameworks needed: the domain is pure; tests construct real objects and use `InMemoryRepository`.
- Behavioral coverage targets: timezone edges for `DayKey`, currency/unit mismatch rejection, snapshot semantics of `Consumption`, period-window resolution for weekly/monthly goals, atMost vs atLeast ratio semantics.

## Out of scope (v1)

Recurrence/scheduling (rrule), goal milestones, multi-currency conversion, sync/offline, any UI or API concerns.

## Future life-organizing domains (suggestions)

The spine makes these cheap — each is just another Entry subclass and/or definition, no core changes:

1. **Sleep & mood** (`sleep.hours`, `mood.score`) — highest-value next addition; instantly enriches goal tracking.
2. **Medication & supplements** — scheduled consumables.
3. **Time blocking / calendar commitments.**
4. **Household maintenance & chores** — recurring activities.
5. **Reading / learning log.**
6. **Relationships** — last-contacted nudges.
7. **Net-worth snapshots & savings goals** — links finance to goals.
8. **Weekly review** — a meta-entry summarizing goal adherence.
