# Activity Session Model (Sub-project B-Activity) — Design

**Status:** approved (design) — 2026-06-19
**Predecessors:** nutrition, finance, measurement (all merged); sub-project A online-first layer.
**Roadmap source:** root `TODO.md` ("User Activity"). Completes the LAST stubbed per-kind repo (`activitySessions`).

## Goal

Give `ActivitySession` a real owner-scoped Strapi backend + unstub its per-kind repo, so logged activity sessions flush to the backend and persist owner-isolated. After this, **no per-kind repo remains stubbed**. The `Activity` catalog already exists from sub-project A.

## Background / current state

- Domain: `packages/all-of-oyl/src/activity/activity-session.ts` — `ActivitySession extends Entry` (kind `activity-session`): base (`id`→recordId, `occurredAt`, `note?`) + `activityId` (Id string) + `slug` (the activity's slug, snapshotted at log time — catalog edits never rewrite history) + `quantities` (readonly `Quantity[]`). `metrics()` emits `activity.<slug>.count` = 1 plus `activity.<slug>.<unit>` per quantity (domain logic; no backend concern). `toJSON`: base + `activityId` + `slug` + (`quantities` only when non-empty).
- `Quantity` (`core/quantity.ts`): `{amount: number, unit: string}` (amount finite; unit non-empty, not `'count'`). `Quantity.fromJSON` reads ONLY `amount`/`unit` (requires `amount` to be a number) and ignores extra keys — so a Strapi component's nested `id` is harmlessly ignored.
- `collections.ts`: `activitySessions` registered (`classCodec(ActivitySession.fromJSON)`), kind `'personal'`.
- `apps/vanilla-oyl/src/storage/bootstrap.js`: `PATH_BY_COLLECTION.activitySessions='activity-sessions'` and `ROW_KIND_BY_COLLECTION.activitySessions='activity-session'` are ALREADY wired; `BACKED` lacks `activitySessions` → currently `emptyRepo()` (the LAST stub).
- Reusable templates: the consumption controller (owner-scoped `documents()` + component populate + `stripNulls`); the measurement `stripNulls` helper; `strapiRowToShape` + `ROW_KIND`; parity + booted owner-scoping harness; `ts:generate-types`→`as const`.

## Architecture

One **owner-scoped (personal)** `activity-session` content-type (Entry) carrying a **repeatable `activity.quantity` component**, then `BACKED += activitySessions`. Because it has a repeatable component, the controller is the **consumption-style `documents()`** pattern (NOT the plain `db.query` one): populate the quantities + `stripNulls` on read. `amount` is `float` (returns a JS number — NO coercion util, unlike money's biginteger).

### A.1 — `activity.quantity` component + `activity-session` content-type

`apps/strapi-oyl/src/components/activity/quantity.json` (repeatable sub-component):
- `amount`: `{ "type": "float" }`, `unit`: `{ "type": "string" }`. Mirrors domain `Quantity`. `collectionName: "components_activity_quantities"`.

`apps/strapi-oyl/src/api/activity-session/...`:
- schema `activity-session/schema.json`: `recordId`(string,required,unique), `occurredAt`(datetime,required), `note`(string), `activityId`(string — plain domain id, NOT a relation, like `areaId`/`accountId`), `slug`(string), `quantities`(`{ "type": "component", "repeatable": true, "component": "activity.quantity" }`), `owner`(relation manyToOne `plugin::users-permissions.user`); `info.singularName:"activity-session"`,`pluralName:"activity-sessions"`,`collectionName:"activity_sessions"`,`options.draftAndPublish:false`. No creator/visibility, no `kind` column.
- controller `controllers/activity-session.ts`: clone the consumption owner-scoped `documents()` controller — owner gate (server-stamped, allowlist excludes owner, cross-owner PUT/DELETE 404, 401, upsert-by-recordId). Reads populate `{ quantities: true }` and return through a `stripNulls`-style helper that drops top-level `null`s (so `note: null` doesn't break `parseEntryBase`, and an empty `quantities: null` becomes absent → the domain treats it as no quantities). Store `quantities`/`activityId`/`slug` verbatim. `amount` is a number (float) — NO coercion. UID `'api::activity-session.activity-session' as const`.
- routes `createCoreRouter('api::activity-session.activity-session')`; `ACTIVITY_SESSION_ACTIONS` granted to `authenticated`.
- parity: `kindOf('activitySessions')==='personal'`; schema has `recordId`(req+unique), `occurredAt`, `activityId`, `slug`, `quantities`→component `activity.quantity`(repeatable), `owner` manyToOne→users, NO creator/visibility, no `kind` column.
- booted owner-scoping test (model on `consumption.owner-scoping.test.ts`): owner-isolation (A sees / B doesn't; B PUT+DELETE→404; 401 unauth); upsert-by-recordId (one row); decode `ActivitySession.fromJSON(strapiRowToShape(row,{kind:'activity-session'}))` (Entry — inject kind) → `activityId`/`slug`/`quantities` survive for a session with TWO quantities (e.g. `{amount:30,unit:'minutes'}` + `{amount:5,unit:'km'}`); a session with NO quantities also round-trips (empty/absent). Use a valid `slug` + non-`count` units.

### A.2 — App wiring (`BACKED`) + bootstrap decode test + journal routing

- `bootstrap.js`: `BACKED += 'activitySessions'` (one line). No other change (PATH + ROW_KIND already present).
- `bootstrap.test.js`: a kind-less Strapi activity-session row (`{ id, recordId:<uuid>, occurredAt, activityId:<uuid>, slug:'run', quantities:[{amount:30,unit:'minutes'},{amount:5,unit:'km'}] }`) → `repos.activitySessions.list()` returns an `ActivitySession` with `activityId`/`slug`/`quantities` and `id===recordId` — proving `ROW_KIND='activity-session'` injection through the real BACKED repo. (No coercion — amounts are numbers.) `repos.activitySessions` is now a real server repo (a `save` enqueues to the outbox), no longer a stub. **Update the "stub repos" test: NO collections remain stubbed** — replace it with an assertion appropriate to "all per-kind repos backed" (or remove the stub-specific case and confirm every personal repo enqueues on save).
- journal-store test: logging an `ActivitySession` enqueues to `reposByKind['activity-session']` specifically (other kind repos stay empty).
- No app-UI rework.

## Decisions & non-goals

- **`quantities` = repeatable `activity.quantity` component** (NOT json): honors the TODO "less JSON, more relational" intent, mirrors domain `Quantity`, round-trips verbatim (component id ignored by `Quantity.fromJSON`).
- **`amount` = `float`** (returns a JS number on both DBs — no coercion; no sanitize util beyond null-stripping).
- **`activityId`/`slug` = plain strings** (domain-validated on decode; `slug` is the log-time snapshot — no FK to the Activity catalog by design).
- **Owner-scoped (personal)**, Entry (`ROW_KIND='activity-session'` already wired).
- **`stripNulls`** handles `note: null` (parseEntryBase) + empty `quantities: null`.
- **Clean break, no migration** (repo was a stub; the fixture seed already produces activity sessions in the per-kind seed array).

## Deferred

An activity-logging UI + activity metric dashboards (Sub-project D); custom-activity curation (B3 catalog policy); the `Goal` backend (the next/last relational sub-project — progress is evaluated against the journal across all these metric entities).

## Reuse of existing infrastructure

The consumption owner-scoped `documents()`+component+`stripNulls` controller template; `strapiRowToShape` + already-wired `ROW_KIND`/`PATH`; parity + booted owner-scoping harness; `ts:generate-types`→`as const`; per-kind journal routing + bootstrap `BACKED`.

## Manual acceptance

Backend + app (fresh DB), signed in: log an activity session (e.g. `slug:'run'`, `30 minutes` + `5 km`) → it flushes to `/api/activity-sessions`, persists owner-isolated, reads back with its quantities; confirm a second user does not see the first user's sessions. Confirm no per-kind repo is stubbed any more.
