# Activity Session Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ActivitySession` a real owner-scoped Strapi backend (with a repeatable quantity component) + unstub its per-kind repo — the LAST stub. No app-UI rework.

**Architecture:** one owner-scoped `activity-session` content-type (Entry) + a repeatable `activity.quantity` component; consumption-style `documents()` controller (populate quantities + `stripNulls`); `amount` is `float` (no coercion). Then `BACKED += activitySessions`.

**Tech Stack:** Strapi 5 (TS), `@oyl/all-of-oyl`, vanilla-oyl (JSDoc), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-activity-session-model-design.md`

## Global Constraints

- **Owner-scoped security:** every read/write filters `owner:{id:owner}`; `owner` server-stamped and NEVER read from the client body; PUT upserts by `recordId` (find `{recordId,owner}`→update; else `{recordId}` claimed by anyone→404; else create); `delete` owner-scoped→404; 401 unauthenticated. Client never sees Strapi's numeric id.
- **`quantities` = repeatable `activity.quantity` component** (`amount`:float, `unit`:string) — stored verbatim (mirrors domain `Quantity`; `Quantity.fromJSON` ignores the component id). `amount` is `float` → a JS number (NO coercion). A `stripNulls` on read drops `note: null` (else `parseEntryBase` throws) and an empty `quantities: null`. `activityId`/`slug` are plain strings. No `kind` column (Entry `kind='activity-session'` injected on read via the already-wired `ROW_KIND`).
- **Strapi typegen:** after creating the content-type/component run `strapi ts:generate-types` (NOT just `strapi build`), commit the regenerated `types/generated/*.d.ts`, then use `as const`.
- **DoD (backend task):** `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`, all green. Commit on the current branch; never branch. `git add` ONLY changed source/test files + regenerated types — never `git add -A`/`.`.
- Tests assert observable HTTP behavior + decoded domain content; no assert-nothing tests; no weakened rules.

---

### Task 1: `activity.quantity` component + `activity-session` content-type (owner-scoped, repeatable component)

**Files:**
- Create: `apps/strapi-oyl/src/components/activity/quantity.json`
- Create: `apps/strapi-oyl/src/api/activity-session/content-types/activity-session/schema.json`, `controllers/activity-session.ts`, `routes/activity-session.ts`
- Modify: `apps/strapi-oyl/src/index.ts` (grant), `apps/strapi-oyl/test/parity.test.ts`, `types/generated/*.d.ts` (via `ts:generate-types`)
- Test: `apps/strapi-oyl/test/activity-session.owner-scoping.test.ts`

**Interfaces — Produces:** owner-scoped `activity-session` content-type + `activity.quantity` component. Consumes: the consumption owner-scoped `documents()` controller (`apps/strapi-oyl/src/api/consumption/controllers/consumption.ts`) — clone its owner gate + `documents()`/populate/stripNulls structure, swapping the `nutrients` component for the repeatable `quantities` component and adding `activityId`/`slug`. Domain: `ActivitySession.toJSON`/`fromJSON` (`packages/all-of-oyl/src/activity/activity-session.ts`): base(`id`→recordId, `occurredAt`, `note?`) + `activityId`(string) + `slug`(string) + `quantities`(`{amount,unit}[]`, omitted when empty).

- [ ] **Step 1: Failing test** — `activity-session.owner-scoping.test.ts` (model on `consumption.owner-scoping.test.ts`): unauthenticated→401/403; A PUTs `/activity-sessions/<recordId>` (UUID) `{occurredAt:'…ISO…', activityId:<uuid>, slug:'run', quantities:[{amount:30,unit:'minutes'},{amount:5,unit:'km'}]}` → A sees it, B's list excludes it; B's PUT and DELETE to that recordId→404; a 2nd PUT by A upserts (list shows ONE); decode `ActivitySession.fromJSON(strapiRowToShape(row,{kind:'activity-session'}))` (import both from `@oyl/all-of-oyl`) → `activityId`/`slug` survive and `quantities` has the two `{amount,unit}` entries (amounts are numbers); a session with NO `quantities` also round-trips. Parity: `kindOf('activitySessions')==='personal'`; schema has `recordId`(req+unique), `occurredAt`, `activityId`, `slug`, `quantities`→component `activity.quantity`(repeatable), `owner` manyToOne→users, NO creator/visibility, no `kind` column.
- [ ] **Step 2: Build + run, verify fail.**
- [ ] **Step 3: Implement** — `quantity.json` (`amount`:float, `unit`:string, `collectionName:"components_activity_quantities"`); `activity-session/schema.json` (`quantities`: `{type:component, repeatable:true, component:"activity.quantity"}`; `activityId`/`slug` string; `occurredAt` datetime required); controller = consumption-clone (owner gate + `documents()`, populate `{ quantities: true }`, a stripNulls helper on every read path dropping top-level nulls incl. `quantities:null`, fields `occurredAt`/`note`(?? null)/`activityId`/`slug`/`quantities`), UID `'api::activity-session.activity-session' as const`; routes `createCoreRouter('api::activity-session.activity-session')`; `ACTIVITY_SESSION_ACTIONS` granted in `index.ts`; parity. Run `strapi ts:generate-types`, commit regenerated types.
- [ ] **Step 4: Run, verify pass** — `strapi ts:generate-types` → `strapi build` → `tsc --noEmit` → `pnpm --filter @oyl/strapi-oyl-app test`.
- [ ] **Step 5: Commit** — `feat(strapi-oyl): owner-scoped activity-session content-type (repeatable quantity component)`.

---

### Task 2: App wiring (`BACKED`) + bootstrap decode test + journal routing — the LAST stub

**Files:**
- Modify: `apps/vanilla-oyl/src/storage/bootstrap.js` (`BACKED`)
- Modify/Test: `apps/vanilla-oyl/src/storage/bootstrap.test.js`; `apps/vanilla-oyl/src/state/journal-store.test.js`

**Interfaces — Consumes:** `repos.activitySessions` (now a real BACKED server repo), the journal-store's `activity-session`-kind routing.

- [ ] **Step 1: Failing test** —
  - `bootstrap.test.js`: a kind-less Strapi activity-session row (`{ id:7, recordId:'<uuid>', occurredAt:'2026-06-10T16:00:00.000Z', activityId:'<uuid>', slug:'run', quantities:[{amount:30,unit:'minutes'},{amount:5,unit:'km'}] }`) → `repos.activitySessions.list()` returns one `ActivitySession` whose `id===recordId`, `slug==='run'`, `quantities` has 2 entries with numeric amounts — proving `ROW_KIND='activity-session'` injection through the real BACKED repo. Assert `repos.activitySessions` is a real server repo (a `save` enqueues to the outbox), no longer a stub. **Update the existing "stub repos" test: there are now NO stubbed per-kind repos** — replace/remove the stub case so it no longer references `activitySessions` (and confirm every personal repo enqueues on save, or drop the stub-specific test if nothing remains stubbed).
  - `journal-store.test.js`: logging an `ActivitySession` via the store enqueues to `reposByKind['activity-session']` specifically (the other kind repos — note/consumption/transaction/measurement — stay empty). Use `new ActivitySession({ occurredAt:new Date(), activity:{ id:Id.create(), slug:'run' }, quantities:[Quantity.of(30,'minutes')] })` (import `ActivitySession`/`Quantity`/`Id` from `@oyl/all-of-oyl`).
- [ ] **Step 2: Run, verify fail** — `pnpm vanilla test bootstrap`.
- [ ] **Step 3: Implement** — `bootstrap.js`: `BACKED = new Set([… 'measurements','activitySessions'])` (all six personal collections). Add/adjust the tests above.
- [ ] **Step 4: Run, verify pass** — `pnpm vanilla build:lib && pnpm vanilla typecheck && pnpm vanilla test`.
- [ ] **Step 5: Commit** — `feat(vanilla-oyl): back the activitySessions repo (last per-kind stub) `.

---

## Manual acceptance (after Task 2)

Backend + app (fresh DB), signed in: log an activity session (`slug:'run'`, `30 minutes` + `5 km`) → flushes to `/api/activity-sessions`, persists owner-isolated, reads back with quantities. Confirm a second user sees none of the first user's sessions, and that no per-kind repo is stubbed any more.

## Self-review (coverage map)

- Spec A.1 (component + content-type) → T1. A.2 (wiring + tests) → T2.
- Reuse: `consumption` controller = the owner-scoped `documents()`+component+stripNulls template; `strapiRowToShape` + already-wired `ROW_KIND`/`PATH`; parity + booted harness; `ts:generate-types`→`as const`; per-kind journal routing + bootstrap `BACKED`.
- `quantities` repeatable component; `amount` float ⇒ no coercion util (only `stripNulls`). `Quantity.fromJSON` ignores the component id.
- After T2, ALL per-kind repos are backed (no stubs remain). Deferred (per spec): activity-logging UI; `Goal` backend (next sub-project).
