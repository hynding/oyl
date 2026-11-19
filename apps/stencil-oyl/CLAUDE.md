# stencil-oyl — the front end

The Stencil app; the DreamHost www target since the 2026-10-09 cutover (vanilla-oyl is frozen legacy). Program: `docs/superpowers/specs/2026-10-06-extract-client-layer-design.md` §Program context; shell spec `2026-10-07-stencil-oyl-shell-design.md`.

## Shape

- `boot/compose.ts` — `createApp`, a port of vanilla's `main.js` boot (same order, redirects, flusher triggers). `boot/titles.ts` sets `document.title` per route ("Journal · OYL"). `boot/admin-routes.ts` hides the Status tab and sends signed-in non-admins from `/status` (deep link, `/` default, post-login landing) to `/journal`.
- `bridge/signal-state.ts` — `bindSignal`: one `effect` per signal→`@State()` mirror, disposed on disconnect.
- `oyl-router` — History-API route signal → screen rendered in the router's **light DOM** (so `oyl-status h2`-style selectors work). Login/register/guard, theme state + `oyl-theme-picker` (same `oyl/settings` blob as vanilla).
- `src/global/app.ts` registers every `@oyl/ui-oyl` primitive and pins ONE reactive core into the shared chunk.
- No layouts/widgets (dropped by design). No placeholders remain.

## Screens (spec files in `docs/superpowers/specs/`)

| Screen | Components | Format module | Spec | Notes |
|---|---|---|---|---|
| Journal | `oyl-journal`, `oyl-log-form`, `oyl-entry-row` (inline delete confirm) | — | `2026-10-08-stencil-oyl-journal-design.md` | |
| Planner | `oyl-planner` (Overdue + day agenda), `oyl-plan-composer`, `oyl-plan-row` (check/cancel/delete) | — | `2026-10-08-stencil-oyl-planner-design.md` | plans unbacked (in-session only) |
| Nutrition | `oyl-nutrition` (5 totals tiles), `oyl-meal-form` (catalog/ad-hoc on `ui-select`), `oyl-meal-row`, `oyl-consumable-form` (collapsed `<details>`) | `src/nutrition/format.ts` | `2026-10-08-stencil-oyl-nutrition-design.md` | |
| Finance | `oyl-finance` (spent/income/net per currency), `oyl-transaction-form`, month ledger with `ui-select` account filter, budgets on `oyl-progress-row` + `oyl-budget-form`, `oyl-account-form` | `src/finance/format.ts` | `2026-10-08-stencil-oyl-finance-design.md` | |
| Vault | `oyl-vault`: Upcoming feed over a horizon signal; kind segment (documents / possessions / subscriptions / contacts + gift ideas) with collapsed `oyl-{document,possession,subscription,contact,gift-idea}-form` | `src/vault/format.ts` | `2026-10-08-stencil-oyl-vault-design.md` | vault collections unbacked |
| Goals | `oyl-goals`: summary line, collapsed `oyl-goal-form` on `ui-select` presets, one `oyl-progress-row` per goal | `src/goals/format.ts` | `2026-10-09-stencil-oyl-goals-design.md` | Pause/Resume derives from the goal's **open pause**, not `progress.paused` (stays true through a same-day resume) |
| Insights | `oyl-insights` (read-only): week/month `ui-segment` on a bundle signal, 4 tiles with deltas, rows straight from `dataState.reviewOn` | `src/insights/format.ts` | `2026-10-09-stencil-oyl-insights-design.md` | |
| Profile | `oyl-profile` + `oyl-profile-form` (IANA tz `ui-select` w/ text fallback, units, body fields w/ live kg/lb · cm/in hints, gender + self-describe), Google Drive card on one stable handler, pointer to Status, Log out | `src/profile/format.ts` | `2026-10-09-stencil-oyl-profile-design.md` | route owns the save rule (reload on tz/units change, else a notice); `users` unbacked → in-session only |
| Status | `oyl-status` | — | shell spec | admin-only (see root CLAUDE.md) |

Shared rows — purely presentational; screens derive every prop in `render()`:
- `oyl-progress-row`: `name` + met check + ratio bar with `tone` + label + optional `action` → `act` + inline delete.
- `oyl-item-row`: label + lines + mono value + optional secondary `action` → `act` + inline delete; `remove`/`act` carry `itemId`.
- `oyl-day-nav`: prev/next + 7-day strip with `marked(day)` dots + live region; day-scoped screens own the day signal and arrow keys via `lib/keys.ts`.

## Bundling

`@oyl/all-of-oyl` is bundled from its `dist/` (a Rollup resolver in `stencil.config.ts`) and ui-oyl from `dist/components`, so every `pnpm stencil …` script chains `all-of build` + `ui build` first. `www/` is the static SPA output (served with SPA fallback).

## Production

DreamHost Apache. CI runs `pnpm stencil build`; `scripts/dreamhost/publish-www.sh` ships `www/` (`index.html`, `build/`, `themes/`, `tokens.css`, `favicon.svg`; a `--dev` build is refused), fills the `<meta name="oyl-api-base">` seam and renders `deploy/htaccess.template` (SPA fallback scoped to asset roots, hashed CSP, immutable `p-*` chunks) via `scripts/dreamhost/render-htaccess.mjs`. See `deploy/README.md`.

## Tests

- `pnpm stencil test` — builds, then Vitest projects `spec` (components, `environment: 'stencil'`/happy-dom), `dom` (pure browser modules, plain happy-dom), `unit` (node: boot order with fakes, guards).
- `pnpm stencil typecheck`.
- e2e: `apps/e2e-oyl/tests/` — `pnpm e2e --workers=4` (projects `desktop`/`mobile`).

## Gotchas

- Runs `@oyl/all-of-oyl` from `dist/` — after editing `packages/all-of-oyl/src`, rebuild (`pnpm all-of build`; the `pnpm stencil …` scripts do it) or the app runs stale code.
- Exactly ONE reactive core: `src/global/app.ts` imports the client layer into the shared chunk and a unit grep forbids any other `signal`/`effect` source. A spec that creates a signal MUST take it from the bundle (`core()` in `vitest-setup.ts`) or the component never reacts.
- A Stencil `@State` is NOT tracked by an `effect`: anything the effect must react to (a horizon, a day) must be a bundle `signal` read inside it.
- Every `ui-*` tag a component renders must be registered in `src/global/app.ts` (`defineCustomElementUiX()`; a unit test enforces it) — Stencil treats foreign tags as plain elements.
- Callbacks are `@Event()`s (`onX` props are refused by the compiler); `@Event()` names must not collide with native DOM events (`complete` → `completePlan`). Modules with `@Component` export only the class.
- `title` is a reserved public name (Stencil warns on `@Prop() title`) — rows use `name`/`label`.
- A `ui-*` host keeps the listener from its FIRST render — never close over render state in an `onClick` on a `ui-*` element; use a stable handler that reads `this.*` at call time (`oyl-day-nav`'s prev/next).
- Stores mutate plans in place, so key rows by `id:status` (or the prop keeps its identity and the row never re-renders).
- Discriminate entries/plans on `.kind`, never `instanceof` (the bundle's domain classes and a test's are different copies).
- `flush()` returns at once mid-drain by design, so "drained" is observed through the outbox size (`flushAndRefresh`).
- Clicks in specs go to a `ui-button`'s inner control, as a user's do.
- e2e text assertions on shadow hosts use `deepText()` from `apps/e2e-oyl/tests/lib.ts` (Playwright's `textContent` stops at shadow roots) — and a `deepText` read right after a `toHaveCount` must `expect.poll`, because the host exists before its shadow root has rendered.
- Google OAuth callback redirects to the single backend `APP_URL` (this app's origin); journeys in `apps/e2e-oyl/tests/google-auth.spec.ts`. A Google-created account is a plain user (lands on `/journal`).
