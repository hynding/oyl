# camis-php-oyl — follow-ups

Deferred findings from the per-task and whole-branch reviews of
`docs/superpowers/plans/2026-09-08-camis-php-oyl.md` (2026-09-08). Everything
Critical/Important was fixed on the branch; these are the Minor items and the deliberate
deferrals. None blocks merge. The camis-side list lives in the camis repo at
`docs/superpowers/plans/2026-09-08-strapi-api-style-followups.md`.

## Before the first real deploy

- Create the MySQL database in the DreamHost panel; write `laravel/.env` on the host from
  `apps/camis-php-oyl/.env.example` (it now carries `APP_KEY=`; run
  `php artisan key:generate --force` once); point the API domain at `laravel/public`; confirm
  PHP 8.3+ with `intl`; make `storage/` and `bootstrap/cache/` writable; add `OYL_DH_SSH`,
  `OYL_DH_APP_ROOT`, `OYL_DH_SITE_URL` to the untracked root `.env`.
- ~~Deploy **before anyone registers**: the Strapi-style `username` migration adds a NOT NULL
  unique column with no default and fails on a non-empty `users` table.~~ Moot since the Strapi
  storage layout: Strapi owns the schema, there is no Laravel `username` migration.
- ~~`SANCTUM_TOKEN_EXPIRATION` is a no-op until camis emits `env('SANCTUM_TOKEN_EXPIRATION')` in
  the scaffolded `config/sanctum.php` (camis follow-up); set `'expiration'` by hand on the host
  meanwhile.~~ Moot since the Strapi storage layout: Sanctum is gone.
- `CAMIS_AUTH_THROTTLE_PER_MINUTE` (default 10) is baked by `config:cache`; login and register
  share one per-IP bucket until camis splits them into a named limiter.
- `pnpm deploy:dreamhost --dry-run` has never been run against a real host (no credentials
  existed during development); expect to iterate once on the remote login shell's PATH.
- Run the Strapi schema sync against the DreamHost MySQL (README "Schema sync") before
  `pnpm deploy:dreamhost`; `JWT_SECRET` on the host must equal Strapi's and be ≥ 32 bytes.

## Package (`apps/camis-php-oyl`)

- `tsconfig.json` extends `../../tsconfig.base.json` (unique in the repo; pulls the DOM lib into
  a Node-only package). Inline the options like `packages/ocari-oyl` if it ever matters.
- `scripts/generate-roles.ts`: the `names.plural` fallback `${name}s` is naive (never fires —
  every imported type carries `names.plural`); the KINDS-lookup throw reads "unregistered" for a
  key registered under `system`.
- `scripts/dev.mjs` is POSIX-only (fine for a dev script).
- Root `pnpm test` fails for anyone without the sibling camis checkout at `../camis` (pnpm only
  warns on a broken `link:`); the prerequisite is in the package README — consider a root
  README note or `it.skipIf` when `camis` is unresolvable.
- `pnpm deploy:dreamhost --dry-run` still runs the SSH preflight, requires a clean tree, and
  rebuilds `laravel/` locally before printing "nothing will change"; the wording overstates it.
- `shellcheck` was unavailable locally; the deploy script was checked with `bash -n` and by
  review only. The first `mkdir -p` over ssh runs under the remote default shell (mirrors
  `deploy-pi.sh`).
- `pnpm php-app import` is shadowed by pnpm's `import` subcommand — use
  `pnpm php-app run import` (rename the script if it keeps biting).

## Overlay

- `ConsumableProductApiController::existingByUpc` returns an existing UPC row to any
  authenticated caller without a `can('view')` check. Parity with strapi-oyl, and every API path
  that sets a UPC forces `visibility = public`, so only rows edited through the Filament admin
  could violate the invariant.
- The `$serializers` map in `overlay/routes/api-custom.php` is derivable from `$collections`
  via `class_basename`; kept explicit for IDE/static verifiability.
- `/bootstrap` issues 11 unpaginated queries ~~plus per-row child lazy-loads~~ (components are
  now preloaded with `StrapiComponents::load` per collection, and the owner/creator relation
  every per-row `can('view')` reads is eager-loaded from the `$owners` map, so the cost model
  matches the generated `index()` again); the eleven unpaginated queries remain — paginating a
  boot read is a camis-wide follow-up.

## e2e

- The PHP gate raises `CAMIS_AUTH_THROTTLE_PER_MINUTE` in `start-php-backend.mjs`, so throttling
  itself is not exercised by e2e; its only coverage is the camis unit test and smoke.
- `start-php-backend.mjs` mixes `spawnSync`/`spawn` argument styles (cosmetic).
- The e2e directory keeps single quotes / 100 columns rather than the root `.prettierrc`; a
  formatting sweep was deliberately left out of this work.
- Parked hardening on the PHP e2e starter, not done in this work: capture Strapi's `exit`
  promise at spawn time and race it with the health wait in `start-php-backend.mjs` (a leftover
  Strapi on 1341 can otherwise hang the gate until Playwright's timeout); register
  `SIGTERM`/`SIGINT` before spawning Strapi; pin `start-backend.mjs`'s `JWT_SECRET ??=` with a
  test.

## camis-side (tracked in the camis follow-ups doc)

- `camis import` drops Strapi `private: true` (e.g. `GoogleAccount.refreshToken`); moot here
  because `GoogleAccount` has no grant.
- ~~Scaffolded `config/sanctum.php` ignores `SANCTUM_TOKEN_EXPIRATION`.~~ Moot since the Strapi
  storage layout: Sanctum is gone.
- Login and register share one throttle bucket; `route:cache` bakes the rate.
- The generated `DEPLOY.md` does not mention `CACHE_STORE=file`/`SESSION_DRIVER=array`/
  `QUEUE_CONNECTION=sync` (camis follow-up); this package's `.env.example` carries them.
