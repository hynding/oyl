# camis-php-oyl — production API (Laravel, camis-generated)

Laravel 12 app serving the same Strapi-shaped API as strapi-oyl **on the same database** (camis `storageLayout: "strapi"`; Strapi owns schema + roles; JWTs are shared), for DreamHost shared hosting. Details: `README.md`.

- Committed: `camis.config.json`, `camis.json` (imported from `../strapi-oyl`), `roles.json` (derived from `KINDS`), `overlay/` — the OYL rules strapi-oyl also hand-codes: `/bootstrap`, `/google/config`, `/access` (`app/Support/OylAdmins.php` + `config/oyl.php`), UPC, money.minor as a number.
- `laravel/` is generated + git-ignored — never edit it. Links `@camis/cli` from sibling checkout `../../../camis`; CI pins `hynding/camis` via `CAMIS_REF` in `.github/workflows/deploy.yml`.
- `pnpm php-app run import` regenerates `camis.json` + `roles.json` (commit both; tests fail on drift). New models also go in `overlay/routes/api-custom.php`'s `$collections`/`$serializers` maps.
- `pnpm php-app build` (scaffold + camis build), `pnpm php-app dev` (port 1340 — never alongside `strapi-app develop`).

## Tests

- `pnpm php-app test` (IR + roles drift guards, overlay `php -l`, deploy/build/dev/e2e script guards); `pnpm php-app typecheck`.
- Acceptance: `E2E_BACKEND=php pnpm e2e` (boots strapi-oyl to create the DB, then PHP on it).

## Deploy

`.github/workflows/deploy.yml` deploys `master` on every push (gate: `pnpm test` + `pnpm typecheck`), api then www, via `scripts/dreamhost/publish-{www,api}.sh`. **Schema change ⇒ Strapi sync before pushing to master** (boot strapi-oyl against the target DB — see README "Schema sync"); otherwise `camis:strapi-schema-check` fails *after* the api upload and the new api runs against the old schema until synced and re-run.
