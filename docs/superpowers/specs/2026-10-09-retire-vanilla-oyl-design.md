# Cutover part 2 — Retire `apps/vanilla-oyl` — Design

**Date:** 2026-10-09
**Status:** draft (branch `feat/retire-vanilla-oyl`, stacked on `feat/stencil-oyl-deploy`)
**Program:** Stencil front-end — sub-project 12, the last (see
`2026-10-06-extract-client-layer-design.md` §Program context). Depends on 11 (stencil-oyl is the
deployed www).

## Purpose

Delete `apps/vanilla-oyl` and everything that existed only for it, so the repo has one front end.
The app is preserved in git history (tag `vanilla-oyl/retired-2026-10-09` on the last commit that
has it, as `legacy/2026-06-16` preserves the earlier stack). Coverage vanilla's e2e had and
stencil's did not is ported first; the e2e backend's `APP_URL` becomes the stencil origin so the
Google OAuth journeys run against the stencil app.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| e2e parity before deletion | **Port a11y, connection and the Google OAuth journeys** to `tests-stencil/`. `layouts`/`widgets` stay dropped (no layouts/widgets by design); `seed` is already covered by stencil's `status.spec`. |
| docker compose app service | **`stencil` service on 3344** (`pnpm stencil dev` against the composed backend on 3340) replaces `vanilla`. |
| `pnpm dev` | **Backend + the Stencil dev server on 3344**; `dev:stencil`, `--stencil` and `--watch` (vendoring) go away; `dev:fresh` stays. |

## What goes

- `apps/vanilla-oyl/` entirely (src, styles, test, deploy, scripts, vendor, Dockerfile bits).
- Root `package.json`: the `vanilla` filter shortcut, `dev:watch`, `dev:stencil`.
- `scripts/dev.mjs`: the vanilla branch (vendoring, `--watch`, `--stencil`); it always serves
  stencil on 3344 and checks that port.
- `docker-compose.yaml` + `Dockerfile.app`: the `vanilla` service and its `COPY`; a `stencil`
  service (`pnpm stencil dev`, port 3344) in its place; the Dockerfile copies
  `apps/stencil-oyl/package.json` and `packages/ui-oyl/package.json` instead.
- `apps/e2e-oyl`: the vanilla `desktop`/`mobile` projects, the `tests/` tree, the vanilla
  web server (`http-server ../vanilla-oyl` on 8042) and `APP_PORT`/`APP_URL` for it;
  `lib/actions.ts` helpers only vanilla's specs used (keep what `tests-stencil/` imports:
  `awaitOutboxDrained`, `inlineConfirm`, …); the backend's `E2E_APP_ORIGIN` default and
  `APP_URL` become the stencil origin (8043), CORS keeps both 8043 forms.
- `packages/ui-oyl/src/global/themes.unit.ts`: the byte-equality test against vanilla's theme
  files and the theme-manager name list → the library's own theme list is asserted (eight named
  themes, each file present and parseable, `data-theme` selectors); ui-oyl becomes the source
  of the themes.
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
  selector adapts); `oyl-router main` visible; navigating announces the route in the router's
  live region and moves focus to the screen's `h2[tabindex=-1]`; focus-visible ring on a nav
  link; the inline-confirm cluster focuses **No** first (on `oyl-item-row` after adding a
  transaction via `addExpense`).
- **`connection.spec.ts`** (from `tests/connection.spec.ts`): on `/status`, an invalid URL is
  rejected inline (`ui-field[name=apiBaseUrl]` error) without applying; the mode segment
  reflects the active mode; Apply & reload with an equivalent URL persists `oyl/api-base` and the
  app reboots signed in. (Check what stencil's `oyl-status` validates today; if it lacks the
  inline URL validation vanilla had, add it — `normalizeBaseUrl` throws → `error` on the field.)
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
