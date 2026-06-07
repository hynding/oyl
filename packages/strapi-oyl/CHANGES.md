# Strapi changes

Operator-facing log of non-trivial changes to `@oyl/strapi-oyl`. Latest at top.

---

## 2026-06-06 — Dev bootstrap permissions + user-scoped extend refactor

### What was wrong

A fresh Strapi DB (verify stack, e2e harness, anyone's first checkout) couldn't successfully exercise any of the user-* APIs end-to-end. Three independent issues piled on top of each other:

1. **No CRUD permissions for the Authenticated role.** Strapi's default is no permissions; without manually clicking through Settings → Users & Permissions → Roles, every `find`/`create`/`update`/`delete` returned 403.
2. **Strapi 5 validates relation-target permissions on writes.** Even with all `api::*` CRUD permissions granted, every `POST /api/user-<thing>` that the user-scoped controller auto-injects `data.user = user.id` into got rejected with `ValidationError: Invalid key user`. The root cause is in `@strapi/utils@5.42.1/dist/validate/visitors/throw-restricted-relations.mjs:80` — it checks `<relation-target-uid>.find` against the caller's permissions and rejects the entire body key if the lookup fails.
3. **`super.<action>` inside `extend` blocks of `createUserScopedController` was silently broken.** Strapi's factory calls `Object.setPrototypeOf` on the merged `userCtrl`, not on the extend's own object literal. Object-literal methods bind `[[HomeObject]]` at definition site, so `super.find` from inside an extend method resolved to `undefined`. `GET /api/user-profiles` 500'd on every fresh DB; `user-nutrition.delete` would have soft-deleted nothing if it had ever been called.

### What landed

- **`src/index.ts` — dev bootstrap hook.** Idempotent, runs only when `NODE_ENV !== 'production'`. Walks `strapi.contentTypes`:
  - For every `api::*` content type, grants the Authenticated role the actions the controller actually implements (filtered against `controller.<action>` being a function).
  - For every relation attribute pointing at another content type (including `plugin::users-permissions.user`), grants `<target>.find` so Strapi 5's `throwRestrictedRelations` lets writes through.

  Logs `[dev-bootstrap] Granted N permission(s) to the Authenticated role` on first boot. On subsequent boots, grants 0 because the existence check short-circuits each row.

- **`src/utils/user-scoped-controller.ts` — extend signature is now `({ strapi, scoped })`.** `scoped` exposes bound references to the factory's owner-scoped `find`/`findOne`/`create`/`update`/`delete`. Each `scoped.<action>` is bound to the `userCtrl` literal that Strapi sets the prototype on, so the inner `super.<action>` resolves correctly even when called from an extend method whose own `[[HomeObject]]` would not. Backward compatible: extends that only destructure `{ strapi }` (e.g. `user-daily`) still work unchanged.

- **`src/api/user-profile/controllers/user-profile.ts`.** Replaced the broken `super.find`/`super.create`/`super.update` calls with `scoped.find(ctx)`, `scoped.create(ctx)`, `scoped.update(ctx)`. File dropped from ~85 lines back to ~35; the IANA-timezone validator stays where it was.

- **`src/api/user-nutrition/controllers/user-nutrition.ts`.** The `delete` override now reroutes through `scoped.update(ctx)` to soft-delete via `deleted_at`. Previously this would have failed at runtime had it ever been called (the SPA uses `update` directly, which is why the bug stayed dormant in production).

- **`src/utils/README.md`.** "Custom actions" section updated with the new `({ strapi, scoped })` signature, an example that shows `scoped.update` inside a custom `delete` override, and a rewritten rule explaining why `super.<action>` is forbidden inside extend literals and to use `scoped.<action>` instead.

### What changed in upstream config (one-liner)

Root `package.json` now lists `better-sqlite3` in `pnpm.onlyBuiltDependencies`. Strapi's SQLite client needs its native binary built during `pnpm install`, and pnpm's modern security model skips postinstall scripts unless explicitly allowed. This unblocks both the new verify stack (SQLite-based) and the existing Playwright e2e harness, which was silently failing on fresh checkouts.

### Verification

End-to-end via the docker verify stack (`pnpm verify`):

- `POST /api/user-profiles` with `{ timezone: 'America/Los_Angeles' }` → 200 with `data.user` auto-set.
- `GET /api/user-profiles` → returns the profile with `activities`/`goals`/`nutrition_items` populated by the find override.
- `PUT /api/user-profiles/<doc>` with `{ timezone: 'Europe/Paris' }` → 200, change persists.
- `PUT` with invalid `timezone` → 400 `ValidationError: Invalid IANA timezone: <name>`.
- `POST /api/user-nutritions` (controller auto-injects `data.user`) → 200 with the log persisted.
- `DELETE /api/user-nutritions/<doc>` → 200 with `deleted_at` set (soft delete via `scoped.update`).
- SPA `/my/nutrition` and `/daily` console clean except the intentional `[OFF] missing VITE_OFF_* env vars` dev warning.

### Known follow-ups (not fixed)

- **`Intl.supportedValuesOf('timeZone')` excludes the `UTC` alias.** `Etc/UTC` is included, but bare `UTC` is rejected as "Invalid IANA timezone". `assertValidTimezone` in `user-profile.ts` carries the quirk forward — either broaden the allow-list or use `Intl.DateTimeFormat` resolution which handles aliases. Tangential to this round of fixes.
- **The `extend` pattern still has surface area for misuse.** Anyone who writes `super.<action>` inside an extend block will get the broken behavior back. The README rewrite is the primary defense; the typing on `extend` could be tightened further (e.g. forbidding methods whose body contains `super` references), but that's not enforceable in TypeScript without significant gymnastics.

### Commits

- `e9f2eeb` — dev bootstrap grants `api::*` CRUD
- `b39b06c` — dev bootstrap also grants `<relation-target>.find`
- `d462842` — user-profile find no longer relies on broken extend super
- `62a36e4` — user-profile create/update no longer rely on broken extend super
- `c076fa2` — refactor: pass scoped CRUD actions to user-scoped extend
