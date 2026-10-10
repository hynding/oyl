# Cutover part 2 — Retire `apps/vanilla-oyl` — Design

**Date:** 2026-10-09
**Status:** reviewed (branch `feat/retire-vanilla-oyl`, stacked on `feat/stencil-oyl-deploy`)
**Program:** Stencil front-end — sub-project 12, the last (see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 11 (stencil-oyl is the
deployed www).

## Purpose

Delete `apps/vanilla-oyl` and everything that existed only for it, so the repo has one front end.
The app is preserved in git history (tag `vanilla-oyl/retired-2026-10-09` on the last commit that
has it, as `legacy/2026-06-16` preserves the earlier stack). Coverage vanilla's e2e had and
stencil's did not is ported first; the e2e backend's `APP_URL` becomes the stencil origin so the
Google OAuth journeys run against the stencil app. Vanilla's own e2e projects are dead from that
moment (their OAuth callback lands on 8043) and are deleted in the same sub-project.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| e2e parity before deletion | **Port a11y, connection and the Google OAuth journeys** to `tests-stencil/`. `layouts`/`widgets` stay dropped (no layouts/widgets by design); `seed` is already covered by stencil's `status.spec`. |
| docker compose app service | **`stencil` service on 3344** (`pnpm stencil dev` against the composed backend on 3340) replaces `vanilla`. |
| `pnpm dev` | **Backend + the Stencil dev server on 3344**; `dev:stencil`, `--stencil` and `--watch` (vendoring) go away; `dev:fresh` stays. |

## What goes

- `apps/vanilla-oyl/` entirely (src, styles, test, deploy, scripts, vendor, Dockerfile bits).
- Root `package.json`: the `vanilla` filter shortcut, `dev:watch`, `dev:stencil`; `dev:fresh`
  loses its `--watch`.
- `scripts/dev.mjs`: the vanilla branch (vendoring, `--watch`, `--stencil`); it always serves
  stencil on 3344 and checks that port.
- `docker-compose.yaml` + `Dockerfile.app`: the `vanilla` service and its `COPY`; a `stencil`
  service (`pnpm stencil dev`, port 3344 — Stencil's dev server binds `0.0.0.0` by default) in
  its place; the Dockerfile copies `apps/stencil-oyl/package.json` and
  `packages/ui-oyl/package.json` instead (never `camis-php-oyl`'s — its `link:` dependency has
  no target in the image). `docker compose build` cannot run in the sandbox — an operator check.
- `apps/e2e-oyl`: the vanilla `desktop`/`mobile` projects, the `tests/` tree, the vanilla
  web server (`http-server ../vanilla-oyl` on 8042) and `APP_PORT`/`APP_URL` for it. The
  stencil suite becomes THE suite: `tests-stencil/` → `tests/`, projects `stencil-desktop`/
  `stencil-mobile` → `desktop`/`mobile`, one top-level `baseURL` (8043), and `tsconfig.json`
  includes `tests/**` (today `tests-stencil/` is not type-checked at all). `lib/actions.ts`
  keeps exactly what the stencil specs import (`inlineConfirm`, `awaitOutboxDrained`,
  `primeLocalMode`, `deepActiveElement`); `navTo`/`addNote` there are vanilla's (the stencil
  `lib.ts` has its own). The backend's `E2E_APP_ORIGIN` default and `APP_URL` become the stencil
  origin (8043); CORS lists the 8043 forms only.
- `packages/ui-oyl/src/global/themes.unit.ts`: the byte-equality test against vanilla's theme
  files and the theme-manager name list → the library's own list is asserted (the eight theme
  files, each declaring `:root[data-theme="<its name>"]`, the existing colour-token check);
  ui-oyl becomes the source of the themes. The cross-package drift guard moves to stencil-oyl's
  `boot/theme.unit.ts` (which today reads vanilla's `theme-catalog.js`): `THEMES` equals the
  ui-oyl `themes/` listing and each catalog preview colour is a substring of its theme file.
- `apps/strapi-oyl` defaults that named vanilla's dev port: `APP_URL` default (`google-config.ts`)
  and `.env.example` → `http://localhost:3344`; the CORS default drops 8041 (3344 is listed).
- `packages/all-of-oyl`: the `dist/` build and `scripts/check-no-bare-imports.mjs` **stay** —
  stencil-oyl bundles from `dist/` (the Rollup resolver) and the guard is cheap insurance; the
  README/CLAUDE.md wording "consumed only by vanilla via an importmap" changes to "bundled by
  stencil-oyl". `src/client/data-fake.ts` / `session/route.ts` comments that mention vanilla
  are reworded where they describe current behaviour; "ported from vanilla" history notes in
  stencil-oyl's `format.ts` files stay (they are history).
- `README.md`, `CONTRIBUTING.md`, CLAUDE.md: the vanilla rows/commands go; stencil-oyl is "the
  front end"; the port map loses 8041/8042; the gotchas that only applied to vanilla
  (root-absolute `index.html` paths, the http-server proxy 200 masking, `OylElement`
  `baseStyles`, the vendored `dist` importmap, "change a theme in vanilla first") are removed
  or re-homed.
- `.claude/settings.local.json` entries naming vanilla paths (if any) are pruned.

## What is ported (tests-stencil)

- **`a11y.spec.ts`** (from `tests/a11y.spec.ts`): `html[lang=en]`; `oyl-nav` / `oyl-account-menu`
  nav landmarks labelled "Primary"/"Account" (stencil's `ui-nav` renders the `<nav>` — the
  selector adapts); `oyl-shell main` visible; navigating announces the route in the router's
  live region and moves focus to the screen's `h2[tabindex=-1]`; the active nav link carries
  `aria-current=page`; the inline-confirm cluster focuses **No** first (on `oyl-item-row` after
  `addExpense`); form controls expose accessible names; the boot-failure notice is visible with a
  dismiss control named "Dismiss" that hides it. Two stencil gaps this exposes are closed here:
  `oyl-router` gains a persistent polite live region ("Navigated to <route>", sr-only by inline
  style — the router has no shadow/stylesheet) and focuses the first `h2[tabindex=-1]` found by
  walking open shadow roots after the screen's `componentOnReady()` (Journal/Planner/Nutrition
  keep theirs inside `oyl-day-nav`'s shadow), on route changes only, bailing if the route moved
  on meanwhile; `ui-button` forwards the host's `aria-label` to its inner control (today
  `ui-notice`'s dismiss button and `oyl-day-nav`'s arrows have EMPTY accessible names — a real
  a11y defect). The notice stays `role=status` (its tone is `warn`; `ui-notice` reserves
  `alert` for `danger`).
- **`connection.spec.ts`** (from `tests/connection.spec.ts`): on `/status`, an invalid URL is
  rejected inline (`ui-field[name=apiBaseUrl]` error "Enter a valid http(s) URL.") without
  applying — stencil's `oyl-status` validates nothing today, so it gains vanilla's rule
  (`new URL(u).protocol` is http/https; an empty URL is allowed and clears the key → default);
  the mode `select[name=mode]` reflects the active mode; Apply & reload with an equivalent URL
  (`http://127.0.0.1:1341/api`) persists `oyl/api-base-url` and the app reboots signed in.
- **`status.spec.ts`** gains vanilla's `?seed` boot test (an empty account is seeded at boot,
  never twice) — `compose.ts` implements it and nothing covered it.
- **`google-auth.spec.ts`** (from `tests/google-auth.spec.ts`, verbatim journeys on stencil
  selectors: `oyl-login oyl-auth-form a[data-act=google]`, `oyl-account-menu ui-button[data-act=
  logout]`, `oyl-profile ui-button[data-act=google-connect] button`, `[data-role=google-drive]`
  deep text, `ui-button[data-act=google-disconnect] button`); skipped under `E2E_BACKEND=php`.
  Works because the e2e backend's `APP_URL` is now the stencil origin — no backend change.

## Verification

- `pnpm test` / `pnpm typecheck` at the root (CI gate) with vanilla gone: ui-oyl (new themes
  test), all-of-oyl, stencil-oyl, strapi, camis (deploy-script guards unchanged from part 1),
  e2e typecheck; `pnpm e2e` = the two stencil projects only, green including the three ported
  specs; `pnpm stencil build`; `pnpm dev` boots backend + stencil (smoke: the script's health
  gate passes); `docker compose config` validates.
- `grep -rn vanilla` outside `docs/` and git history returns only deliberate history notes.

## Risks

| Risk | Mitigation |
|---|---|
| A stencil gap surfaces while porting a11y/connection | Fix it in stencil-oyl in this sub-project (small), as the Goals review fixed a vanilla bug; record in amendments. |
| Something still imported vanilla paths | The root typecheck + `pnpm e2e` + `docker compose config` + a final grep. |
| Losing the ability to compare against vanilla | The tag; `git show vanilla-oyl/retired-2026-10-09:apps/vanilla-oyl/<path>`. |
