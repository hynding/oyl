# e2e-oyl — Playwright browser suite

Conventions (hygiene allowances, per-test users, unique catalog names, backed-vs-unbacked persistence asserts): **`README.md`** — read it before writing a spec.

- Real app against real backend, fresh SQLite DB, dedicated ports: vanilla 8042, stencil-oyl 8043, backend 1341, fake Google 1342 (`scripts/start-fake-google.mjs`). Servers auto-start from `playwright.config.ts`.
- Projects: `desktop`/`mobile` (Pixel 7) over `tests/` (vanilla); `stencil-desktop`/`stencil-mobile` over `tests-stencil/`.
- The auto **hygiene fixture fails any test on console errors/warnings, page errors, or 4xx/5xx** — negative paths declare `hygiene.allow(...)`.
- Admin-only screens: `test.use({ admin: true })`.
- Shadow-host text: `deepText()` from `tests-stencil/lib.ts`; poll it (`expect.poll`) right after a `toHaveCount`.
- Run with `--workers=4` on this machine (default parallelism saturates it → hangs/ECONNRESET). `PW_CHROMIUM_PATH=<binary>` uses a preinstalled Chromium.
- Stale servers: after strapi `src/` changes, `pnpm strapi-app build` + kill :1341; after `all-of-oyl/src` changes, `pnpm vanilla build:lib` if the vanilla server is running.
- `pnpm --filter @oyl/e2e-oyl typecheck`.
