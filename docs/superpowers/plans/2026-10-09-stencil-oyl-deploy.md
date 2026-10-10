# Cutover part 1 — Deploy `apps/stencil-oyl` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship `apps/stencil-oyl`'s `www/` through the existing DreamHost pipeline (CI + `deploy-dreamhost.sh` → `publish-www.sh` → rsync) in place of vanilla's static files, with a Stencil-scoped `.htaccess` (SPA fallback, hashed CSP, immutable chunks) and a real document head + per-route titles. Vanilla stays in the repo, undeployed, until part 2.

**Architecture:** the app-agnostic renderer (`csp-hashes.js`, `render-htaccess.js`) moves to `scripts/dreamhost/lib/`; `publish-www.sh` gains `DH_HTACCESS_TEMPLATE` next to the existing `DH_WWW_SRC` seam and stages the Stencil asset roots; `apps/stencil-oyl/deploy/htaccess.template` is the Stencil template; titles come from a pure `titleFor(route)` applied in `compose.ts`'s boot (an `effect` over the route signal).

**Tech Stack:** bash + node scripts, vitest (camis-php-oyl guards the scripts), Stencil app.

**Spec:** `docs/superpowers/specs/2026-10-09-stencil-oyl-deploy-design.md`

## Global Constraints

- **Branch** `feat/stencil-oyl-deploy` (stacked on `feat/stencil-oyl-profile`; spec commit `f8d4732`, reviewed + amended in this commit). One commit per task; session trailer; never commit on red; no push/PR unless asked.
- The deploy scripts are git-tracked and must never hold a host, user, path or secret (all config via env). `scripts/dreamhost/publish-www.sh` keeps every existing guard (root path, api-root overlap, first-deploy marker, `.well-known/` exclusion, dry-run) — only staging/pre-flight/health-check paths change.
- **Gates:** `pnpm php-app test` (script guards), `pnpm vanilla test` (until its deploy tests move), `pnpm stencil test|typecheck|build`, stencil e2e projects for the title change (`PW_CHROMIUM_PATH`, `--workers=4`, ports 1341/1342/8043 freed). The vanilla e2e projects are untouched.
- Nothing in `.github/workflows/deploy.yml` after the ssh-agent step may run a build (the workflow test enforces it).

---

## Task 1: shared htaccess renderer

**Files:** `scripts/dreamhost/lib/{csp-hashes,render-htaccess}.mjs` (moved from `apps/vanilla-oyl/deploy/*.js`), `apps/camis-php-oyl/test/{csp-hashes,render-htaccess,render-htaccess-cli}.test.ts` (the vanilla tests moved, importing `../../../scripts/dreamhost/lib/*.mjs` by relative path — no vitest `include` change), `scripts/dreamhost/render-htaccess.mjs` (replaces `apps/vanilla-oyl/scripts/render-htaccess.mjs` + its `.test.mjs`), `apps/vanilla-oyl/vitest.config.js` + `tsconfig.json` (drop the `deploy/**` and `scripts/**` includes), `apps/vanilla-oyl/deploy/README.md`

- [x] **Step 1:** `git mv` the two modules to `scripts/dreamhost/lib/*.mjs` (`.mjs` — the root has no `"type": "module"`); drop csp-hashes' vanilla-specific "no node:* / types: []" comment. Move their tests + the CLI test into `apps/camis-php-oyl/test/` as `.test.ts` (allowJs is on); the CLI test runs `scripts/dreamhost/render-htaccess.mjs --template <fixture> --html <fixture>` and the argument validation cases. `scripts/dreamhost/render-htaccess.mjs` = the old script with a required `--template <file>` (validated like the others) importing from `./lib/`. Delete `apps/vanilla-oyl/scripts/render-htaccess.mjs` + `.test.mjs`; vanilla's `deploy/README.md` points at the shared script (vanilla's template stays for one more sub-project). `pnpm vanilla test|typecheck` stay green (their includes no longer mention `deploy/`).
- [x] **Step 2:** `publish-www.sh` calls the shared script with `--template "$TEMPLATE"` where `TEMPLATE="${DH_HTACCESS_TEMPLATE:-$REPO_ROOT/apps/vanilla-oyl/deploy/htaccess.template}"` (the default flips in Task 3). `publish-www.test.ts` passes `DH_HTACCESS_TEMPLATE` explicitly from a fixture template so the test is default-independent.
- [x] **Step 3: gate + commit** — `refactor(deploy): shared htaccess renderer under scripts/dreamhost/lib` (`pnpm php-app test`, `pnpm vanilla test`).

## Task 2: Stencil deploy template + head + titles

**Files:** `apps/stencil-oyl/deploy/htaccess.template`, `apps/stencil-oyl/src/index.html`, `apps/stencil-oyl/src/assets/favicon.svg` (copied via `stencil.config.ts` `copy` → `www/favicon.svg`), `apps/stencil-oyl/src/boot/titles.ts` + `titles.unit.ts`, `apps/stencil-oyl/src/boot/compose.ts`, `apps/e2e-oyl/tests-stencil/routing.spec.ts`

- [x] **Step 1: template** — vanilla's with: `RewriteCond %{REQUEST_URI} !^/(build|themes)/` and `RewriteCond %{REQUEST_URI} !^/(tokens\.css|favicon\.(svg|ico))$`; the generic `<FilesMatch "\.(js|css)$"> max-age=0, must-revalidate` FIRST, then `<FilesMatch "^p-[A-Za-z0-9_-]+(\.entry)?\.(js|css)$"> Cache-Control "public, max-age=31536000, immutable"` (mod_headers applies sections in order; `set` replaces); `index.html` `no-cache`; CSP line unchanged. `apps/camis-php-oyl/test/stencil-htaccess.test.ts` renders the committed template with the shared renderer over `apps/stencil-oyl/src/index.html` (its inline script is byte-identical to the built one) and asserts: exactly one hash, the `build|themes` + `tokens.css|favicon` exclusions, the immutable rule's `indexOf` > the must-revalidate rule's, `p-abc.entry.js` matches the immutable regex and `oyl.esm.js` does not, no placeholder survives.
- [x] **Step 2: head** — `index.html`: `<meta name="description" …>`, `<meta name="theme-color" content="#f7f6f2" media="(prefers-color-scheme: light)">` + dark counterpart, `og:title`/`og:description`/`og:type=website`, `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`; a 64×64 SVG favicon at `src/favicon.svg` (rounded square in the accent blue with a white "O" ring — original, no brand; NOT under `src/assets/`, which Stencil's default copy task would duplicate). `stencil.config.ts` `copy: [{ src: 'favicon.svg' }]` → `www/favicon.svg`.
- [x] **Step 3: titles** — `boot/titles.ts`: `titleFor(route: string): string` → nav items by label (`NAV_ITEMS`), `profile` → "Profile", `login` → "Sign in", `register` → "Register", else "Not found"; all `${label} · OYL`. Unit test. `compose.ts`: after `routeState.start()`, `effect(() => { doc.title = titleFor(routeState.route.get()) })` — `BootWindow.document` gains `title: string` (the unit fake gets it). `routing.spec.ts`: `/journal` → `toHaveTitle('Journal · OYL')`, after `navTo('goals')` → `'Goals · OYL'`, `/nope` → `'Not found · OYL'`.
- [x] **Step 4: gate + commit** — `feat(stencil-oyl): deploy template, document head, per-route titles` (`pnpm stencil test|typecheck|build`, `pnpm php-app test`, stencil e2e routing spec).

## Task 3: publish-www ships the Stencil build; CI + wrapper build it

**Files:** `scripts/dreamhost/publish-www.sh`, `.github/workflows/deploy.yml`, `scripts/deploy-dreamhost.sh`, `apps/camis-php-oyl/test/{publish-www.test.ts,deploy-dreamhost.test.ts,workflow.test.ts}`, `apps/vanilla-oyl/deploy/README.md` → the deploy doc moves to `apps/stencil-oyl/deploy/README.md` (vanilla's becomes a pointer)

- [x] **Step 1: failing script tests** — fixture = a Stencil `www/`: `index.html` (anti-FOUC inline script, `<script type="module" src="/build/p-1.js" data-stencil …>`, `<meta name="oyl-api-base" content="">` without the self-closing slash), `build/oyl.esm.js`, `build/p-1.js`, `build/p-1.js.map`, `host.config.json`, `themes/classic.css`, `tokens.css`, `favicon.svg`; expectations: staged files exactly `./.htaccess ./DEPLOYED ./build/oyl.esm.js ./build/p-1.js ./favicon.svg ./index.html ./themes/classic.css ./tokens.css`; the meta injected (regex tolerant of `>` vs `/>`; the injected tag is normalized to `… />`); one `sha256-` hash; the pre-flight without `build/oyl.esm.js` OR with an `index.html` lacking `src="/build/p-` (a dev build) fails naming `pnpm stencil build`; the fake `curl` answers `*/build/does-not-exist.js` → 404 and prints `<oyl-app` for `/journal` (replacing the importmap/vendor answers); `deploy-dreamhost.test.ts` expects `pnpm stencil build` (not `pnpm vanilla build:lib`) between the dirty-tree check and the publish steps; `workflow.test.ts` expects `run: pnpm stencil build` after `pnpm php-app build` and before `webfactory/ssh-agent`, nothing building after the key.
- [x] **Step 2: implement** — `publish-www.sh`: `SRC` default `apps/stencil-oyl/www`, `TEMPLATE` default `apps/stencil-oyl/deploy/htaccess.template`; pre-flight on `build/oyl.esm.js` + `grep -q 'src="/build/p-' index.html`; stage `index.html build themes tokens.css favicon.svg` (each present → copied; `host.config.json` lives at the `www/` root so it is never staged), then `find "$STAGE" -name '*.map' -delete`; health checks `/build/does-not-exist.js` → 404 and `/journal` body contains `<oyl-app`; the "staging …" echo updated. Workflow + wrapper: `pnpm stencil build` (wrapper echo "Building the Stencil app (all-of-oyl + ui-oyl + www)", NOT silenced — Stencil logs diagnostics to stdout).
- [x] **Step 3: docs** — `apps/stencil-oyl/deploy/README.md` (what publish-www does for this app, the `DH_*` variables, the first-deploy note, rollback = revert + push); `apps/vanilla-oyl/deploy/README.md` reduced to "no longer deployed since cutover part 1; see apps/stencil-oyl/deploy".
- [x] **Step 4: gate + commit** — `feat(deploy): publish stencil-oyl's www to DreamHost` (`pnpm php-app test`).

## Task 4: Full gates + docs

- [x] **Step 1:** `pnpm test` and `pnpm typecheck` at the root (the CI gate), stencil e2e projects green.
- [x] **Step 2: docs** — spec status → implemented (+ amendments); plan ticked; CLAUDE.md: stencil-oyl row gains **Production** (DreamHost; `apps/stencil-oyl/deploy/htaccess.template` + the `oyl-api-base` meta filled by `publish-www.sh`; per-route titles), vanilla-oyl row's Production sentence → "no longer deployed (cutover part 1); retired in part 2", the deploy workflow line (`pnpm stencil build`), "What this is" line; program table row 11 implemented.
- [x] **Step 3: commit** — `docs: cutover part 1 implemented; spec statuses`.
