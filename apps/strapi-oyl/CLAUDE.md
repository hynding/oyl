# strapi-oyl — Strapi 5 backend (owns the schema)

Relational content-types: personal (owner-scoped, e.g. `note`) and catalog (`creator` + public-or-mine visibility, e.g. `activity`). Owner-scoped REST endpoints; writes upsert by domain `recordId`. SQLite for dev/test (`.tmp/data.db`), Postgres (`oyl_app`) in compose. camis-php-oyl serves the same API on the same database, so **Strapi owns the schema and roles**.

- Routes mount under `/api` → `ApiClient` base URL is `http://host/api`. JWT-gated; the `authenticated` role gets only the relevant content-type actions via bootstrap (`src/index.ts`). CORS (`config/middlewares.ts`) allows `http://localhost:8041`.
- `GET /api/bootstrap` (`src/api/bootstrap/`) returns every backed collection keyed by REST plural path — add new content-types to this controller.
- `GET /api/access` → `{ admin }` (`src/api/access/` + `src/utils/admins.ts`, env `OYL_ADMIN_EMAILS`). Keep the matcher in step with camis-php-oyl's `app/Support/OylAdmins.php` (a php-app test cross-checks).
- Google sign-in + Drive is server-brokered (`src/api/google/`): backend owns the OAuth code exchange + token storage; callback redirects to the single `APP_URL` and hands the session back as `#google=<jwt>`. Scope `drive.file` only. Unset `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` hides the feature entirely.

## Build / tests

- **`strapi build` must precede `tsc --noEmit` and tests** (regenerates `types/generated/contentTypes.d.ts`; tests run from `dist/`).
- New content-type: run `strapi ts:generate-types` to register the UID, then use `as const` (never `as any`).
- `pnpm --filter @oyl/strapi-oyl-app test` (schema parity + endpoint smoke); `pnpm --filter @oyl/strapi-oyl-app exec tsc --noEmit`.
- After `src/` changes with e2e running: `pnpm strapi-app build` + kill the process on :1341 so it reboots fresh.
- Adding a content type: follow the checklist in the root `CLAUDE.md`.
