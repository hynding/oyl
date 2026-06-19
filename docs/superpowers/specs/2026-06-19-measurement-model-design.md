# Measurement Model (Sub-project B-Tracking) — Design

**Status:** approved (design) — 2026-06-19
**Predecessors:** B1 nutrition, finance (both merged); sub-project A online-first data layer.
**Roadmap source:** root `TODO.md` (relational entity backends). Completes the stubbed `measurements` per-kind repo.

## Goal

Give the `Measurement` domain entity a real owner-scoped Strapi backend + unstub its per-kind repo, so measurements logged in the app flush to the backend and persist owner-isolated. The simplest of the relational-backend sub-projects: one content-type, no component, no Money, no app-UI rework.

## Background / current state

- Domain: `packages/all-of-oyl/src/track/measurement.ts` — `Measurement extends Entry` (kind `measurement`): base (`id`→recordId, `occurredAt`, `note?`) + `metric` (a `MetricKey` — branded string; domain-validated: 2+ dot-joined `[a-z0-9_]+` segments, and the namespace must be one of `MEASUREMENT_NAMESPACES = ['body','sleep','mood','screen','home','custom']` — entry-owned namespaces like `activity`/`nutrition`/`finance`/`note` are rejected `RESERVED_NAMESPACE`) + `value` (finite `number`). `toJSON`: base + `metric` + `value`.
- `collections.ts`: `measurements` registered (`classCodec(Measurement.fromJSON)`), kind `'personal'`.
- `apps/vanilla-oyl/src/storage/bootstrap.js`: `PATH_BY_COLLECTION.measurements='measurements'` and `ROW_KIND_BY_COLLECTION.measurements='measurement'` are ALREADY wired; only `BACKED` lacks `measurements` → it currently resolves to `emptyRepo()`.
- No dedicated tracking store/component: measurements surface in the Journal day-list (the journal-store routes a `Measurement`, kind `measurement`, to `reposByKind['measurement']`). So no app-UI rework — backing the repo is enough.
- Reusable templates: the owner-scoped `note`/`account` `db.query` controller; `strapiRowToShape` + `ROW_KIND`; the parity + booted owner-scoping test harness; `ts:generate-types`→`as const`.

## Architecture

One **owner-scoped (personal)** `measurement` content-type — the `note`/`account` `db.query` owner-scoped controller (NO component, NO `documents()`/populate/sanitize machinery) — then `BACKED += measurements`. The same owner-scoping security matrix as note/account/transaction.

### T.1 — `measurement` content-type (owner-scoped, no component)

`apps/strapi-oyl/src/api/measurement/...`:
- schema: `recordId`(string,required,unique), `occurredAt`(datetime,required), `note`(string), `metric`(string), `value`(**float**), `owner`(relation manyToOne `plugin::users-permissions.user`); `info.singularName:"measurement"`,`pluralName:"measurements"`,`collectionName:"measurements"`,`draftAndPublish:false`. No creator/visibility, no `kind` column.
  - **`value` is `float`** (NOT `decimal`): Strapi `float` returns a JS number on BOTH SQLite and Postgres, so NO string→number coercion is needed (unlike money's `biginteger`/`decimal`). Measurement values (weights, hours, scores, kWh) need no money-grade exactness — float (double) precision is ample. This is why measurement needs no sanitize util.
  - `metric` is a plain string; the domain validates the namespace/format on decode (the backend trusts validated wire data, same posture as `category`/`slug`).
- controller: clone the owner-scoped `note` controller (an Entry with `occurredAt`), swapping `text`/`tags` for `metric`/`value` (`note` optional → `?? null`). Every read/write filters `owner:{id:owner}`; `owner` server-stamped (never from client body); PUT upsert-by-`recordId` (find `{recordId,owner}`→update; else `{recordId}` claimed by anyone→404; else create); `delete` owner-scoped→404; 401 unauth. `db.query` returns scalar fields automatically (no populate). UID `'api::measurement.measurement' as const` (run `strapi ts:generate-types` first; commit regenerated types).
- routes `createCoreRouter('api::measurement.measurement')`; `MEASUREMENT_ACTIONS` granted to `authenticated`.
- parity: `kindOf('measurements')==='personal'`; schema has `recordId`(req+unique), `occurredAt`, `metric`, `value`(float), `owner` manyToOne→users, NO creator/visibility, no `kind` column.
- booted owner-scoping test (model on `note.owner-scoping.test.ts`): owner-isolation (A sees / B doesn't; B PUT+DELETE→404; 401 unauth); upsert-by-recordId (one row); decode `Measurement.fromJSON(strapiRowToShape(row,{kind:'measurement'}))` (it's an Entry — inject kind) → `metric`(e.g. `body.weight_kg`)/`value`(e.g. `82.5`) survive. Use a valid measurement-namespace metric (the domain rejects entry-owned namespaces).

### T.2 — App wiring (`BACKED`) + bootstrap decode test + journal routing

- `bootstrap.js`: `BACKED += 'measurements'` (one line). No other change (PATH + ROW_KIND already present).
- `bootstrap.test.js`: a kind-less Strapi measurement row (`{ id, recordId:<uuid>, occurredAt, metric:'body.weight_kg', value:82.5 }`) → `repos.measurements.list()` returns a `Measurement` with `metric`/`value` and `id===recordId` — proving `ROW_KIND='measurement'` injection through the real BACKED repo. (No coercion concern — `value` is a number.) `repos.measurements` is now a real server repo (a `save` enqueues to the outbox), no longer a stub; update the "stub repos" test so only `activitySessions` remains a stub.
- journal-store test: logging a `Measurement` enqueues to `reposByKind['measurement']` specifically (other kind repos stay empty).
- No app-UI rework.

## Decisions & non-goals

- **`value` = `float`** (returns a JS number on both DBs — no coercion). No sanitize util.
- **`metric` = plain string**, domain-validated on decode (namespace must be a measurement namespace; entry-owned namespaces rejected).
- **Owner-scoped (personal)**, Entry (`ROW_KIND='measurement'` already wired); no component.
- **Clean break, no migration** (the repo was a stub; the fixture seed already produces measurements in the per-kind seed array).

## Deferred

A dedicated measurement-logging UI (Sub-project D); custom-metric management/curation; the `activitySessions` backend (the last remaining stub) and the `Goal` backend — each its own future sub-project.

## Reuse of existing infrastructure

`note`/`account` owner-scoped `db.query` controller template; `strapiRowToShape` + the already-wired `ROW_KIND`/`PATH` maps; parity + booted owner-scoping harness; `ts:generate-types`→`as const`; the per-kind journal-store routing + bootstrap `BACKED`.

## Manual acceptance

Backend + app (fresh DB), signed in: log a measurement (e.g. `body.weight_kg = 82.5`) → it flushes to `/api/measurements`, persists owner-isolated, and reads back; confirm a second user does not see the first user's measurements.
