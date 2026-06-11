# all-of-oyl Domain Core — Design

**Date:** 2026-06-11
**Scope:** a self-contained domain core. Its current home is `packages/all-of-oyl/src/` (greenfield; the legacy `modules/` code is untouched and ignored), but nothing in this design is specific to that repository — the spec is written to be implemented by any project, in front of any framework.

## Purpose

A DRY, minimalistic set of TypeScript classes that can drive a complete "Organize Your Life" application: what you **did** (activities, meals, spending, sleep, mood, vitals), what you **intend** (tasks, projects, appointments, meal plans), what you **have** (documents, possessions, subscriptions, contacts), what it all **means** (goals, budgets, streaks, reviews, correlations), and **who you share it with** (a user shape, connections, and scoped progress/day-plan sharing). Pure domain layer — no HTTP, no CMS, no storage technology. Built test-first with Vitest.

## At a glance

Ten facts that carry the whole design; every section below elaborates one of them:

1. Every record of life is an **`Entry`** that emits numeric **metrics**; one aggregation path (`journal.aggregate`) serves goals, budgets, streaks, reviews, and correlations.
2. Every future obligation answers **`nextDueOn(asOf)`**; one due-collection path serves reminders, overdue lists, and upcoming feeds.
3. Three per-person roots: **`Journal`** (happened), **`Planner`** (intended), **`Vault`** (owned) — plus a pure-function read side (`insights/`).
4. **Definitions vs. entries**: reusable catalog items (`Activity`, `Food`, `Account`) are referenced by id and snapshotted at log time; history never rewrites.
5. Value objects do the safety work: `Money` (integer minor units), `DayKey` (timezone-explicit days), `Quantity` (unit-checked), `Cadence` (simple recurrence).
6. **Goals are domain-blind** — they target metric keys, with direction, period, aggregation kind, and humane pause semantics.
7. **`DayPlan`** is the day-by-day unit: a derived agenda the user reorders and time-boxes.
8. Users are profiles, not credentials; sharing is **default-deny**, scoped by `Grant`, derived-data-only, and decided in exactly one projection (`sharedProgress`).
9. No hidden clock, no runtime dependencies, strict TS, `toJSON`/`fromJSON` on everything persistable.
10. Seven build phases, each independently shippable, TDD throughout.

## Architecture: three roots and a read side

Everything hangs off three aggregate roots plus one read-side module, all sharing the same core value objects:

| Root | Question it answers | Contents |
|---|---|---|
| **`Journal`** | What happened? | Timestamped `Entry` records that emit metrics |
| **`Planner`** | What's supposed to happen? | `Plan` items (tasks, appointments, planned meals) with due dates and fulfillment links |
| **`Vault`** | What do I have? | Registry items (documents, possessions, subscriptions, contacts) that surface due dates |
| **`insights/`** | What does it mean? | Pure functions over the Journal: goals feed off it; streaks, reviews, correlations |
| **`user/` + `share/`** | Who am I, and who sees what? | `User` profile; `Connection` and scoped `Grant`s for sharing progress and day plans |

The roots are **per-person by design**: one `Journal`/`Planner`/`Vault` triple is one person's life, so no `userId` ever appears inside them. The person themself has a shape (`user/`), and people connect to each other through explicit, scoped grants (`share/`) — see "Users, security, and sharing." Cross-user orchestration (auth, lookup, transport) belongs to the app.

### The two unifying contracts

1. **Metrics (Journal side):** every `Entry` implements `metrics(): ReadonlyMap<MetricKey, number>` — what that moment contributed to your life, in numbers. Goals, budgets, streaks, reviews, and correlations all reduce to one operation, `journal.aggregate(metric, range, kind)`, implemented once.
2. **Dues (Planner/Vault side):** plans and many vault items implement `Due { nextDueOn(asOf: DayKey): DayKey | undefined }`. The `asOf` parameter exists because recurring dues (birthdays, subscription renewals) have no single due date — only a *next occurrence relative to a day*; fixed dues (a document's expiry, a task's deadline) simply ignore it. (`nextDueOn`, not `dueOn`, so it never collides with `planner.dueOn(day)`, which returns plans.) Reminders, overdue lists, and "upcoming" feeds all reduce to one operation, collecting and sorting dues — also implemented once.

## Directory layout

```
packages/all-of-oyl/src/
  core/        Id, DayKey, DayRange, Cadence, Quantity, Money, MetricKey,
               DomainError, PersistedMeta, LifeArea, Catalog<T>, Entry (abstract),
               Journal, Plan (abstract), Due interface, Repository<T>,
               InMemoryRepository<T>
  activity/    Activity (definition), ActivitySession (entry)
  nutrition/   Food (definition), Consumption (entry)
  finance/     Account (definition), Transaction (entry)
  goal/        Goal, GoalProgress, Budget
  track/       Measurement (entry), Note (entry)
  plan/        Task, Project, Appointment, PlannedMeal, DayPlan, Planner (root)
  vault/       Document, Possession, Subscription, Contact, GiftIdea, Vault (root)
  user/        User (profile)
  share/       Connection, Grant
  insights/    streaks, review, correlate, sharedProgress
  fixtures/    builders + canonical seed dataset (see Testing & TDD)
  index.ts     public surface
```

Root placement follows the import rule, not symmetry: `Journal` lives in `core/` because it operates purely on the abstract `Entry`. `Planner` and `Vault` need their concrete item types (`groceryList` reads `PlannedMeal`s; the due feed walks the five registries), so they live in their own modules — `core/` never imports upward. `Budget` lives in `goal/` because it wraps the goal engine; it needs no finance types (a category slug and `Money` suffice), so the no-cross-domain-imports rule holds.

Tests are colocated: `core/money.test.ts` next to `core/money.ts`, etc.

## Core value objects (immutable, constructor-validated, `equals()`)

- **`Id`** — branded string; `Id.create()` generates (crypto.randomUUID), `Id.of(string)` validates.
- **`DayKey`** — a calendar day as `YYYY-MM-DD`. Constructed from a `Date` + explicit IANA timezone, so "today's calories" never bleeds across midnight. Comparable; `addDays(n)`, `weekday()` (for ISO week windows).
- **`DayRange`** — inclusive `start`/`end` pair of `DayKey`s; iterable over its days; `contains(day)`. The one range type every `entriesIn`/`upcoming`/`totalOf` signature shares. Construction with `end < start` throws.
- **`Cadence`** — simple recurrence: every N `days | weeks | months | years` (N ≥ 1). **Anchor-based, never iterated:** `nextOnOrAfter(anchor: DayKey, asOf: DayKey): DayKey` computes the k-th occurrence from the anchor each time, clamping each occurrence to month-end independently (Jan 31 + 1 month = Feb 28/29) — so a monthly schedule anchored on the 31st returns to Mar 31 after a Feb 28, instead of silently drifting to the 28th forever. `nextAfter(day)` is sugar for `nextOnOrAfter(day, day.addDays(1))`, for the cases that deliberately *re-anchor* (see Task). Used by subscriptions, recurring tasks, occasions. (Deliberately not rrule; if complex recurrence is ever needed, `Cadence` is the seam to extend.)
- **`Quantity`** — `amount` + `unit` string (`30 min`, `2 servings`, `8000 steps`). Arithmetic only between matching units; mismatches throw.
- **`Money`** — integer minor units + ISO currency code + minor-unit exponent (defaults to 2; pass explicitly for outliers like JPY's 0). No float arithmetic. `Money.usd(4210)` is $42.10. **Negative amounts are legal** — refunds and adjustments are negative expenses, so `finance.spend.<category>` is net-of-refunds by construction. Add/subtract require matching currency. `toNumber()` exposes major units for metric emission.
- **`MetricKey`** — dot-namespaced string (`nutrition.calories`, `finance.spend.groceries`): two or more segments joined by `.`, each segment matching `[a-z0-9_]+`. Validated format; the cross-domain contract between entries and everything that reads them.

**One slug grammar everywhere.** Activity slugs, transaction categories, note tags, and `LifeArea` slugs all share the segment rule `[a-z0-9_]+` — because each of them gets embedded into a `MetricKey` segment. One validator in `core/`, reused by every domain.

## Journal: records of what happened

- **`Entry`** (abstract): `id`, `kind` (the serialization discriminant, fixed per subclass), `occurredAt` (Date), optional `note`, `metrics()`.
- **`Journal`**: constructed with an explicit IANA timezone — the one place the timezone decision lives; apps pass `user.timezone` when hydrating a person's roots. Entries store instants (`occurredAt`); the Journal buckets them into `DayKey`s using its timezone, so `entriesOn(day)`, `entriesIn(range)`, and every period window agree on where days begin. (Entries logged while traveling land on the day of your home journal — an accepted simplification. Corollary: changing `user.timezone` re-buckets *all* history at query time — daily totals and streaks can shift around the move. Documented behavior, not a bug: instants are the truth, days are a lens.)
- Query surface: `add(entry)` / `remove(id)`, `entriesOn(day)`, `entriesIn(range)` (collection queries are named for what they return; bare `on()` would read like an event-listener registration), `span(): DayRange | undefined` (first to last entry day — bounds streak walks and review deltas), `aggregate(metric, range, kind: 'sum' | 'avg' | 'last')`, `totalOf(metric, range)` (alias for `aggregate(..., 'sum')`), and `totalsByPrefix(prefix, range): ReadonlyMap<MetricKey, number>` — the enumerating sibling of `totalOf` that powers "top spending categories" and "minutes per activity" without a second aggregation path.

**Counters vs. gauges.** Summing is right for counters (calories, minutes, dollars) but nonsense for gauges — two weigh-ins of 80 kg are not 160 kg. Hence the `kind` parameter: `'last'` (most recent value in range) and `'avg'` serve gauge metrics like `body.weight_kg` and `mood.score`. Goals carry a matching optional `aggregation` (default `'sum'`), so "weigh at most 80 kg" is `{ metric: "body.weight_kg", target: 80, direction: "atMost", period: "day", aggregation: "last" }`.

Gauge aggregation over multi-day ranges is **two-stage**, because flat averaging lets two naps in one day skew a week: the kind applies within each day first, then `'avg'` means the mean of those daily values over days-with-data, and `'last'` means the most recent day's value. `'sum'` stays a flat sum. When two entries share an `occurredAt` instant, `'last'` breaks the tie by insertion order (later `add` wins) — deterministic, not floating on map iteration.

### Entry subclasses and what they emit

| Class | Module | Emits (examples) |
|---|---|---|
| `ActivitySession` | activity | `activity.<slug>.count: 1`, `activity.<slug>.minutes`, plus any logged quantities (`activity.run.km`). Doubles as time tracking — minutes against an activity *is* "where my hours go". |
| `Consumption` | nutrition | `nutrition.calories/protein/carbs/fat`, `nutrition.water_ml` — Food nutrients × servings |
| `Transaction` | finance | expense: `finance.spend.<category>`; income: `finance.income.<category>` — major currency units |
| `Measurement` | track | One generic class for any numeric observation: `body.weight_kg`, `body.bp_systolic`, `sleep.hours`, `mood.score`, `screen.minutes`, `home.kwh`. Constructed as `new Measurement({ metric, value, occurredAt })`. Conventional keys documented in the module. Accepts only measurement-owned namespaces (`body`, `sleep`, `mood`, `screen`, `home`, `custom`); a key under an entry-owned namespace like `activity.*` or `finance.*` throws `DomainError('RESERVED_NAMESPACE')` — hand-logged values must not pollute derived metrics. |
| `Note` | track | Free-text journaling/gratitude: `text`, optional `tags`; emits `note.count: 1` (and `note.<tag>.count` per tag) so streaks like "journal daily" work |

`Measurement` is the deliberate DRY move: sleep, mood, vitals, screen time, and utilities are all *one* class with conventional metric keys — five suggested domains for the cost of zero new abstractions.

### Definitions vs. entries

Each concrete domain splits into a reusable **definition** and dated **entries** that reference it by id:

- **`Activity`** — name, slug, optional default unit, optional `areaId` ("Run", "Meditate").
- **`Food`** — name, nutrients per serving (calories/protein/carbs/fat/water).
- **`Account`** — name, currency. A `Transaction`'s `accountId` is *optional* (cash spending, or a generated subscription charge with no account configured); when present, the transaction's currency must match the account's. The *metric* layer assumes one working currency per journal (`user.defaultCurrency`): `finance.*` metrics are unit-blind numbers, so apps convert foreign spending before constructing the `Transaction` — mixing currencies into one metric is silent nonsense the domain can't detect.

Definitions live in **`Catalog<T>`** instances (a small keyed collection in `core/`: `add`, `get`, `all`, plus `bySlug` for item types that carry a slug) held by the app — *not* on the `Journal`. `Catalog` is to definitions what `Journal` is to entries: the synchronous, hydrated in-memory view of a `Repository`. Two reasons: the Journal would otherwise need to know every domain's definition types (an upward import `core/` is forbidden from making), and entries don't need the catalog after construction anyway — they capture a snapshot of the definition's values at log time (e.g., `Consumption` copies nutrients), so later catalog edits never rewrite history.

The snapshot doubles as an escape hatch: because `Consumption` always *stores* its nutrients, its `foodId` is provenance, not a requirement — a quick-logged restaurant meal is a `Consumption` with nutrients given directly and no `foodId`. (`ActivitySession` keeps `activityId` required: its metric keys are built from the activity's slug, so there is no meaningful session without one.)

## Planner: intentions and their fulfillment

- **`Plan`** (abstract): `id`, `kind` (serialization discriminant, fixed per subclass), `title`, optional `due` (DayKey), `status` (`open | done | canceled`), `completedOn?: DayKey`, optional `fulfilledBy: Id[]` linking to the Journal entries that satisfied it. `complete(on: DayKey, entryId?)` sets status, records when (done-on-time is uncomputable without it, and a recurring task's next occurrence is seeded from `completedOn`, not from `due`), and records the link. `cancel()` moves `open → canceled`; completing or canceling anything not `open` throws.
- **`Task`** — the plain to-do; optional `projectId`, optional `cadence` (completing a recurring task spawns the next occurrence via `nextAfter(completedOn)` — duty cadences deliberately **re-anchor on actual completion**: water the plants 7 days after you actually watered them, and a late completion simply shifts the rhythm; if the spawned task is already past due, it's overdue immediately, which is honest), optional `possessionId` (a bare `Id` — no vault import). Recurring tasks deliberately cover *all* recurring duties — chores, asset upkeep ("replace HVAC filter"), watering plants. There is exactly one recurrence-of-duty mechanism in the system.
- **`Project`** — a named group of tasks, optional `areaId`; `progress(planner)` = done/total of its tasks.
- **`Appointment`** — a plan with a specific `startsAt` (Date) and optional `durationMinutes`; calendar/time-blocking primitive. Its `due` day is derived at construction from `startsAt` + an explicit IANA timezone argument (same no-hidden-clock rule as everywhere else).
- **`PlannedMeal`** — Food + servings + day; fulfilled by a `Consumption`. `planner.groceryList(range): ReadonlyMap<Id, Quantity>` aggregates servings per Food id across the range's planned meals.
- **`DayPlan`** — the day-by-day planning primitive: one per `DayKey`, an ordered list of slots `{ planId, start?, end? }` where `start`/`end` are `"HH:MM"` strings local to the plan's day (no Date objects — a time box belongs to the day, not to an instant; `end` requires `start` and must follow it). `planner.agendaFor(day)` derives the default agenda (appointments sorted by `startsAt`, then tasks due, then planned meals); a `DayPlan` is the user's edited version of that — reordered, time-boxed, with slots they chose to defer. At most one `DayPlan` per day; `planner.dayPlanFor(day)` returns it or the derived default. Slots referencing canceled or missing plans are skipped by reading queries (kept in storage — the plan may be restored), so a stale `DayPlan` degrades gracefully instead of erroring.
- **`Planner`** (root): `add/remove`, `dueOn(day)`, `overdue(day)` (open plans with `due < day`), `upcoming(range)`, `agendaFor(day)`, `dayPlanFor(day)`, `completionRate(range)` (done ÷ (done + open) among plans due in the range; canceled plans are excluded from both sides; `undefined` when no plans are due — zero plans is no data, not a perfect score).

**Planned vs. actual** is the payoff of fulfillment links: the planner knows what was intended, the journal knows what happened, and the link makes adherence computable (meals followed, tasks done on time) without either side knowing the other's internals.

## Vault: registries of what you have

Not time-series — these live beside the Journal, keyed collections with one shared trait: anything with a future date implements `Due`, and `vault.upcoming(range)` collects them all into a single reminder feed (document expiries, warranty expiries, subscription renewals, birthdays). Apps merge it with `planner.upcoming(range)` for the complete what's-coming view.

- **`Document`** — name, kind (passport/insurance/warranty/...), optional `expiresOn`.
- **`Possession`** — name, optional location, optional `warrantyUntil`, optional purchase info (Money, date). Upkeep of a possession is *not* a vault concept — it's a recurring `Task` carrying the `possessionId` (see Planner); the system has one recurrence-of-duty mechanism, not two.
- **`Subscription`** — name, `amount: Money`, `cadence: Cadence`, `anchor: DayKey` (first billing day), `renewedThrough?: DayKey` (cursor: the last occurrence already paid), category, optional `accountId`. The pending occurrence is the first anchored occurrence after `renewedThrough` (the `anchor` itself if never renewed); `nextDueOn(asOf)` returns it *even when it's already past* — a lapsed renewal must surface as overdue, not silently skip to next month. `renew(on: DayKey)` moves the cursor to the pending occurrence (anchor-derived, so late renewals never drift the schedule) and returns a `Transaction` (dated `on`, charged to `accountId`) for the caller to add to the Journal — the registry that *generates* finance entries. `vault.monthlySubscriptionTotals(): ReadonlyMap<string, Money>` (keyed by currency code) answers "what do my subscriptions cost per month?" — annual amounts prorated, and per-currency because `Money` rightly refuses to add dollars to euros.
- **`Contact`** — name, optional `lastContactedOn`, occasions (name + anchor `DayKey` + `Cadence`, e.g. birthday = anchor date, yearly); an occasion's `nextDueOn(asOf)` is its next occurrence on or after `asOf`, correct across year boundaries. `staleness(day)` supports "you haven't talked to Sam in 3 months" nudges.
- **`GiftIdea`** — text + contact link; surfaces alongside that contact's next occasion.

## Users, security, and sharing

### The user shape

**`User`** (`user/` module, imports core only) is the person's *profile*, not their credentials: `id`, `displayName`, `timezone` (IANA — the value every root is hydrated with), `defaultCurrency`, optional `units` preference (`metric | imperial`). Deliberately excluded: email, password hashes, OAuth identities, sessions — authentication identity is the app/backend's record, linked to the domain `User` by id. The domain holds the minimum PII that features actually need (a display name), which keeps the whole layer cheap to protect and trivial to erase.

### Connections and grants

Two small classes in `share/` (imports core only — scopes reference goals/areas by `Id` and metrics by `MetricKey`, never by type):

- **`Connection`** — directional record: `requesterId` (who invited) and `addresseeId` (equal ids throw — there is no self-connection), with a status machine: `invited → accepted`, either side may move to `blocked` — and `blockedById` records who, because only the blocker may `unblock()` (which restores `accepted` and clears `blockedById`). Only `accepted` carries any visibility. Invitations expire-able by the app; the domain enforces legal transitions (`accept()` on a blocked connection throws).
- **`Grant`** — *what* one user lets a specific connection see. Fields: `connectionId`, `grantorId` (the user sharing their data — a connection has two members, and a grant flows one way; the viewer is the other member), `scope`, optional `expiresOn` (*inclusive*: the grant is live through the end of that day, matching `DayRange` semantics), `revokedAt`. Scopes are a closed union:
  - `goal-progress(goalId)` — that goal's `GoalProgress` + streak, nothing else
  - `area-summary(areaId)` — the per-area rollup from reviews
  - `metric(prefix)` — daily aggregates under a metric prefix (e.g., `activity.run`)
  - `day-plan` — the shared day-by-day view for co-planning (partner, trainer, accountability buddy)

### Security model (domain-level)

- **Default-deny.** Nothing is visible across users without an `accepted` Connection *and* a live (unrevoked, unexpired) Grant. There is no query path that crosses users — sharing is not a filter on someone else's Journal; it is a separate, explicit projection.
- **Derived data only.** Grants expose progress, streaks, summaries, and agendas — never raw entries. A friend sees "ran 150 min this week, streak 12," not your GPS-adjacent activity log, your meals, or a transaction. Raw-entry sharing deliberately does not exist in v1.
- **One projection function.** `insights/sharedProgress({ journal, planner, goals, connections, grants, viewerId, asOf, ...catalogs })` builds the complete view a viewer is entitled to. It needs `connections` as well as `grants` — a grant alone proves nothing; the projection verifies the connection is `accepted`, the viewer is its other member, and the grant is live, before projecting anything. A grant whose connection is missing or soft-deleted is dead — absence denies, like everything else here. (Note for grantors: `metric("custom")` exposes *every* user-defined metric at once; apps should surface that breadth in the consent UI.) Catalogs (areas, activities) ride along only as far as the scopes demand. Apps render only what it returns — there is exactly one place where cross-user visibility logic lives, so there is exactly one place it can be wrong.
- **Revocation is immediate and total**: `grant.revoke(on)` makes the grant dead for all future projections; nothing is grandfathered.
- **Erasure-friendly by construction.** Everything a person owns hangs off roots and catalogs keyed by their id; deleting a user is deleting those aggregates plus their connections/grants. No tombstones, no orphaned references to chase.
- **Out of the domain, named explicitly**: authentication, sessions/tokens, transport security, at-rest encryption, and rate limiting are app/backend obligations. The domain's contribution to security is a sharing model that is *small enough to audit*.

### Day-by-day planning, shared

`DayPlan` (see Planner) is the unit of co-planning: a `day-plan` grant lets a partner or coach view your agenda alongside theirs. Mutation stays owner-only in v1 — shared *editing* is a future concern, flagged in "Extending the app's purpose," because concurrent edits demand conflict semantics the domain shouldn't improvise.

## Life areas: the top-level taxonomy

People organize their lives by *area* — health, family, career, money, growth — not by data type. **`LifeArea`** (in `core/`) is a minimal definition: `id`, `name`, `slug`. Apps hold the catalog (a user typically has 4–8). `Activity`, `Goal`, and `Project` carry an optional `areaId`. That single tag is enough for the read side to answer *"which areas am I investing in, and which am I neglecting?"* — the life-wheel view. Untagged items roll up into an implicit "unassigned" bucket; areas are an overlay, never a requirement.

## Goals, budgets, and insights (the read side)

### Goal

```ts
new Goal({ name: "Eat lighter", metric: "nutrition.calories", target: 2200, direction: "atMost", period: "day" })
new Goal({ metric: "activity.run.minutes", target: 150, direction: "atLeast", period: "week" })
new Goal({ metric: "sleep.hours", target: 7, direction: "atLeast", period: "day" })
```

- `period`: `day | week | month`. `direction`: `atLeast | atMost`. Optional `name` (display label; apps can derive one from the metric, but users name their own goals). Optional `areaId`. Optional `aggregation: 'sum' | 'avg' | 'last'` (default `'sum'`; see counters vs. gauges above). Optional `emptyPeriods: 'met' | 'skip'` (default `'skip'`): a period with *zero entries* for the goal's metric is **no-data**, and "never logging calories" must not produce a perfect calorie streak — no-data periods are skipped in streaks (bridged, like paused ones) and report `met: undefined`. `'met'` opts into vacuous success where absence genuinely is success: `Budget` sets it, because a month with no transactions really is under budget.
- Period windows are deterministic: a `day` is the `DayKey` itself; a `week` is the ISO week (Monday–Sunday) containing it; a `month` is its calendar month. All derived from `DayKey`, so the Journal's timezone decision flows through unchanged.
- `progressOn(journal, day): GoalProgress` — resolves the period window containing `day`, computes `current` via `journal.aggregate(metric, window, aggregation)`, returns `{ current, target, ratio, met, paused, empty }`. `ratio` clamped to [0, 1]: attainment for `atLeast`, consumption-of-allowance for `atMost`. `met?: boolean` is `undefined` for two distinguishable reasons — `paused: true` (you said stop judging) or `empty: true` with `emptyPeriods: 'skip'` (there was nothing to judge) — and UIs render those differently, so both flags are explicit.

### Pause semantics (humane tracking)

Streaks motivate until life intervenes — then a broken 90-day streak makes people quit the app. Goals support paused ranges:

- `goal.pause(from: DayKey, to?: DayKey)` — `to` omitted means "until resumed" (vacation mode); `goal.resume(on: DayKey)` closes an open pause. Ranges with `to < from` throw `DomainError`; overlapping or adjacent paused ranges merge into one, so pause history stays canonical.
- A period window that overlaps any paused range is **paused**: `progressOn` still reports numbers but sets `paused: true` and `met: undefined` — the type is `met?: boolean`, so "not asserted" is structural, not a value consumers must remember to ignore.
- Streak math **bridges** paused periods: they neither break nor extend a streak. A 30-day streak, a two-week pause, and a met day resumes at 31.

### Budget

Sugar over the goal engine: per-category, per-month spending control. `budget.spent(journal, month)`, `budget.remaining(journal, month)` (Money), built on `finance.spend.<category>` totals. No second aggregation implementation.

Metric totals are major-unit numbers, so `Budget` reconstructs `Money` by rounding to minor units. Each emitted value originates from an exact minor-unit amount, so float drift across a realistic month of transactions stays far below half a cent — and the rounding makes it exact again.

### insights/

Pure functions over the Journal (and Planner where noted) — zero new data entry, pure read-side analysis:

- **`streak(journal, goal, asOf): number`** — consecutive periods (ending at `asOf`) where the goal was met. Works for any goal, any domain. Paused and no-data periods are bridged, not broken. **Streaks evaluate data, not goal age**: creating a goal over qualifying history shows an instant streak (bounded by `journal.span()`) — data is data, and retroactive credit is motivating rather than dishonest. The in-progress period containing `asOf` is asymmetric by direction: for `atLeast` it counts as soon as it's met (you ran your 150 minutes by Wednesday); for `atMost` it's excluded until complete (you can't have "kept under budget" for a month that isn't over).
- **`review({ journal, planner, goals, activities, areas, period }): Review`** — takes the catalogs it needs explicitly (activities for the area mapping, areas for labels); the weekly/monthly/annual review object: per-goal progress and streaks, top spending categories, activity totals, planner completion rate, period-over-period deltas, and a **per-area rollup** (goals met, activity minutes, and projects touched per `LifeArea` — the life-wheel data). A `Review` is plain data an app can render.
- **`correlate(journal, metricA, metricB, range, kinds?): number | undefined`** — Pearson correlation over per-day values of two metrics ("does mood track sleep?", "does spending spike when exercise drops?"). Each day's value is the metric's daily aggregate; `kinds` supplies the per-metric aggregation (default `'sum'`) — mood-vs-sleep needs `avg`/`avg`, or summing two mood scores in one day corrupts the series. Returns r in [-1, 1], or `undefined` when it cannot honestly answer: fewer than 3 overlapping days-with-data, or zero variance in either series (a constant correlates with nothing).

## Persistence boundary

### Records have record properties

Every persistable entity (entries, plans, definitions, goals, budgets, vault items, `User`, `Connection`, `Grant`, `DayPlan`, `LifeArea`) is a database record in any real deployment, so each carries an optional **`meta?: PersistedMeta`** — a plain shape in `core/` (not a class; repositories build and replace it wholesale):

```ts
type PersistedMeta = {
  createdAt: Date     // first persisted
  updatedAt: Date     // last persisted
  revision: number    // optimistic concurrency; bumped on every save
  deletedAt?: Date    // soft delete; absent = live
}
```

Rules that keep this honest:

- **Freshly constructed objects have no `meta`.** Repositories stamp it on first save and refresh it on every subsequent save — the *storage* clock, not the domain clock, so the no-hidden-clock rule is untouched.
- **Domain logic never branches on `meta`.** It exists for adapters (concurrency, sync, trash/undo UIs) and round-trips through `toJSON`/`fromJSON` untouched.
- **Soft delete is the default delete.** `delete(id)` sets `deletedAt`; `purge(id)` is the hard remove that backs the right-to-erasure story. `list()` excludes soft-deleted records unless asked.
- **Stale writes are conflicts, not last-writer-wins.** `save` compares the incoming `revision` against the stored one and rejects mismatches with `DomainError('REVISION_CONFLICT')` — the seam future sync/offline work will build on.

### Repository interface

```ts
interface Repository<T extends { id: Id }> {
  get(id: Id): Promise<T | undefined>                       // undefined for soft-deleted
  list(opts?: { includeDeleted?: boolean }): Promise<T[]>
  save(item: T): Promise<T>                                  // returns item with fresh meta
  delete(id: Id): Promise<void>                              // soft
  purge(id: Id): Promise<void>                               // hard
}
```

Plus `InMemoryRepository<T>` — the reference implementation, used by tests; it implements all of the above semantics (stamping, revision checks, soft delete) so adapter authors have an executable specification to copy. Apps supply real adapters; the domain never imports one.

Corner semantics, pinned: `save` of an item carrying `meta` for a record the store doesn't have is a **create** — the store stamps fresh meta (it owns meta wholesale; this is what makes purge-then-restore and import flows work). `delete`/`purge` of a missing id are no-ops, as is `journal.remove(id)` of a nonexistent entry — removal is idempotent everywhere. Adds are the opposite: `journal.add` / `catalog.add` of an already-present id throws `DomainError('DUPLICATE_ID')` — strict adds, idempotent removes.

**Ownership lives in the adapter, not the model.** Multi-user storage needs an owner column on every table, but domain objects never carry a `userId` — each adapter instance is constructed *already scoped to one user*, the same way the roots are. An unscoped query path doesn't exist to forget about, which is the entire lesson of default-deny.

`Journal`, `Planner`, and `Vault` are plain in-memory aggregates, not repository-backed: apps load items from their repositories and hydrate the roots to ask questions of them. This keeps every method synchronous and trivially testable.

## Full-stack portability

This core is the *shared kernel* of a full-stack application: the same classes run in the browser, on the server, and in tests. The contract that keeps that true:

- **Runtime baseline:** ES2022, ESM. The only platform dependencies are `crypto.randomUUID()` and `Intl.DateTimeFormat` — available in modern Node, browsers, and edge runtimes (React Native needs an `Intl` polyfill; that's the consumer's note, not a design change). Nothing imports `fs`, `path`, DOM, or any framework. The package is side-effect-free (`"sideEffects": false` semantics), so bundlers tree-shake unused domains.
- **Isomorphic by intent.** Clients construct and validate domain objects for instant feedback; servers re-validate by constructing the same objects from the wire — one rulebook, written once, enforced twice. The server is always authoritative.
- **The wire format is `toJSON`.** The PlainShapes are the DTOs. REST, GraphQL, tRPC, or a message queue all carry the same shapes, and `fromJSON`/the revivers reconstruct full objects on either side. No parallel DTO layer to drift out of sync.
- **Trusted boundary for sharing.** `sharedProgress` (and any grant evaluation) must execute on a trusted boundary — the server or an equivalent. A client is never handed another user's Journal to filter; it receives only the projection's output. Grants enforced client-side are decoration, not security.
- **Storage is an adapter decision per deployment:** the same `Repository<T>` interface fronts a CMS or SQL database server-side, IndexedDB/localStorage for offline-first clients, or the in-memory implementation for tests and prototypes. The domain never knows which.
- **Versioning:** the moment a second project consumes this package, it adopts semver; breaking a `toJSON` shape or a public signature is a major. Until then, the spec's "no version field" stance (see serialization) keeps shapes lean.

## Code design decisions

- **Zero runtime dependencies.** The package keeps no production deps. Ids come from `crypto.randomUUID()`; timezone math uses the platform `Intl` APIs. A pure domain layer that needs nothing installed runs identically in any JavaScript runtime a consumer chooses (see "Full-stack portability").
- **Two tiers of value object.** `Id` and `MetricKey` are **branded strings** (`string & { readonly __brand: 'Id' }`) created through validating factory functions — zero allocation, `===` equality, JSON-native. `Money`, `Quantity`, `DayKey`, and `Cadence` are **classes** with `equals()`, since they carry structure and behavior. Don't pay for a class where a brand suffices.
- **Construction style.** One pattern everywhere: constructors take a single named-props object and validate; static factories exist only where they add meaning (`Money.usd(4210)`, `DayKey.from(date, tz)`, `Id.create()`). No builders, no `init()` methods — an object that exists is valid.
- **Immutability split.** Value objects and entries are deeply immutable (`readonly` fields). Aggregate roots (`Journal`, `Planner`, `Vault`) and stateful entities (`Goal` pause state, `Task` status) mutate in place — they're in-memory aggregates, and copy-on-write would buy nothing here. All getters return readonly views (`ReadonlyArray`, `ReadonlyMap`); internal collections never escape. `meta` sits outside the immutability rule — repositories replace it wholesale on save; domain code never writes it.
- **Equality semantics.** Entities compare by `id`; value objects by value. No generic deep-equal utility — each class states its own rule.
- **Explicit time, no hidden clock.** Nothing in the domain calls `Date.now()` or reads the system timezone. Every time-sensitive operation takes its reference point as a parameter (`occurredAt`, `asOf`, `day`, `tz`). This makes every test deterministic without clock mocking and every result reproducible.
- **Serialization built in.** Every persistable class has `toJSON(): PlainShape` and a static `fromJSON(shape)`. `Entry` and `Plan` subclasses carry a `kind` discriminant so a single dispatcher can revive a heterogeneous list. Dates serialize as ISO strings, `DayKey` as `YYYY-MM-DD`, `Money` as `{ minor, currency, exponent }`; `meta` (when present) rides along untouched. **Tolerant reader:** `fromJSON` validates the fields it knows and *preserves* unknown fields through to the next `toJSON` — an older client must never destroy a newer client's data by round-tripping it. Malformed *known* fields throw `DomainError('MALFORMED_JSON')`. No version field in the shapes — structural validation suffices until the first breaking change (YAGNI). Round-tripping (`fromJSON(toJSON(x))` equals `x`) is a standing test for every class.
- **Inheritance budget: two.** `Entry` and `Plan` are the only abstract classes; everything else composes. New behavior enters via the `metrics()` and `Due` contracts, not subclass trees.
- **Import discipline.** Domain modules (`activity/`, `nutrition/`, `finance/`, `goal/`, `track/`, `plan/`, `vault/`, `user/`, `share/`) import from `core/` only — never from each other. `insights/` and `fixtures/` may import anything (both sit downstream of every module). `index.ts` is the only barrel; files are kebab-case, one class per file, named exports only (no `default`).
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

- Invalid construction and illegal operations throw `DomainError` (single error class, `code` field from a closed union).
- Codes defined by this spec — the starting union, grown only deliberately: `INVALID_ID`, `INVALID_SLUG`, `INVALID_METRIC_KEY`, `RESERVED_NAMESPACE`, `INVALID_QUANTITY` (negative servings, bad amounts, target ≤ 0), `UNIT_MISMATCH`, `CURRENCY_MISMATCH`, `INVALID_RANGE` (`end < start`, pause `to < from`, `end ≤ start` time boxes), `INVALID_DAY` (malformed `YYYY-MM-DD`), `INVALID_TIMEZONE` (unknown IANA zone), `ILLEGAL_TRANSITION` (plan/connection state machines, incl. completing a canceled plan and non-blocker unblocking), `DUPLICATE_ID`, `REVISION_CONFLICT`, `MALFORMED_JSON`, `UNKNOWN_KIND`.
- Queries never throw for "not found"; they return `undefined` / empty arrays / zero totals.

## Testing & TDD

- Vitest, strict red-green-refactor. Each class begins life as a failing test.
- No mocking frameworks: the domain is pure; tests construct real objects and use `InMemoryRepository`.

### Fixtures double as seed data

Test data and seed data are the same artifact, built once in `fixtures/`, in two layers:

- **Builders** — `makeConsumption(overrides?)`, `makeGoal(overrides?)`, … one per persistable class: sensible defaults, every field overridable, returning real domain objects. Unit tests use builders so each test states only the fields it cares about.
- **The canonical dataset** — two personas with stable, hand-assigned ids and a fixed anchor (`FIXTURE_TODAY = DayKey '2026-06-01'`; all dates relative to it, never to the wall clock):
  - **Avery** — the rich account, timezone `America/New_York` (DST-rich on purpose — fixture dates straddle a transition): 4 life areas; catalogs (activities, foods, accounts); ~6 weeks of entries across every entry type; goals in all three periods; tasks, a project, appointments, planned meals, and a `DayPlan`; vault items including a subscription and a Feb-29-birthday contact. The data deliberately exercises the spec's interesting features — a paused goal mid-streak, a refund transaction, an ad-hoc `foodId`-less meal, a recurring task completed late — so a seeded demo *shows off* the semantics, and integration-style tests get realistic shapes for free.
  - **Blake** — the sparse account: minimal data, plus an accepted connection with Avery and scoped grants both ways, so sharing tests and multi-user demos need nothing else.

Because the wire format is `toJSON`, the dataset is exported both as live objects (`fixtures/personas`) and as plain shapes (`fixtures/seed.ts` — arrays of PlainShapes). The shapes are what makes it *sourceable*: an app seeds a database by walking `seed` through its repository adapters (or an API), and tests revive the very same shapes through `reviveEntry`/`revivePlan` — which makes the seed file itself a standing round-trip test of the serialization layer. One dataset, three consumers: unit tests, integration seeding, demo environments. It never drifts from the domain because it's *constructed by* the domain (builders), not hand-maintained JSON.
- Behavioral coverage targets: timezone edges for `DayKey` (incl. DST 23/25-hour days and entries logged during the repeated fall-back hour), timezone-change re-bucketing of history, ISO week 53 spanning the year boundary, `Cadence` anchor preservation (monthly-on-the-31st returns to the 31st after February; late renewals don't drift the schedule) and month-end clamping (Jan 31 + 1 month), currency/unit mismatch rejection (incl. account-less transactions and currency-match only when an account is present), snapshot semantics of `Consumption` (incl. ad-hoc, `foodId`-less logging), `Measurement` reserved-namespace rejection, `DayPlan` slot validation (`end` without `start`, `end ≤ start`), period-window resolution for weekly/monthly goals, atMost vs atLeast ratio semantics, recurring-task respawn, subscription `renew()` producing a correct `Transaction`, lapsed subscriptions surfacing the overdue occurrence (never skipping it), per-currency subscription totals, pause-range merging (overlapping and adjacent), plan status transitions (`cancel`/`complete` on non-open throws), streak boundary conditions, streak bridging across paused ranges (incl. open-ended pause + resume), pause ranges overlapping period boundaries, gauge aggregation (`last`/`avg` with multiple same-day measurements, two-stage weekly `avg`, same-instant tie-break, empty ranges), no-data periods (`emptyPeriods: 'skip'` bridges streaks; `'met'` vacuous success for budgets), retroactive streak credit bounded by `journal.span()`, late recurring-task completion spawning an already-overdue occurrence, stale `DayPlan` slots skipped, `completionRate` `undefined` on empty ranges, negative-amount transactions netting against budgets, tolerant-reader round-trip (unknown fields preserved), occasion recurrence across year boundaries (incl. Feb 29 birthdays), per-area rollup with untagged items, correlation with missing days, repository semantics via `InMemoryRepository` (meta stamping, revision conflict on stale save, soft delete excluded from `list()` by default, purge), round-trip with and without `meta`, connection state machine (illegal transitions throw; blocked carries no visibility; only the blocker unblocks), default-deny in `sharedProgress` (no connection / not accepted / viewer not the other member / no grant / revoked / expired / connection soft-deleted all yield nothing; `expiresOn` inclusive on its boundary day), self-connection rejection, `correlate` `undefined` on zero variance or <3 overlapping days, repository corner semantics (create-on-save-with-foreign-meta, idempotent delete/purge/remove), grant scoping (a `goal-progress` grant leaks no other goal), and `agendaFor` ordering with overlapping time boxes.

## Build phases

Each phase is independently shippable and gets its own implementation plan. Order matters: every phase depends only on what came before. **Every phase extends `fixtures/`** with its domain's builders and its slice of the canonical dataset — fixtures grow in lockstep with the code, never as an afterthought (phase 1 establishes the conventions: `FIXTURE_TODAY`, stable-id scheme, builder pattern).

1. **Core spine** — value objects (`Id`, `DayKey`, `DayRange`, `Cadence`, `Quantity`, `Money`, `MetricKey`, `DomainError`), `LifeArea`, `Catalog`, the `Entry` and `Plan` abstracts, `Journal` (incl. aggregation kinds), `PersistedMeta`, `Repository`/`InMemoryRepository` (incl. soft delete + revision semantics), plus `User` (the profile every root is hydrated from).
2. **Recording domains** — activity, nutrition, finance, plus `track/` (`Measurement`, `Note`). After this phase the app can log a whole life.
3. **Goals & budgets** — `Goal` (incl. pause semantics), `GoalProgress`, `Budget`.
4. **Planner** — `Task`, `Project`, `Appointment`, `PlannedMeal`, `DayPlan`/`agendaFor`, `Planner` root, fulfillment links, grocery list (`Plan` abstract ships in phase 1 with core).
5. **Vault** — the five registries, the shared `Due` feed, subscription→transaction generation.
6. **Insights** — `streak`, `review`, `correlate`.
7. **Sharing** — `Connection`, `Grant`, `insights/sharedProgress`. Last on purpose: it projects everything the earlier phases build.

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

**Known future concerns, parked deliberately:** shared *editing* of day plans (concurrent mutation needs conflict semantics — owner-only writes until then), grant scopes for raw entries (privacy decision, not a technical one), group connections (households/teams — model as multiple pairwise connections until that visibly hurts), and `reopen()` for completed plans (undo interacts badly with recurring-task respawn — the next occurrence already exists; until that's designed, completion is final and mistakes are fixed by canceling the spawned task and adding a new one).

**What growth must never do:** add a second aggregation path, a second recurrence-of-duty mechanism, a third abstract class, a cross-domain import, or a second place where cross-user visibility is decided (`sharedProgress` is the only one). If a new feature seems to need one of these, the feature is mis-factored — recheck against the `metrics()`/`Due` contracts first.

## Out of scope

Complex recurrence (rrule — `Cadence` is the extension seam), multi-currency conversion, goal milestones, sync/offline semantics, notification delivery (the domain surfaces dues; apps decide how to notify), authentication/sessions/tokens, transport and at-rest encryption, user discovery/search, and any UI or API concerns. Wiring `src/index.ts` into the package's `exports` map (so apps import it alongside the legacy `modules/*`) is an integration step taken when the first consumer adopts the new core, not part of this design.
