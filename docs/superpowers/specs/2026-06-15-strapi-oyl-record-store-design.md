# Backend SP2.1 — new Strapi app + generic record store + `/v1` single-record endpoints — Design

**Status:** approved (stack = new Strapi 5 in `apps/`; forks A–E from the SP2 brainstorm)
**Date:** 2026-06-15
**Package:** new `apps/strapi-oyl` (Strapi 5) — **zero coupling to `packages/strapi-oyl`** (mirror its config conventions, import nothing from it)
**Context:** SP2 of the backend arc implements the OYL sync protocol v1 (`docs/oyl-sync-protocol-v1.md`) as a reference backend. **SP2.1 = the app skeleton + the generic `oyl-record` store + the single-record `/v1` endpoints + the revision/tombstone rule, with a STUB owner.** SP2.2 adds real users-permissions auth (JWT → owner), the batch endpoint, and the conformance test (`httpProtocolContract` against the running server).

---

## What this is

A fresh Strapi 5 app whose entire domain model is one content-type, `oyl-record`, and whose only surface is the custom `/v1` routes (the default content-API for the type is locked down). The server is a **generic blob store**: it never parses `data`; it enforces optimistic concurrency on an integer `revision` and soft-deletes via `deletedAt` — mirroring `InMemoryRepository`/`LocalStorageRepository` semantics so the SP1 `httpProtocolContract` will pass it (in SP2.2).

**SP2.1 scope:** scaffold + content-type + `GET /v1/:collection`, `GET /v1/:collection/:id`, `PUT /v1/:collection/:id`, `DELETE /v1/:collection/:id` (`?purge=1`) + the revision/upsert/tombstone rule (extracted as a pure, unit-tested function) + a **stub owner** (`ownerOf(ctx)` returns a fixed dev owner / `null`; routes `auth: false`) + a **boot harness + booted smoke test** (R-C) so the endpoints are actually verified, not just curl-described.

### Decisions (settled)

1. **Naming (fork):** directory `apps/strapi-oyl`, but the package name **cannot** be `@oyl/strapi-oyl` (collides with `packages/strapi-oyl`). Default to package name **`@oyl/strapi-oyl-app`** + a root script alias `pnpm strapi-app` (mirroring the `pnpm strapi` shortcut). *(If you'd rather rename to a clean `apps/api-oyl` / `@oyl/api-oyl`, or plan to delete the old `packages/strapi-oyl` and free the name, say so on review.)*
2. **Generic content-type `oyl-record`** (collectionType): `collection: string (required)`, `recordId: string (required)`, `data: json`, `revision: integer (default 0)`, `deletedAt: datetime (nullable)`, `owner: relation manyToOne → plugin::users-permissions.user (nullable in SP2.1)`. `draftAndPublish: false`, **no i18n**. A DB unique index on `(owner, collection, recordId)` (fork C — create-race safety).
3. **Lock down the default content-API** for `oyl-record` (fork D): the only exposed surface is the custom `/v1` routes.
4. **Stub owner in SP2.1** (auth deferred to SP2.2): a single `ownerOf(ctx)` seam returns a fixed dev owner id or `null`; `/v1` routes use `config: { auth: false }`. SP2.2 swaps `ownerOf` to `ctx.state.user.id` + requires auth, with no other controller change.
5. **DB:** SQLite for dev/test (fork A), Postgres-ready via `DATABASE_CLIENT`/`DATABASE_URL` (mirror `packages/strapi-oyl/config/database.ts`).
6. **The revision rule (and more) are pure functions** (R-B): `decideUpsert(stored, asserted)`, `toEnvelope(row)`, the list-filter builder, and the soft-delete patch builder — all no-Strapi, unit-tested; the controller is a thin adapter that orchestrates them + the document service.
7. **Scaffold by copying the proven boilerplate** (R-A): copy `config/*`, `tsconfig.json`, `package.json` from `packages/strapi-oyl` as the skeleton (change name, secrets, db path), then strip its `src/api/*` and add `oyl-record`. "No dependency" = no runtime import; copying boilerplate file *content* is fine and far less boot-fragile than authoring from scratch.
8. **Lock down the default content-API by NOT defining a core router** (R-E) — with only `routes/v1.ts` and no `createCoreRouter`, Strapi generates no `/api/oyl-records` CRUD; only `/v1` is exposed.
9. **The protocol baseUrl includes Strapi's `/api` prefix** (R-F): custom API routes mount under `/api`, so `path: '/v1/:collection'` serves at `/api/v1/...`; clients/conformance use `baseUrl = http://host/api` (the adapter appends `/v1`). **Do NOT** change Strapi's global `rest.prefix` (it would also move users-permissions' `/auth/*` routes, complicating SP2.2/SP3).

### Out of scope (→ SP2.2 / later)

- Real users-permissions auth (JWT → `ctx.state.user` → owner), the bootstrap permission grant, the **batch** endpoint, and the full 12-case **conformance** (`httpProtocolContract` against the running server). All SP2.2 — which **reuses SP2.1's boot harness** (R-D).
- Fully-transactional compare-and-set (SP2.1 does find-then-write). The composite unique index on `(owner, collection, recordId)` is **best-effort** (R-G): implement via a DB migration/lifecycle if straightforward in 5.47; otherwise defer to hardening — find-then-write suffices for single-threaded tests (and SQL treats `NULL` owners as distinct anyway, so it only bites once owners are real in SP2.2).
- Docker compose service + port mapping (SP4 wiring).

---

## Architecture — `apps/strapi-oyl/`

### Scaffold (mirror `packages/strapi-oyl` conventions; import nothing from it)
- `package.json` — name `@oyl/strapi-oyl-app`, `@strapi/strapi` `5.47.1` + `@strapi/plugin-users-permissions` (+ `better-sqlite3`, `pg` for prod), scripts `develop`/`build`/`start`/`typecheck` (mirror the existing app).
- `config/` — `server.ts`, `admin.ts`, `database.ts` (copy the multi-client shape, SQLite default), `middlewares.ts`, `api.ts`, `plugins.ts`. New `APP_KEYS`/secrets via env (a `.env`/`.env.example`).
- `tsconfig.json` mirroring the existing app. `src/index.ts` with empty `register`/`bootstrap` (SP2.2 fills `bootstrap` with the permission grant).
- Add a root script alias in the repo `package.json`: `"strapi-app": "pnpm --filter @oyl/strapi-oyl-app"`.

### Content-type — `src/api/oyl-record/content-types/oyl-record/schema.json`
```json
{
  "kind": "collectionType",
  "collectionName": "oyl_records",
  "info": { "singularName": "oyl-record", "pluralName": "oyl-records", "displayName": "OYL Record" },
  "options": { "draftAndPublish": false },
  "attributes": {
    "collection": { "type": "string", "required": true },
    "recordId": { "type": "string", "required": true },
    "data": { "type": "json" },
    "revision": { "type": "integer", "default": 0, "required": true },
    "deletedAt": { "type": "datetime" },
    "owner": { "type": "relation", "relation": "manyToOne", "target": "plugin::users-permissions.user" }
  }
}
```
(A unique index on `(owner, collection, recordId)` via a migration or the schema's index options — implementer confirms the Strapi 5.47 mechanism.)

### The pure rule — `src/api/oyl-record/services/upsert-rule.ts`
```ts
export type Stored = { revision: number } | undefined
export type UpsertDecision = { action: 'create' } | { action: 'update'; revision: number } | { action: 'conflict' }

/** Mirror InMemoryRepository: no record → create (rev 1, ignore asserted); exists → require match else conflict; match → bump. */
export function decideUpsert(stored: Stored, assertedRevision: number | null): UpsertDecision {
  if (!stored) return { action: 'create' }
  if (assertedRevision !== stored.revision) return { action: 'conflict' }
  return { action: 'update', revision: stored.revision + 1 }
}
```

### Custom routes — `src/api/oyl-record/routes/v1.ts`
```ts
export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list',   config: { auth: false } },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne', config: { auth: false } },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert',  config: { auth: false } },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove',  config: { auth: false } },
  ],
}
```
(`auth: false` is SP2.1-only; SP2.2 flips these to authenticated + the bootstrap grant. The batch `POST /v1/:collection:batch` route is SP2.2.)

### Controller — `src/api/oyl-record/controllers/oyl-record.ts`
A thin adapter over `strapi.documents('api::oyl-record.oyl-record')` + `decideUpsert`:
- `ownerOf(ctx)` (SP2.1 stub) → a fixed dev owner id or `null`.
- **`toEnvelope(row)`** → `{ id: row.recordId, data: row.data, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt, deletedAt: row.deletedAt ?? null }`.
- **`list`**: `documents().findMany({ filters: { owner, collection, ...(includeDeleted ? {} : { deletedAt: { $null: true } }) } })` → `{ records: rows.map(toEnvelope) }`.
- **`findOne`**: `findFirst({ filters: { owner, collection, recordId } })` → 404 if none or `deletedAt`; else `toEnvelope`.
- **`upsert`**: read body `{ data, revision }`; `findFirst` existing; `decideUpsert(existing, revision)`:
  - `create` → `documents().create({ data: { owner, collection, recordId, data, revision: 1, deletedAt: null } })`.
  - `update` → `documents().update({ documentId, data: { data, revision: decision.revision, deletedAt: null } })`.
  - `conflict` → `ctx.status = 409; ctx.body = { error: { code: 'REVISION_CONFLICT', message: … } }`.
  - success → 200 `toEnvelope`.
- **`remove`**: `?purge=1` → `documents().delete(...)` (hard); else set `deletedAt = now`, `revision + 1` (soft). 204 either way; idempotent (missing/already-deleted → 204).

(Document-service method signatures for 5.47 — `findMany`/`findFirst`/`create`/`update`/`delete`, `documentId` vs `id` — the implementer confirms against the running app.)

---

## Testing

- **Pure-helper unit tests** (no Strapi, R-B): `upsert-rule.test.ts` — `decideUpsert(undefined, anything)` → `create`; `({revision:3}, 3)` → `{update, revision:4}`; `({revision:3}, 2)` and `(…, null)` → `conflict`. Plus tests for `toEnvelope` (row → envelope, `deletedAt` → `null` when absent) and the list-filter / soft-delete-patch builders.
- **Boot harness** (R-C/R-D, reusable) — `test/boot.ts`: programmatically start the Strapi app (`NODE_ENV=test`, SQLite temp/in-memory DB, secrets from env) on an ephemeral port and return `{ baseUrl, stop }` where `baseUrl` ends in `/api` (R-F). SP2.2's conformance reuses it.
- **Booted smoke test** — `oyl-record.smoke.test.ts`: boot the app, then over real `fetch` against `${baseUrl}/v1/lifeAreas/<uuid>`: `PUT {data,revision:null}` → 200 envelope rev 1; `PUT {revision:null}` again → 409 `REVISION_CONFLICT`; `PUT {revision:1}` → 200 rev 2; `GET /v1/lifeAreas` → 1 record; `DELETE` → 204, then list empty but `?includeDeleted=1` shows it; `DELETE ?purge=1` → 204 and `?includeDeleted=1` now empty. This proves the routes + controller + revision/tombstone work end-to-end (the implementer needs no manual curl).

## File structure

```
apps/strapi-oyl/                      (new Strapi 5 app, @oyl/strapi-oyl-app; boilerplate copied from packages/strapi-oyl per R-A)
  package.json, tsconfig.json, .env, .env.example   (R-H: required secrets documented)
  config/{server,admin,database,middlewares,api,plugins}.ts
  src/index.ts                        (empty register/bootstrap; SP2.2 fills bootstrap)
  src/api/oyl-record/
    content-types/oyl-record/schema.json
    routes/v1.ts                       (custom routes only — no createCoreRouter, R-E)
    controllers/oyl-record.ts          (thin adapter over the pure helpers + document service)
    services/upsert-rule.ts            (pure: decideUpsert, toEnvelope, filter/patch builders) (+ upsert-rule.test.ts)
  test/boot.ts                         (reusable boot harness, R-D)
  test/oyl-record.smoke.test.ts        (booted round-trip, R-C)
+ root package.json: "strapi-app" filter alias
```
Nothing imports from `packages/strapi-oyl` at runtime (boilerplate file content is copied, not depended on).

## Acceptance

`pnpm strapi-app build` succeeds; `pnpm strapi-app typecheck` clean; the **pure-helper tests** green; and the **booted smoke test** green — i.e. the real app boots and the `/v1` single-record endpoints behave per the protocol (create/conflict/bump, list with/without tombstones, soft + hard delete) end-to-end. The app is a standalone Strapi with one generic `oyl-record` type and the `/v1` single-record protocol surface, with a reusable boot harness — ready for SP2.2 to add real auth + batch + the full `httpProtocolContract` conformance run.
