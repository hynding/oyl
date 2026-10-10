# Cutover part 1 — Deploy `apps/stencil-oyl` to DreamHost — Design

**Date:** 2026-10-09
**Status:** reviewed (branch `feat/stencil-oyl-deploy`, stacked on `feat/stencil-oyl-profile`)
**Program:** Stencil front-end — sub-project 11 (see `2026-10-06-extract-client-layer-design.md`
§Program context: rows n+1 Prerender/SEO and n+2 Cutover). Depends on 10 (every screen
redesigned). Part 2 (sub-project 12) retires `apps/vanilla-oyl`.

## Purpose

Make `apps/stencil-oyl` the production front end: CI builds its `www/` and
`scripts/dreamhost/publish-www.sh` ships it into the same `DH_WWW_ROOT` vanilla occupies today
(a straight swap — the next master push after this merges replaces vanilla's files). Vanilla
stays in the repo, runnable locally, until part 2 deletes it. The prerender/SEO row (n+1) is
**dropped**: the app is account-required, so nothing but `/login` and `/register` is public;
its useful remainder — a real document `<head>` and per-route titles — lands here.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Prerender/SEO (n+1) | **No hydrate output target, no prerender step.** `index.html` gets `description`/`theme-color`/`og:*` meta; the router sets `document.title` per route ("Journal · OYL"). |
| Shape | **Two sub-projects:** 11 deploy (this), 12 retire vanilla. |
| Swap | **Straight swap** into the existing root; vanilla's files go with `rsync --delete`. |

## What changes

### `apps/stencil-oyl` becomes the deployed app

- **Deploy seam** already exists: `<meta name="oyl-api-base" content="">` in `src/index.html`,
  read by `boot/compose.ts` (`getApiBaseUrl(storage, host, metaBase)`). `publish-www.sh`
  injects `DH_API_BASE` into it exactly as it does for vanilla (the regex accepts both
  `… />` and `…>` — Stencil emits the latter).
- **`apps/stencil-oyl/deploy/htaccess.template`** — vanilla's, re-scoped:
  - SPA fallback excludes the real asset roots: `RewriteCond %{REQUEST_URI} !^/(build|themes)/`
    and `!^/tokens\.css$` (a typo'd `/build/x.js` must 404, not 200 HTML).
  - Cache: `/build/p-<hash>.js`, `p-<hash>.entry.js` and `p-<hash>.css` are content-hashed →
    `Cache-Control: public, max-age=31536000, immutable` (regex
    `^p-[A-Za-z0-9_-]+(\.entry)?\.(js|css)$`); everything else (`index.html`, the unhashed
    `oyl.esm.js`/`oyl.js`/`index.esm.js`/`oyl.css` — none referenced by the built `index.html`,
    `/tokens.css`, `/themes/*.css`) → `max-age=0, must-revalidate` (`index.html` stays
    `no-cache`). mod_headers applies `<FilesMatch>` sections in order and `set` replaces, so the
    generic `.js|.css` rule comes FIRST and the immutable block after it.
  - Stencil's www target inlines every root-absolute stylesheet under 3 KB, so the themes and
    `tokens.css` are `<style>` blocks in the built `index.html` and nothing requests `/themes/`
    or `/tokens.css` at runtime today; they are still staged as the safety net for a sheet that
    grows past the limit (it would stay a `<link>`).
  - CSP: unchanged shape — `script-src 'self' <hashes of inline scripts>`; the built
    `index.html` has exactly two scripts: the anti-FOUC inline one (hashed) and Stencil's
    `<script type="module" src="/build/p-….js" data-stencil …>` (`'self'`). Stencil's lazy
    loader uses `import()` + `import.meta.url`, no `eval`; `style-src 'self' 'unsafe-inline'`
    already covers the `<style>` blocks Stencil inlines for the linked token/theme sheets and
    the components' adopted stylesheets; `img-src 'self' data:` covers `ui-icon` (inline SVG).
    `connect-src 'self' <api origin>` unchanged.
- **Shared renderer:** `apps/vanilla-oyl/deploy/{csp-hashes,render-htaccess}.js` move to
  `scripts/dreamhost/lib/{csp-hashes,render-htaccess}.mjs` — `.mjs` because the root package
  has no `"type": "module"` (vanilla's did) and Node 22.0–22.6 would refuse a bare `.js` ESM
  file at publish time, after the api had already shipped. They are app-agnostic (hash the
  inline scripts of an HTML file; fill `__CSP_HEADER__`/`__CSP_SCRIPT_HASHES__`/`__API_ORIGIN__`
  in a template). Their unit tests and the CLI test move to `apps/camis-php-oyl/test/` (which
  already guards the deploy scripts) importing by relative path — no vitest `include` change
  (a `../../` include would crawl the whole repo). `scripts/dreamhost/render-htaccess.mjs`
  replaces `apps/vanilla-oyl/scripts/render-htaccess.mjs` (+ its test) and takes `--template
  <file>`. Vanilla's `deploy/htaccess.template` stays until part 2; vanilla's deploy README
  notes the move. Type-checking of the two modules (vanilla's `checkJs`) lapses with the move —
  accepted; the tests cover them.
- **`publish-www.sh`** ships a Stencil `www/`:
  - `DH_WWW_SRC` default → `apps/stencil-oyl/www`; `DH_HTACCESS_TEMPLATE` default →
    `apps/stencil-oyl/deploy/htaccess.template` (both remain seams for the tests).
  - Pre-flight: `index.html` + the `oyl-api-base` meta (as today); `build/oyl.esm.js` must exist
    AND `index.html` must reference the hashed loader (`src="/build/p-`) — a `--dev` build
    (which `stencil-test`/`pnpm stencil dev` also write to `www/`) is refused ("run `pnpm
    stencil build` first"; replaces the `vendor/all-of-oyl` check).
  - Staging: `index.html`, `build/`, `themes/`, `tokens.css`, `favicon.svg`; **not**
    `host.config.json` (a dev-server artifact at the `www/` root) and not `*.map` (nothing to
    debug in production; keeps the upload small — 1.9 MB `build/` is mostly maps). The
    `*.test.js` sweep goes (nothing emits tests).
  - Health checks: `/` 200; `/journal` 200 + contains `<oyl-app`; `/build/does-not-exist.js`
    404; `/DEPLOYED` 403; `nosniff` header present (as today, with the asset-root path changed).
- **CI + wrapper:** `.github/workflows/deploy.yml` and `scripts/deploy-dreamhost.sh` run
  `pnpm stencil build` (chains `all-of build` + `ui build`) instead of `pnpm vanilla build:lib`,
  still before the SSH key is loaded. `apps/camis-php-oyl/test/deploy-dreamhost.test.ts` /
  `publish-www.test.ts` guard the new commands and a Stencil-shaped fixture.
- **Head + titles:** `src/index.html` gets `<meta name="description" content="Organize Your
  Life — journal, plans, nutrition, finance, vault, goals and insights in one place.">`,
  `<meta name="theme-color" …>` (one per `prefers-color-scheme`), `og:title`/`og:description`,
  and `<link rel="icon" href="/favicon.svg">` with a small SVG favicon at `src/favicon.svg`
  copied into `www/` by `stencil.config.ts` (not under `src/assets/`, which Stencil's default
  copy task would duplicate); the SPA fallback excludes `/favicon.(svg|ico)` so a browser's
  `/favicon.ico` probe 404s instead of getting HTML.
  `boot/compose.ts`'s route effect sets `document.title` = `${label} · OYL` for nav routes
  (`NAV_ITEMS` labels), `Profile · OYL`, `Sign in · OYL` / `Register · OYL`, `Not found · OYL`;
  pure `titleFor(route)` in `boot/titles.ts` with a unit test; the routing e2e asserts
  `toHaveTitle` on two routes.

### What does NOT change

- `APP_URL`/CORS on the api: production is the same site origin after the swap, so the Google
  OAuth callback keeps working; the e2e backend keeps `APP_URL` = vanilla's 8042 until part 2.
- `apps/vanilla-oyl` keeps building and running locally (`pnpm vanilla dev`, its tests, its
  e2e projects). Only deployment moves.
- The api deploy (`publish-api.sh`) and its ordering (api before www).

## Verification

- **Unit:** `scripts/dreamhost/lib/*.test.js` (moved as-is); `boot/titles.unit.ts`.
- **Script tests (camis-php-oyl):** `publish-www.test.ts` fixture becomes a Stencil `www/`
  (`index.html` with the anti-FOUC inline script + the `data-stencil` module script + the meta,
  `build/oyl.esm.js`, `build/p-abc.js`, `build/p-abc.js.map`, `build/host.config.json`,
  `themes/classic.css`, `tokens.css`): staged file list has no `.map`/`host.config.json`; the
  rendered `.htaccess` carries the hashed inline script, the `build|themes` exclusion, the
  immutable rule; the pre-flight fails without `build/oyl.esm.js`; `deploy-dreamhost.test.ts`
  expects `pnpm stencil build` before the ssh steps and no `pnpm vanilla build:lib`.
- **Local:** `pnpm deploy:dreamhost --dry-run --only www` from a machine with the `OYL_DH_*`
  config shows the rsync delta (operator step, after merge — can't run from CI/sandbox).
- **e2e:** stencil projects green (titles); vanilla projects untouched.
- **Production acceptance (operator, after the first master push):** the site serves the
  Stencil shell, sign-in works against the api, theme switch persists, a deep link
  (`/journal`) and a typo'd `/build/x.js` behave; the CI summary's health checks pass.
  Recommended: set the repo variable `DH_CSP_HEADER=Content-Security-Policy-Report-Only` for
  the first swap push (the e2e serves `www/` without headers, so the rendered CSP is first
  enforced on the live site), check the browser console, then unset it and re-run the
  workflow.

## Risks

| Risk | Mitigation |
|---|---|
| CSP blocks something Stencil needs at runtime | The built `index.html` has only the two scripts above; a `Content-Security-Policy-Report-Only` first run is one `DH_CSP_HEADER` variable away (existing seam). |
| Stale `index.html` referencing hashed chunks that `--delete` removed | `index.html` is `no-cache`; chunks are immutable per hash and a new deploy ships a new set — the usual hashed-asset contract. |
| The swap removes vanilla with no soak | Decision: straight swap (personal app). Rollback = revert the merge and push (CI redeploys vanilla). |
| `DH_FIRST_DEPLOY` guard | The root carries `DEPLOYED` from vanilla's deploys, so the guard passes without the flag. |
