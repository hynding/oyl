# Storage & Sync Architecture — design (Sub-project A)

**Date:** 2026-06-18
**Status:** Approved (brainstorming)
**Scope:** Foundation only — the client data layer, the backend storage pattern, the `@oyl/all-of-oyl` ↔ Strapi parity discipline, and the retirement of the offline-first stack — proven end-to-end on **one reference entity**. The concrete entity schema (B), the query/timeline/search API (C), the client feature/UI rework (D), and **private mode** (E) are separate sub-projects that build on this.

## Why

The app was built local-first / offline-first: a generic `oyl_records` table (opaque JSON `data` blob keyed by `collection` + `recordId` + `revision` + `owner`), a backend-agnostic sync protocol (`docs/oyl-sync-protocol-v1.md`), and a client sync engine (cache-as-mirror + outbox + delta-pull cursors + conflict resolution). The product direction now wants the **server to answer questions** — a single date-range "timeline" call, filtered/searchable/aggregated views over recorded data, and large shared catalogs (Activity/Goal/Consumable, a food/UPC database). Those are server-side relational queries, which the client-is-source-of-truth model fights.

The decision (brainstormed): pivot to **online-first with a durable write-outbox** over a **relational Strapi backend**, keeping only the offline guarantee that matters — *you never lose a write, and recently-viewed data survives a brief drop*. This retires the heaviest machinery (full mirror, delta-sync, cross-record conflict resolution, the backend-agnostic conformance contract) while preserving offline write durability.

## Decisions (from brainstorming)

| # | Decision |
|---|---|
| Offline guarantee | **Offline writes + recent-reads cache.** Online-first reads; durable write-outbox; bounded recent-reads cache. Not a full mirror; no cross-record reconciliation. |
| Backend model | **Relational Strapi content-types**, one per entity, with relations + per-type `owner`. Drop the backend-agnostic contract and the generic `oyl-record` store. |
| Read API | **Hybrid:** Strapi built-in CRUD/query for simple per-entity reads; custom controllers for cross-type composites (timeline, search) — composites specified in C. |
| SSOT & parity | `@oyl/all-of-oyl` stays the canonical domain model; Strapi content-types are hand-authored to mirror it; a **parity test** fails on divergence. |
| Auth / access | **Account-required** for normal use; remove the auth "skip / use local data" path now. (Local-only returns under private mode, sub-project E.) |
| Personal-data seam | Personal data flows through a **repository interface**; one impl now (server + outbox). `LocalStorageRepository` is **kept** (dormant) as the basis for E's local impl. |
| Write / conflict | **Last-write-wins** by server timestamp; surface a quiet "changed elsewhere" notice on a stale write. No automatic field-merge. |
| Reference entity | **Journal note** — taken fully through the new stack as the template B replicates. |

## Architecture

### A1. Runtime data flow (client)

- **Reads** fetch from Strapi (the source of truth). A read goes: check recent-reads cache → fetch from server → populate cache → render. Online-first; a cache hit can render immediately while revalidating.
- **Writes** never hit the network synchronously. A write: (1) validate via the `@oyl/all-of-oyl` domain type, (2) enqueue a mutation in the **outbox**, (3) optimistically apply to the in-memory/cached view, (4) a flusher POSTs queued mutations to Strapi in order; on success dequeue, on transport failure retain and retry on reconnect/online. A write is durable the moment it is enqueued (outbox persisted to localStorage), so it survives reload/offline and is never lost.
- **Recent-reads cache** is bounded (LRU + TTL), keyed by request (endpoint + params). It exists so a brief connectivity drop re-renders recently-viewed screens; it is explicitly **not** a complete local mirror and holds no authority.
- **Connectivity** drives the flusher (reuse the existing `Connectivity` browser adapter): online → flush; offline → hold.

### A2. Backend (relational Strapi)

- Each domain entity is a Strapi **content-type** with typed columns + relations, and a `manyToOne` `owner` relation to `plugin::users-permissions.user` for structural tenant isolation (the same owner-scoping guarantee as today, per content-type instead of on `oyl_record`).
- **Reads:** hybrid — Strapi's built-in find/findOne (filters/sort/populate/pagination) for per-entity reads; **custom controllers/routes** for composites that span content-types (the date-range timeline, cross-type search) — designed in C. The client speaks the app's endpoints + a constrained subset of built-in query, never an open-ended Strapi query DSL.
- **Auth:** unchanged mechanism (users-permissions JWT, owner-scoped). The bootstrap permission grant (today's `grantAuthenticated` for the 5 `oyl-record` actions, plus `grantPublicAuth`) extends to the new content-types' CRUD actions, scoped to authenticated + owner.
- The generic `oyl-record` content-type, its routes/controller/service, and `docs/oyl-sync-protocol-v1.md` are **removed**.

### A3. `@oyl/all-of-oyl` ↔ Strapi parity

- `@oyl/all-of-oyl` remains **canonical**: the domain types, their validation, and business logic (`sumNutrients`, goal evaluation, formatters, etc.). The client and any computation use it.
- `src/collections.ts` evolves from a collection→codec manifest into an **entity manifest**: for each persisted entity, a machine-readable **field schema** (field name → type/optionality) plus its codec. This is the single declaration both the client repository layer and the parity test consume.
- Strapi content-type `schema.json` files are **hand-authored** to mirror the manifest. A **parity test** (run in the lib and/or backend DoD) reads the Strapi `schema.json` files and asserts every manifest field is present with a compatible type, and vice-versa — failing the build on drift. (Codegen from the manifest is a deliberate non-goal for A; the parity test is the guardrail.)

### A4. Personal-data repository seam

- All **personal** (user-owned) data is accessed through a **repository interface** (e.g. `PersonalRepository<T>` with `get`/`list`/`save`/`remove`), decoupling features from storage location.
- A's only implementation is the **server-backed repo** (reads via the read client + cache; writes via the outbox). 
- `LocalStorageRepository` is **retained** (kept compiling + tested) as the basis for E's local implementation, but is **not wired** into the running app in A. This preserves the seam so private mode (E) is a drop-in second impl, not a rewrite.
- **Catalog** (shared, non-user-owned) data — Activity/Goal/Consumable definitions — is always read from the server (no local impl), even under future private mode; only user-owned records are location-switchable in E.

### A5. Access model

- Normal use requires an account (online-first reads need the server). The auth **"skip / use local data" affordance is removed** in A (the login/register pages keep account creation + sign-in; the skip button and its local-mode wiring go).
- Local-only personal storage returns as **private mode (sub-project E)** — opt-in, account still required for catalogs, personal records stored only locally, with a persistent UI indicator, up-front risk/consequence warnings (device/browser dependence, version conflicts, no sharing, storage size limits, **and that it is not anonymity** — the account + catalog calls still identify the user), capped bidirectional migration on switch, and **graceful degradation** (timeline/search/aggregation computed client-side over the small capped local set; sharing + large history disabled).

### A6. Write & conflict model

- Outbox mutations are `{ op: 'create' | 'update' | 'delete', entity, id, payload, baseUpdatedAt }`, applied in enqueue order.
- The **server is authoritative**; conflicts (a record changed on another device since `baseUpdatedAt`) resolve **last-write-wins** by server timestamp. On a detected stale write the client surfaces a quiet, non-blocking "this changed elsewhere" notice. No automatic per-field merge (single-user-across-devices makes true conflicts rare; LWW + notice is the pragmatic floor).

### A7. Reference entity — Journal note

A proves the entire stack on the existing **Journal note** entity:
- Strapi `note` content-type (mirroring the `@oyl/all-of-oyl` Note shape) with `owner`, built-in CRUD, auth grant.
- Client: read a day's notes via the read client (+ recent cache); create/edit/delete via the outbox (including the offline→reconnect→flush path).
- The manifest entry + parity test for `note`.

This is the template B replicates across all entities. (Journal note is chosen as a small, self-contained, already-existing entity; the cross-type *timeline* composite is C, not A.)

## What retires

- `packages/all-of-oyl/src/core/sync-engine.ts`, the cursor store, the cache-as-mirror store, and the `http-repository-contract.ts` conformance suite (and its `@oyl/all-of-oyl/testing` export).
- The Repository-over-sync-engine facades; `makeRepositories`' remote/engine path.
- `apps/strapi-oyl` `oyl-record` content-type + routes/controller/service; `docs/oyl-sync-protocol-v1.md`.
- The auth "skip / use local data" path in `apps/vanilla-oyl` (login/register pages + main wiring).
- `LocalStorageRepository` is **NOT** retired — kept dormant for E.

localStorage's role shrinks to: the outbox, the recent-reads cache, and session/settings (+ the dormant local-repo code, unused at runtime).

## Error handling

- **Write transport failure / offline:** mutation stays in the outbox; retried on reconnect; the optimistic view stands. The user is not blocked.
- **Write rejected by server (validation/permission):** the mutation is quarantined (not silently dropped), the optimistic apply is rolled back, and the user is notified — mirrors today's failed-writes affordance.
- **Stale write (LWW):** applied server-side; client shows the "changed elsewhere" notice (A6).
- **Read failure with a cache hit:** render the cached copy + a staleness indicator. **Read failure with no cache:** an explicit error/retry state (online-first means some screens require connectivity).
- **Auth expiry:** the existing `onAuthError` → logout flow; account-required means logout routes to login.

## Testing

- **Outbox:** enqueue persists across reload; flush on online; hold on offline then flush on reconnect; optimistic apply + rollback on server rejection; ordering preserved.
- **Recent-reads cache:** hit/miss, TTL/LRU eviction, render-then-revalidate.
- **Reference content-type (`note`):** CRUD is owner-scoped (a second user cannot read/write another's notes); auth grant present; behavior verified against a booted Strapi.
- **Parity test:** manifest ↔ Strapi `schema.json` (passes when aligned; fails on an injected divergence).
- **Manual acceptance:** sign in → log a Journal note **offline** → reconnect → the note is present server-side and visible on another session.

## Definition of Done

- `@oyl/all-of-oyl`: tests + `typecheck:src` + `build` green (with the retired modules removed and the manifest/parity in place).
- `apps/vanilla-oyl`: tests + `typecheck` + `build:lib` green; Journal note works end-to-end through the new client data layer; the "skip" path is gone.
- `apps/strapi-oyl`: `tsc` + test suite green; the `note` content-type is owner-scoped; `oyl-record` removed.
- Parity test green for the reference entity.
- Manual acceptance (above) passes.

## Scope boundaries (what A is NOT)

- **Not** the concrete entity schema beyond the one reference entity — Activity/Goal/Consumable catalogs, Consumable Instance, FDA nutrition facts, ingredients, and the User-owned instance records are **Sub-project B**.
- **Not** the timeline/search/aggregation endpoints — **Sub-project C** (A only establishes the hybrid read pattern + builds the reference entity's built-in CRUD).
- **Not** the full client feature/UI rework (search/select/timeline screens) — **Sub-project D**.
- **Not** private mode — **Sub-project E** (A only preserves the seam).
- **Data is discarded, not migrated** — the project is pre-adoption; the pivot assumes a clean reset of local + server data (consistent with prior refactors).
