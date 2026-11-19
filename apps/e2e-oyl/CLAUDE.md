# e2e-oyl — Playwright browser suite

Conventions (hygiene allowances, per-test users, unique catalog names, backed-vs-unbacked persistence asserts): **`README.md`** — read it before writing a spec.

- Real app against real backend, fresh SQLite DB, dedicated ports: app (stencil-oyl `www/` build) 8043, backend 1341, fake Google 1342 (`scripts/start-fake-google.mjs`). Servers auto-start from `playwright.config.ts`.
- Projects: `desktop`/`mobile` (Pixel 7) over `tests/` (stencil-oyl; vanilla has no e2e since the cutover).
- The auto **hygiene fixture fails any test on console errors/warnings, page errors, or 4xx/5xx** — negative paths declare `hygiene.allow(...)`.
- Status is admin-only: a spec that opens `/status` needs `test.use({ admin: true })`; plain users (incl. Google-created accounts) land on `/journal`.
- Shadow-host text: `deepText()` from `tests/lib.ts`; poll it (`expect.poll`) right after a `toHaveCount`.
- Run with `--workers=4` on this machine (default parallelism saturates it → hangs/ECONNRESET). `PW_CHROMIUM_PATH=<binary>` uses a preinstalled Chromium.
- Stale servers: after strapi `src/` changes, `pnpm strapi-app build` + kill :1341; the app server runs `pnpm stencil build` only on a cold start — after changing all-of-oyl, ui-oyl or the app, kill :8043.
- `E2E_BACKEND=php`: `laravel/` is a local generated build that the e2e script only checks exists — after overlay changes run `pnpm php-app build` first, or new routes 404 and the hygiene fixture fails nearly every test.
- `pnpm --filter @oyl/e2e-oyl typecheck`.
