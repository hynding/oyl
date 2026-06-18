# Storage & Sync Architecture — design (Sub-project A)

**Date:** 2026-06-18
**Status:** Approved (brainstorming)
**Scope:** Foundation only — the client data layer, the backend storage pattern, the entity-`kind` axis (catalog/personal/system), the `@oyl/all-of-oyl` ↔ Strapi parity discipline, and the retirement of the offline-first stack — proven end-to-end on **two reference entities, one per access path** (a personal entity and a catalog entity). The concrete entity schema (B), the query/timeline/search API (C), the client feature/UI rework (D), and **private mode** (E) are separate sub-projects that build on this.

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
| Entity kind | Every entity declares a first-class **`kind`: `catalog` \| `personal` \| `system`**; the data-access seam, owner-scoping, location-switchability, and caching all derive from it. New catalogs just declare `kind: 'catalog'`. |
| Auth / access | **Account-required** for normal use; remove the auth "skip / use local data" path now. (Local-only returns under private mode, sub-project E.) |
| Data-access seam | **Personal** data flows through a repository interface (server impl now; `LocalStorageRepository` kept dormant for E). **Catalog** data flows through a server-only read client (search/select) + user-contributed creates. |
| Write / conflict | **Last-write-wins** by server timestamp; surface a quiet "changed elsewhere" notice on a stale write. No automatic field-merge. |
| Reference entities | **Journal note** (personal + outbox) **and Activity** (catalog: server-only read, search/select, user-contributed create) — both templates B replicates. |

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
- `src/collections.ts` evolves from a collection→codec manifest into an **entity manifest**: for each persisted entity, a **`kind`** (`catalog` | `personal` | `system`), a machine-readable **field schema** (field name → type/optionality), and its codec. This is the single declaration the client data-access layer, the routing of each entity to the right access path, and the parity test all consume.
- Strapi content-type `schema.json` files are **hand-authored** to mirror the manifest. A **parity test** (run in the lib and/or backend DoD) reads the Strapi `schema.json` files and asserts every manifest field is present with a compatible type, and vice-versa — failing the build on drift. (Codegen from the manifest is a deliberate non-goal for A; the parity test is the guardrail.)

### A4. Entity kinds & the data-access seam

Every entity declares a **`kind`** in the manifest, and that single classifier drives how it's stored, scoped, cached, and (in E) location-switched. This is what makes future catalogs drop in without architectural change — a new catalog declares `kind: 'catalog'` and inherits the catalog path.

**`kind: 'personal'`** (user-owned records — entries, accounts, budgets, plans, vault, the user profile, and the future "User X" instances):
- Accessed through a **repository interface** (`PersonalRepository<T>`: `get`/`list`/`save`/`remove`), decoupling features from storage location.
- A's only impl is the **server-backed repo** (reads via the read client + cache; writes via the outbox). Owner-scoped server-side.
- `LocalStorageRepository` is **retained** (kept compiling + tested) but **not wired** in A — the basis for E's local impl, so private mode is a drop-in second impl, not a rewrite. Only `personal` entities are location-switchable in E.

**`kind: 'catalog'`** (shared, searchable, selectable, **user-contributable** definitions — `activities`, `consumables`, future Consumable Instance, and B's calls on `goals`/`lifeAreas`):
- Accessed through a **server-only catalog read client** (search/select queries) — always from the server, never location-switched, even under private mode.
- **User-contributed creates flow through the same outbox** (a create mutation) but with catalog semantics: not owner-private, and subject to **server-side dedup / visibility / curation** on flush. Each catalog content-type carries a **creator** ref + a **visibility** field; the *policy* (global vs private vs moderated, dedup rules) is a **Sub-project B decision** — A only reserves the fields so policy lands without a schema rework.
- Catalogs are the **prime cache candidate** (read-mostly, shared, and must stay resolvable for private-mode references) — they may use a longer TTL than personal reads.

**`kind: 'system'`** (sharing links — `connections`, `grants`): owner-scoped, server-only, no local impl.

**Cross-cutting principle — snapshot catalog references.** A `personal` record that references a `catalog` item by id (e.g. `consumableId`, `activityId`) must **snapshot** the catalog fields it needs to display/compute (as `Consumption` already snapshots nutrients). This keeps personal records correct across catalog edits/deletion *and* renderable in private mode, where the catalog lives only on the server.

**Latent catalogs (future-awareness).** Several reference values are inline strings today — finance `category`, activity units (`minutes`/`km`), nutrient metric keys. The relational direction may promote some to real catalogs (Category, Unit, …). The `kind`-driven manifest means each becomes a new `kind: 'catalog'` entry with no architectural change; A is explicitly designed to absorb them.

### A5. Access model

- Normal use requires an account (online-first reads need the server). The auth **"skip / use local data" affordance is removed** in A (the login/register pages keep account creation + sign-in; the skip button and its local-mode wiring go).
- Local-only personal storage returns as **private mode (sub-project E)** — opt-in, account still required for catalogs, personal records stored only locally, with a persistent UI indicator, up-front risk/consequence warnings (device/browser dependence, version conflicts, no sharing, storage size limits, **and that it is not anonymity** — the account + catalog calls still identify the user), capped bidirectional migration on switch, and **graceful degradation** (timeline/search/aggregation computed client-side over the small capped local set; sharing + large history disabled).

### A6. Write & conflict model

- Outbox mutations are `{ op: 'create' | 'update' | 'delete', entity, id, payload, baseUpdatedAt }`, applied in enqueue order.
- The **server is authoritative**; conflicts (a record changed on another device since `baseUpdatedAt`) resolve **last-write-wins** by server timestamp. On a detected stale write the client surfaces a quiet, non-blocking "this changed elsewhere" notice. No automatic per-field merge (single-user-across-devices makes true conflicts rare; LWW + notice is the pragmatic floor).

### A7. Reference entities — Journal note (personal) + Activity (catalog)

A proves **both** access paths so each kind has a template B replicates:

**Journal note** (`kind: 'personal'`):
- Strapi `note` content-type (mirroring the `@oyl/all-of-oyl` Note shape) with `owner`, built-in CRUD, auth grant.
- Client: read a day's notes via the read client (+ recent cache); create/edit/delete via the outbox (incl. offline→reconnect→flush).
- Manifest entry (`kind: 'personal'`) + parity test for `note`.

**Activity** (`kind: 'catalog'`):
- Strapi `activity` content-type (mirroring `Activity`) with `creator` + `visibility` fields + auth grant; readable across users per the (B-decided, A-default) visibility, search/select by name.
- Client: search/select via the catalog read client; **create a new Activity** via the outbox (catalog semantics — not owner-private), demonstrating "add new and use existing."
- Manifest entry (`kind: 'catalog'`) + parity test for `activity`.

These two are the templates for all personal and catalog entities in B. The cross-type *timeline* composite is C, not A; A's catalog proof is single-entity search/select + contribute.

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
- **Reference content-type `note` (personal):** CRUD is owner-scoped (a second user cannot read/write another's notes); auth grant present; behavior verified against a booted Strapi.
- **Reference content-type `activity` (catalog):** search/select by name works; a user-contributed create succeeds and is then findable; the visibility default is enforced (a second user sees catalog items per the A-default policy, not owner-private). Verified against a booted Strapi.
- **Parity test:** manifest (incl. each entity's `kind`) ↔ Strapi `schema.json` (passes when aligned; fails on an injected divergence).
- **Manual acceptance:** sign in → log a Journal note **offline** → reconnect → the note is present server-side and visible on another session; search the Activity catalog, add a new Activity, and re-find it.

## Definition of Done

- `@oyl/all-of-oyl`: tests + `typecheck:src` + `build` green (with the retired modules removed and the manifest/parity in place).
- `apps/vanilla-oyl`: tests + `typecheck` + `build:lib` green; Journal note works end-to-end through the new client data layer (personal/outbox path) and the Activity catalog search/select/contribute works (catalog path); the "skip" path is gone.
- `apps/strapi-oyl`: `tsc` + test suite green; the `note` (personal, owner-scoped) and `activity` (catalog, creator+visibility) content-types exist; `oyl-record` removed.
- Parity test green for both reference entities (incl. their `kind`).
- Manual acceptance (above) passes.

## Scope boundaries (what A is NOT)

- **Not** the concrete entity schema beyond the two reference entities — the full Goal/Consumable catalogs, Consumable Instance, FDA nutrition facts, ingredients, the catalog **visibility/curation/dedup policy**, and the User-owned instance records are **Sub-project B**. (A builds only `note` + `activity` and reserves the catalog `creator`/`visibility` fields.)
- **Not** the timeline/search/aggregation endpoints — **Sub-project C** (A establishes the hybrid read pattern + builds each reference entity's reads: `note` built-in CRUD, `activity` single-entity search/select).
- **Not** the full client feature/UI rework (search/select/timeline screens) — **Sub-project D**.
- **Not** private mode — **Sub-project E** (A only preserves the seam).
- **Data is discarded, not migrated** — the project is pre-adoption; the pivot assumes a clean reset of local + server data (consistent with prior refactors).
