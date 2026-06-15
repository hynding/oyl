# Backend SP2.2a — authentication + owner-scoping for the record store — Design

**Status:** approved (closes the CRITICAL unauthenticated-mutation finding; forks confirmed; R-A–R-F)
**Date:** 2026-06-15
**Package:** `apps/strapi-oyl` (`@oyl/strapi-oyl-app`)
**Context:** SP2.1 shipped the `/v1` single-record endpoints with `auth: false` + a stub owner — a deliberate, documented interim. **SP2.2a makes the endpoints require a valid JWT and scopes every record to its owner**, closing the security gap as a focused slice. SP2.2b adds the batch endpoint + the full `httpProtocolContract` conformance.

---

## What this is

Turn the open `/v1` routes into authenticated, tenant-isolated endpoints:
- routes require Strapi's default auth (drop `config: { auth: false }`),
- `owner = ctx.state.user.id` (401 when absent),
- **every** query and write is owner-scoped, so a user can only read/mutate their own `(collection, recordId)` namespace,
- a bootstrap grants the `authenticated` role exactly the four `/v1` actions.

Verified by upgrading the booted smoke test to authenticate, plus a **cross-tenant isolation test**.

### Decisions (settled)

1. **Owner set + read via the query engine, not the document service (R-A — security).** `strapi.db.query(UID)` writes the `owner` relation by id without triggering the content-API `throwRestrictedRelations` check — so we **never grant the authenticated role `plugin::users-permissions.user.find`** (which would let any user enumerate every user via `GET /api/users`). The query engine also fits a generic blob store better (no draft/publish/i18n). The whole controller moves from `strapi.documents(UID)` to `strapi.db.query(UID)`.
2. **Owner-scoping makes isolation structural (no separate re-check).** `findOne`/`findMany` filter on `owner`; `create` sets `owner`. An owner-scoped lookup can't locate another tenant's row, so update/delete/purge can't touch it, and an `upsert` for a `recordId` you don't own simply creates your own — `recordId` is a per-owner namespace.
3. **Bootstrap grants only the 4 oyl-record actions** to the `authenticated` role (R-B, least privilege) — `api::oyl-record.oyl-record.{list,findOne,upsert,remove}`. Idempotent, all envs (it's the legitimate permission model, not a dev convenience). No `user.find` grant (R-A).
4. **No `:collection` allowlist (R-C).** The server is intentionally collection-agnostic (the generic-store design must not learn domain types). An arbitrary collection name is self-scoped to the user's owner namespace and bounded by the future data-size cap — not a cross-tenant or injection risk. (Reasoned non-fix for the security review's allowlist suggestion.)
5. **Auth verified by the smoke test + an isolation test (R-D)**; a shared `registerUser` helper (R-E); register via the real `POST /api/auth/local/register` (public role has it by default).

### Out of scope (→ SP2.2b)

- The **batch** endpoint (`POST /v1/:collection:batch`) and the full `httpProtocolContract` conformance (which exercises auth + batch end-to-end). The `@oyl/all-of-oyl/testing` subpath export is SP2.2b.

---

## Architecture — `apps/strapi-oyl/`

### `src/api/oyl-record/routes/v1.ts` — require auth
Remove `config: { auth: false }` from all four routes (Strapi then requires the `authenticated` role's permission, granted in bootstrap):
```ts
export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list' },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne' },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert' },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove' },
  ],
}
```

### `src/api/oyl-record/controllers/oyl-record.ts` — query engine + owner-scoping
Move from `strapi.documents(UID)` to `strapi.db.query(UID)` (uses `where`/`data`; relations by id). `decideUpsert`/`toEnvelope` stay unchanged. Each handler resolves the owner first:
```ts
const ownerOf = (ctx: any): number | null => ctx.state.user?.id ?? null
```
- All handlers: `const owner = ownerOf(ctx); if (owner == null) return ctx.unauthorized()`.
- **`findRow`**: `strapi.db.query(UID).findOne({ where: { owner, collection, recordId } })`.
- **`list`**: `findMany({ where: { owner, collection, ...(includeDeleted ? {} : { deletedAt: null }) } })` → `{ records: rows.map(toEnvelope) }`.
- **`findOne`**: `findRow` → 404 if none/`deletedAt`; else `toEnvelope`.
- **`upsert`**: `findRow`; `decideUpsert(existing && { revision: existing.revision }, revision ?? null)`:
  - `conflict` → 409 `{ error: { code: 'REVISION_CONFLICT', … } }`.
  - `create` → `query.create({ data: { owner, collection, recordId: id, data, revision: 1, deletedAt: null } })`.
  - `update` → `query.update({ where: { id: existing.id }, data: { data, revision: decision.revision, deletedAt: null } })`.
- **`remove`**: `findRow`; none → 204; `?purge=1` → `query.delete({ where: { id: existing.id } })`; else `query.update({ where: { id: existing.id }, data: { deletedAt: new Date(), revision: existing.revision + 1 } })`. 204.

(`toEnvelope` reads `recordId/data/revision/createdAt/updatedAt/deletedAt` off the query-engine row — all present. Verify the engine returns `createdAt`/`updatedAt`; if a row needs them and they're absent, add `select`/`populate` — implementer confirms against the booted app.)

### `src/index.ts` — bootstrap permission grant
Mirror the existing app's idempotent grant, scoped to the 4 actions, **no relation-target grant**:
```ts
import type { Core } from '@strapi/strapi'

const V1_ACTIONS = ['list', 'findOne', 'upsert', 'remove'].map((a) => `api::oyl-record.oyl-record.${a}`)

async function grantAuthenticated(strapi: Core.Strapi) {
  const role = (await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })) as { id: number } | null
  if (!role) { strapi.log.warn('[oyl] authenticated role not found; skipping /v1 permission grant'); return }
  for (const action of V1_ACTIONS) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({ where: { action, role: role.id } })
    if (!existing) await strapi.db.query('plugin::users-permissions.permission').create({ data: { action, role: role.id } })
  }
}

export default {
  register(_ctx: { strapi: Core.Strapi }) {},
  async bootstrap({ strapi }: { strapi: Core.Strapi }) { await grantAuthenticated(strapi) },
}
```
(The `authenticated` role is seeded by the users-permissions plugin's own bootstrap, which runs before the app bootstrap — so it exists by the time this runs, even on a fresh test DB.)

---

## Testing (booted, reusing SP2.1's harness)

### `test/helpers.ts` (R-E)
```ts
export async function registerUser(baseUrl: string, username: string): Promise<{ jwt: string; userId: number }> {
  const res = await fetch(`${baseUrl}/auth/local/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@test.dev`, password: 'Password123!' }),
  })
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return { jwt: body.jwt, userId: body.user.id }
}
```

### `test/oyl-record.smoke.test.ts` (upgrade — now auth-required, R-D)
- `beforeAll`: boot; `registerUser('userA')` → `jwtA`. `beforeEach`: truncate records.
- **Auth round-trip**: the SP2.1 create→409→bump→list→soft-delete→purge sequence, now with `Authorization: Bearer ${jwtA}` on every request.
- **No token → denied**: `PUT /v1/lifeAreas/<uid>` with no `Authorization` → status `401` or `403` (and nothing written).
- **Cross-tenant isolation**: `registerUser('userB')` → `jwtB`; B `PUT`s record `X` (rev 1). Then as A: `GET /v1/lifeAreas/X` → 404; `GET /v1/lifeAreas` → does not include X; `PUT /v1/lifeAreas/X {revision:null}` → 200 creating **A's own** X (rev 1, not a conflict); `DELETE /v1/lifeAreas/X` → 204. Finally assert **B's X is untouched** (B `GET /v1/lifeAreas/X` → still rev 1, not deleted). This is the proof the CRITICAL finding is closed.

## File structure
```
apps/strapi-oyl/
  src/api/oyl-record/routes/v1.ts        (modify: drop auth:false)
  src/api/oyl-record/controllers/oyl-record.ts (modify: query engine + owner-scoping + unauthorized guard)
  src/index.ts                            (modify: bootstrap grants the 4 /v1 actions to authenticated)
  test/helpers.ts                         (new: registerUser, R-E)
  test/oyl-record.smoke.test.ts           (modify: auth round-trip + no-token + isolation)
```
`decideUpsert`/`toEnvelope` and the boot harness are unchanged.

## Acceptance

`pnpm --filter @oyl/strapi-oyl-app exec strapi build` clean; `typecheck` clean; the upgraded smoke test green — i.e. the booted app **requires a JWT** (no-token → 401/403), the authed round-trip behaves per the protocol, and **cross-tenant isolation holds** (A cannot read/mutate B's records; B's record is unaffected by A's operations). The CRITICAL unauthenticated-mutation finding is closed; `apps/strapi-oyl` is now safe to wire into compose/expose (still gated behind SP4 + SP2.2b's batch/conformance for full protocol coverage).
