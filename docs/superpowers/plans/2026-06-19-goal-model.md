# Goal Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `Goal` a real owner-scoped Strapi backend (`pauses` as json) + unstub its repo — the last relational entity. Also extract the duplicated `stripNulls` helper to a shared util. No app-UI rework.

**Architecture:** one owner-scoped `goal` content-type (the `measurement`-style `db.query` template — flat scalar columns + `pauses` json, no component), then `BACKED += goals`. Reuses the owner-scoping + parity + booted-test patterns.

**Tech Stack:** Strapi 5 (TS), `@oyl/all-of-oyl`, vanilla-oyl (JSDoc), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-goal-model-design.md`

## Global Constraints

- **Owner-scoped security:** every read/write filters `owner:{id:owner}`; `owner` server-stamped and NEVER read from the client body; PUT upserts by `recordId` (find `{recordId,owner}`→update; else `{recordId}` claimed by anyone→404; else create); `delete` owner-scoped→404; 401 unauthenticated. Client never sees Strapi's numeric id.
- **Goal is a standalone personal record (NOT an Entry)** → decode with `strapiRowToShape(row)` (NO kind); no `ROW_KIND`/journal routing. `target` is Strapi `float` (a JS number — no coercion). `pauses` is a `json` column (verbatim `{from, to?}` array — the open-pause `to` stays omitted, no null). `direction`/`period`/`aggregation`/`emptyPeriods` are enumerations; `metric`/`areaId` strings. The shared `stripNulls` drops top-level `null`s (`name`/`areaId`/`pauses`) so `Goal.fromJSON` sees absent, not null.
- **Strapi typegen:** after creating the content-type run `strapi ts:generate-types` (NOT just `strapi build`), commit the regenerated `types/generated/*.d.ts`, then use `as const`.
- **DoD (backend task):** `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`, all green. Commit on the current branch; never branch. `git add` ONLY changed source/test files + regenerated types — never `git add -A`/`.`.
- Tests assert observable HTTP behavior + decoded domain content; no assert-nothing tests; no weakened rules.

---

### Task 1: shared `stripNulls` util + `goal` content-type (owner-scoped, no component)

**Files:**
- Create: `apps/strapi-oyl/src/utils/strip-nulls.ts`
- Modify: `apps/strapi-oyl/src/api/measurement/controllers/measurement.ts`, `apps/strapi-oyl/src/api/activity-session/controllers/activity-session.ts` (import the shared `stripNulls`, delete local copies)
- Create: `apps/strapi-oyl/src/api/goal/content-types/goal/schema.json`, `controllers/goal.ts`, `routes/goal.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`, `types/generated/*.d.ts` (via `ts:generate-types`)
- Test: `apps/strapi-oyl/test/goal.owner-scoping.test.ts`

**Interfaces — Produces:** `stripNulls` shared util; owner-scoped `goal` content-type. Consumes: the `measurement` owner-scoped `db.query` controller (`apps/strapi-oyl/src/api/measurement/controllers/measurement.ts`) — clone it (standalone, no occurredAt/component) with the Goal fields. Domain: `Goal.toJSON`/`fromJSON` (`packages/all-of-oyl/src/goal/goal.ts`): `{id, name?, metric, target, direction, period, aggregation, emptyPeriods, areaId?, pauses?}` where `pauses` = `[{from, to?}]` (DayKey strings; `to` omitted for open pauses).

- [ ] **Step 1: Failing test** — `goal.owner-scoping.test.ts` (model on `measurement.owner-scoping.test.ts`): unauthenticated→401/403; A PUTs `/goals/<recordId>` (UUID) `{name:'Run weekly', metric:'activity.run.minutes', target:100, direction:'atLeast', period:'week', aggregation:'sum', emptyPeriods:'skip'}` → A sees it, B's list excludes it; B's PUT and DELETE→404; a 2nd PUT by A upserts (ONE row); decode `Goal.fromJSON(strapiRowToShape(row))` (NO kind — import both from `@oyl/all-of-oyl`) → `metric`/`target`(100)/`direction`/`period`/`aggregation`/`emptyPeriods` survive. Plus pause round-trips: (a) `pauses:[{from:'2026-03-01',to:'2026-03-05'}]` → `goal.pauses` has the closed range; (b) `pauses:[{from:'2026-03-01'}]` (OPEN, no `to`) → round-trips with the open range (`to` undefined — no crash); (c) no `pauses` → round-trips with none. Parity: `kindOf('goals')==='personal'`; schema has `recordId`(req+unique), `metric`, `target`(float), `direction`/`period`/`aggregation`/`emptyPeriods`(enumeration), `areaId`, `pauses`(json), `owner` manyToOne→users, NO creator/visibility, no `kind`/`occurredAt`.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** —
  - `strip-nulls.ts`: `export function stripNulls(row)` (strict `=== null` drop; verbatim from the existing measurement/activity-session copies). Refactor both controllers to import it, delete their local copies (behavior identical — their booted suites must stay green).
  - `goal/schema.json`: `target`: `{type:float}`; `direction`/`period`/`aggregation`/`emptyPeriods`: `{type:enumeration, enum:[…]}` with the values `["atLeast","atMost"]`/`["day","week","month"]`/`["sum","avg","last"]`/`["met","skip"]`; `metric`/`areaId`: string; `pauses`: `{type:json}`; `name`: string (optional); `info.singularName:"goal"`,`pluralName:"goals"`,`collectionName:"goals"`,`draftAndPublish:false`.
  - `goal/controllers/goal.ts`: measurement-clone owner-scoped `db.query` controller, fields `name`/`metric`/`target`/`direction`/`period`/`aggregation`/`emptyPeriods`/`areaId`/`pauses` (optionals `?? null`), `stripNulls` (imported) on every read path, UID `'api::goal.goal' as const`.
  - `routes`; `GOAL_ACTIONS` granted in `index.ts`; parity assertions. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped goal content-type + shared stripNulls util`.

---

### Task 2: App wiring (`BACKED`) + bootstrap decode test

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/bootstrap.js` (`BACKED`)
- Modify/Test: `apps/vanilla-oyl/src/storage/bootstrap.test.js`

**Interfaces — Consumes:** `repos.goals` (now a real BACKED server repo), the existing `goals-store`.

- [ ] **Step 1: Failing test** — `bootstrap.test.js`: a Strapi goal row (NO kind — Goal isn't an Entry: `{ id:7, recordId:'<uuid>', name:'Run weekly', metric:'activity.run.minutes', target:100, direction:'atLeast', period:'week', aggregation:'sum', emptyPeriods:'skip', pauses:[{from:'2026-03-01',to:'2026-03-05'}] }`) → `repos.goals.list()` returns one `Goal` whose `id===recordId`, `metric==='activity.run.minutes'`, `target===100`, and `pauses` has the closed range — proving the decode through the real BACKED repo (no kind injection — Goal is standalone; no coercion — target is a number). Also assert `repos.goals` is a real server repo (a `save` enqueues to the outbox; build a valid `new Goal({ metric:'activity.run.minutes', target:100, direction:'atLeast', period:'week' })` — import `Goal` from `@oyl/all-of-oyl`), no longer a stub. (No journal-store routing change — Goal is not a journal Entry.)
- [ ] **Step 2: Run, verify fail** — `pnpm vanilla test bootstrap`.
- [ ] **Step 3: Implement** — `bootstrap.js`: add `'goals'` to the `BACKED` set. Add the tests above.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): back the goals repo`.

---

## Manual acceptance (after Task 2)

Backend + app (fresh DB), signed in: create a goal (`activity.run.minutes`, target 100, atLeast, week) → flushes to `/api/goals`, persists owner-isolated, reads back; pause it, reload → the pause survives. Confirm a second user sees none of the first user's goals.

## Self-review (coverage map)

- Spec G.1 (shared stripNulls) + G.2 (goal content-type) → T1. G.3 (wiring) → T2.
- Reuse: `measurement` controller = the goal owner-scoped `db.query` template; `strapiRowToShape` (no kind — Goal isn't an Entry); parity + booted harness; `ts:generate-types`→`as const`; bootstrap `BACKED`.
- `pauses` json ⇒ verbatim round-trip (open pause `to` omitted, no null) + simple `db.query` controller. `target` float ⇒ no coercion. `stripNulls` now shared (measurement + activity-session + goal).
- After T2, the relational-entity roadmap (`TODO.md`) is COMPLETE. Deferred (per spec): goals UI; User Goal sharing; non-entity personal collections (users/vault/plans).
