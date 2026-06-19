# Measurement Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Measurement` a real owner-scoped Strapi backend + unstub its per-kind repo, so logged measurements flush to the backend and persist owner-isolated. No app-UI rework.

**Architecture:** one owner-scoped `measurement` content-type (the `note`/`account` `db.query` template + `metric`/`value` fields, `value` as Strapi `float` → no coercion), then `BACKED += measurements`. Reuses the established owner-scoping + parity + booted-test patterns.

**Tech Stack:** Strapi 5 (TS), `@oyl/all-of-oyl`, vanilla-oyl (JSDoc), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-measurement-model-design.md`

## Global Constraints

- **Owner-scoped security:** every read/write filters `owner:{id:owner}`; `owner` server-stamped and NEVER read from the client body; PUT upserts by `recordId` (find `{recordId,owner}`→update; else `{recordId}` claimed by anyone→404; else create); `delete` owner-scoped→404; 401 unauthenticated. Client never sees Strapi's numeric id.
- **`value` is Strapi `float`** (returns a JS number on both SQLite + Postgres — no coercion). **`metric` is a plain string** (the domain validates the namespace/format on decode — `MEASUREMENT_NAMESPACES = body|sleep|mood|screen|home|custom`; entry-owned namespaces are rejected). No `kind` column (Entry `kind='measurement'` is injected on read via the already-wired `ROW_KIND_BY_COLLECTION`).
- **Strapi typegen:** after creating the content-type run `strapi ts:generate-types` (NOT just `strapi build`), commit the regenerated `types/generated/*.d.ts`, then use `as const`.
- **DoD (backend task):** `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`, all green. Commit on the current branch; never branch. `git add` ONLY changed source/test files + regenerated types — never `git add -A`/`.`.
- Tests assert observable HTTP behavior + decoded domain content; no assert-nothing tests; no weakened rules.

---

### Task 1: `measurement` content-type (owner-scoped, no component)

**Files:**
- Create: `apps/strapi-oyl/src/api/measurement/content-types/measurement/schema.json`, `controllers/measurement.ts`, `routes/measurement.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`, `types/generated/*.d.ts` (via `ts:generate-types`)
- Test: `apps/strapi-oyl/test/measurement.owner-scoping.test.ts`

**Interfaces — Produces:** owner-scoped `measurement` content-type. Consumes: the `note` owner-scoped `db.query` controller (`apps/strapi-oyl/src/api/note/controllers/note.ts`) — clone it, swapping `text`/`tags` for `metric`/`value`. Domain: `Measurement.toJSON`/`fromJSON` (`packages/all-of-oyl/src/track/measurement.ts`): base(`id`→recordId, `occurredAt`, `note?`) + `metric`(string) + `value`(number).

- [ ] **Step 1: Failing test** — `measurement.owner-scoping.test.ts` (model on `note.owner-scoping.test.ts`): unauthenticated→401/403; A PUTs `/measurements/<recordId>` (UUID) `{occurredAt:'…ISO…', metric:'body.weight_kg', value:82.5}` → A sees it, B's list excludes it; B's PUT and DELETE to that recordId→404; a 2nd PUT by A upserts (list shows ONE); decode `Measurement.fromJSON(strapiRowToShape(row,{kind:'measurement'}))` (import both from `@oyl/all-of-oyl`) → `metric==='body.weight_kg'` and `value===82.5` survive. Parity: `kindOf('measurements')==='personal'`; schema has `recordId`(req+unique), `occurredAt`, `metric`, `value`(float), `owner` manyToOne→users, NO creator/visibility, no `kind` column.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — schema (`value`: `{ "type": "float" }`; `metric`: string; `occurredAt`: datetime required; `info.singularName:"measurement"`,`pluralName:"measurements"`,`collectionName:"measurements"`,`draftAndPublish:false`); controller = `note`'s owner-scoped `db.query` controller with fields `occurredAt`/`note`(?? null)/`metric`/`value`, UID `'api::measurement.measurement' as const`; routes `createCoreRouter('api::measurement.measurement')`; `MEASUREMENT_ACTIONS` granted to `authenticated` in `index.ts`; parity assertions. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped measurement content-type`.

---

### Task 2: App wiring (`BACKED`) + bootstrap decode test + journal routing

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/bootstrap.js` (`BACKED`)
- Modify/Test: `apps/vanilla-oyl/src/storage/bootstrap.test.js`; `apps/vanilla-oyl/src/state/journal-store.test.js` (per-kind routing)

**Interfaces — Consumes:** `repos.measurements` (now a real BACKED server repo), the journal-store's `measurement`-kind routing.

- [ ] **Step 1: Failing test** —
  - `bootstrap.test.js`: a kind-less Strapi measurement row (`{ id:7, recordId:'<uuid>', occurredAt:'2026-06-10T16:00:00.000Z', metric:'body.weight_kg', value:82.5 }`) → `repos.measurements.list()` returns one `Measurement` whose `id===recordId`, `metric==='body.weight_kg'`, `value===82.5` — proving `ROW_KIND='measurement'` injection through the real BACKED repo. Also assert `repos.measurements` is a real server repo (a `save` enqueues to the outbox), no longer a stub. Update the existing "stub repos" test so it no longer lists `measurements` (only `activitySessions` remains a stub).
  - `journal-store.test.js`: logging a `Measurement` via the store enqueues to `reposByKind['measurement']` specifically (the other kind repos — note/consumption/transaction/activity-session — stay empty). Use a valid measurement metric (e.g. `new Measurement({ occurredAt:new Date(), metric:'body.weight_kg', value:82.5 })`).
- [ ] **Step 2: Run, verify fail** — `pnpm vanilla test bootstrap` (the decode/real-repo assertions fail while `measurements` is stubbed).
- [ ] **Step 3: Implement** — `bootstrap.js`: `BACKED = new Set([… 'notes','consumptions','accounts','transactions','budgets','measurements'])`. Add/adjust the tests above.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): back the measurements repo (per-kind tracking wiring)`.

---

## Manual acceptance (after Task 2)

Backend + app (fresh DB), signed in: log a measurement (`body.weight_kg = 82.5`) → flushes to `/api/measurements`, persists owner-isolated, reads back. Confirm a second user sees none of the first user's measurements.

## Self-review (coverage map)

- Spec T.1 (content-type) → T1. T.2 (wiring + tests) → T2.
- Reuse: `note` controller = the measurement owner-scoped template; `strapiRowToShape` + already-wired `ROW_KIND`/`PATH`; parity + booted-test harness; `ts:generate-types`→`as const`; per-kind journal routing + bootstrap `BACKED`.
- `value` float ⇒ no sanitize util (unlike finance/nutrition). `metric` validated domain-side.
- Deferred (per spec): measurement-logging UI; custom-metric curation; `activitySessions` + `Goal` backends (future sub-projects).
