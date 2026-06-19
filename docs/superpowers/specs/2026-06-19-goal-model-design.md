# Goal Model (Sub-project B-Goals) — Design

**Status:** approved (design) — 2026-06-19
**Predecessors:** nutrition, finance, measurement, activity-session (all merged); sub-project A.
**Roadmap source:** root `TODO.md` ("User Goal"). The LAST relational entity in the per-`TODO.md` push.

## Goal

Give the `Goal` domain entity a real owner-scoped Strapi backend + unstub its repo, so goals created in the app persist owner-isolated and their progress (evaluated client-side against the now-backed metric entities) survives reload. Also extract the recurring `stripNulls` controller helper to a shared util. After this, the relational-entity roadmap is complete.

## Background / current state

- Domain: `packages/all-of-oyl/src/goal/goal.ts` — `Goal` is a **standalone personal record** (NOT an Entry; no `occurredAt`/`kind`). Fields: `id`(→recordId), `name?`, `metric`(MetricKey string), `target`(positive number), `direction`(`'atLeast'|'atMost'`), `period`(`GoalPeriod` = `'day'|'week'|'month'`), `aggregation`(`AggregateKind` = `'sum'|'avg'|'last'`, default `'sum'`), `emptyPeriods`(`'met'|'skip'`, default `'skip'`), `areaId?`, and a stateful **`pauses`** list — `toJSON` emits `pauses: [{from, to?}]` (DayKey `YYYY-MM-DD` strings; `to` is OMITTED for an open-ended "vacation" pause) only when non-empty. `progressOn(journal, day)` is pure domain logic (no backend concern); `pause`/`resume` mutate in place. `meta?` is repo bookkeeping.
- `collections.ts`: `goals` registered (`classCodec(Goal.fromJSON)`), kind `'personal'`.
- `bootstrap.js`: `PATH_BY_COLLECTION.goals='goals'`. Goal is NOT an Entry → no `ROW_KIND` entry (correct). `BACKED` lacks `goals` → currently `emptyRepo()` (a stub). The app's `goals-store` (`createGoalsStore(repos.goals)`) reads `repos.goals`.
- The `stripNulls` helper is currently duplicated verbatim in `api/measurement/controllers/measurement.ts` and `api/activity-session/controllers/activity-session.ts` — to be extracted here.
- Reusable templates: the owner-scoped `measurement`/`account` `db.query` controller (no component); `strapiRowToShape`; parity + booted owner-scoping harness; `ts:generate-types`→`as const`.

## Architecture

One **owner-scoped (personal)** `goal` content-type — the `measurement`-style `db.query` owner-scoped controller (NO component, NO `documents()`) — with flat scalar columns for the queryable fields and **`pauses` as a `json` column**. Then `BACKED += goals`.

### Why `pauses` is `json` (the one storage decision)

The bulk of Goal is flat scalar columns (relational/queryable, per the TODO preference). `pauses` is irregular bookkeeping state where a repeatable component would be WORSE: an open pause serializes with `to` **omitted**, but a Strapi component would return `to: null`, and `Goal.fromJSON` does `p.to !== undefined ? DayKey.of(p.to) : undefined` → `DayKey.of(null)` would throw. A `json` column round-trips the domain's `{from, to?}` shape **verbatim** (the omitted-`to` open pause stays omitted, no null), and avoids the `documents()`/populate/nested-null machinery — keeping Goal on the simple `db.query` controller.

### G.1 — shared `stripNulls` util (the deferred chore)

Create `apps/strapi-oyl/src/utils/strip-nulls.ts` exporting `stripNulls(row: Record<string, unknown>): Record<string, unknown>` (strict `=== null` drop, preserves `0`/`''`/`false`) — the existing helper verbatim. Refactor `api/measurement/controllers/measurement.ts` and `api/activity-session/controllers/activity-session.ts` to import it and DELETE their local copies (behavior identical; their booted suites must stay green). The new `goal` controller imports it too.

### G.2 — `goal` content-type (owner-scoped, no component)

`apps/strapi-oyl/src/api/goal/...`:
- schema `goal/schema.json`: `recordId`(string,required,unique), `name`(string, optional), `metric`(string), `target`(**float**), `direction`(enumeration `["atLeast","atMost"]`), `period`(enumeration `["day","week","month"]`), `aggregation`(enumeration `["sum","avg","last"]`), `emptyPeriods`(enumeration `["met","skip"]`), `areaId`(string), `pauses`(**json**), `owner`(relation manyToOne `plugin::users-permissions.user`); `info.singularName:"goal"`,`pluralName:"goals"`,`collectionName:"goals"`,`options.draftAndPublish:false`. No creator/visibility, no `kind`/`occurredAt`.
  - `target` is `float` (returns a JS number — NO coercion). The enum fields are validated by the domain on decode anyway; the schema enums add DB-level + admin-UI validity.
- controller `controllers/goal.ts`: clone the `measurement` owner-scoped `db.query` controller (standalone, no component), fields `name`/`metric`/`target`/`direction`/`period`/`aggregation`/`emptyPeriods`/`areaId`/`pauses` (optional ones `?? null` on write). Apply the shared `stripNulls` on every read path (find map, findOne, create, update returns) — drops `name: null`/`areaId: null`/`pauses: null` so `Goal.fromJSON` sees absent (not null). `pauses` is a json field — stored/returned verbatim (db.query returns json automatically). Owner gate exactly like measurement (server-stamped owner, allowlist excludes owner, cross-owner PUT/DELETE 404, 401, upsert-by-recordId). UID `'api::goal.goal' as const`.
- routes `createCoreRouter('api::goal.goal')`; `GOAL_ACTIONS` granted to `authenticated`.
- parity: `kindOf('goals')==='personal'`; schema has `recordId`(req+unique), `metric`, `target`(float), `direction`/`period`/`aggregation`/`emptyPeriods`(enumeration), `areaId`, `pauses`(json), `owner` manyToOne→users, NO creator/visibility, no `kind`/`occurredAt`.
- booted owner-scoping test (model on `measurement.owner-scoping.test.ts`): owner-isolation (A sees / B doesn't; B PUT+DELETE→404; 401 unauth); upsert-by-recordId (one row); decode `Goal.fromJSON(strapiRowToShape(row))` (NOT an Entry — NO kind arg) for: (a) a goal with `pauses: [{from:'2026-03-01', to:'2026-03-05'}]` (closed) → the pause round-trips; (b) a goal with an OPEN pause `pauses: [{from:'2026-03-01'}]` (no `to`) → round-trips with `to` absent (proves the json verbatim handling, no null crash); (c) a goal with NO pauses → round-trips (pauses absent). Assert `metric`/`target`/`direction`/`period`/`aggregation`/`emptyPeriods` survive.

### G.3 — App wiring (`BACKED`) + bootstrap decode test

- `bootstrap.js`: `BACKED += 'goals'` (one line). No other change.
- `bootstrap.test.js`: a Strapi goal row (NO kind — Goal isn't an Entry: `{ id:7, recordId:'<uuid>', name:'Run weekly', metric:'activity.run.minutes', target:100, direction:'atLeast', period:'week', aggregation:'sum', emptyPeriods:'skip', pauses:[{from:'2026-03-01',to:'2026-03-05'}] }`) → `repos.goals.list()` returns a `Goal` with the fields + the pause, `id===recordId`. (No coercion — `target` is a number; no kind injection — Goal isn't an Entry.) `repos.goals` is now a real server repo (a `save` enqueues to the outbox), no longer a stub. (No journal-store routing — Goal is not a journal Entry; the existing `goals-store` over `repos.goals` simply starts hitting the backend.)
- No app-UI rework.

## Decisions & non-goals

- **`pauses` = `json`** (irregular bookkeeping; verbatim `{from, to?}` round-trip; avoids the open-pause `to: null` crash a component would cause; keeps the controller on `db.query`). The rest of Goal is flat relational columns.
- **`target` = `float`** (no coercion). **`direction`/`period`/`aggregation`/`emptyPeriods` = enumerations** (known small sets; DB + admin validity; domain re-validates on decode). **`metric`/`areaId` = strings** (domain-validated).
- **Goal is a standalone personal record** (NOT an Entry) → no `ROW_KIND`/kind injection (decode with no kind); no journal-store routing.
- **`stripNulls` extracted to a shared util** (the recurring chore), used by measurement + activity-session + goal.
- **pause/resume persistence:** mutations re-save the whole goal (upsert-by-recordId); `pauses` json carries the canonical merged ranges.
- **Clean break, no migration** (repo was a stub; the fixture seed already produces goals).

## Deferred

A goals UI / progress dashboards (Sub-project D); `User Goal` sharing semantics (sub-project sharing/grants already exist in the domain — out of scope here); the remaining non-entity personal collections (`users`, vault, plans/dayPlans) — separate future work.

## Reuse of existing infrastructure

The `measurement`/`account` owner-scoped `db.query` controller template; `strapiRowToShape`; parity + booted owner-scoping harness; `ts:generate-types`→`as const`; bootstrap `BACKED`/`PATH`.

## Manual acceptance

Backend + app (fresh DB), signed in: create a goal (e.g. `activity.run.minutes`, target 100, atLeast, week) → it flushes to `/api/goals`, persists owner-isolated, reads back; pause it for a date range, reload → the pause survives; confirm a second user does not see the first user's goals.
