# `apps/stencil-oyl` shell — Design

**Date:** 2026-10-07
**Status:** draft for review
**Program:** Stencil front-end — sub-project 2 (see `2026-10-06-extract-client-layer-design.md`
§Program context). Depends on 0 (`@oyl/all-of-oyl/client`, merged PR #6) and 1 (`@oyl/ui-oyl`,
merged PR #7).

## Purpose

`apps/stencil-oyl` is the next OYL front end. This sub-project builds its **shell**: the
app frame and everything a screen needs to exist — boot/composition, the signals↔Stencil
bridge, History-API routing, login/register and the forced-login guard, the online-first
data wiring with the outbox flusher, theme state, and the Status screen as the first real
screen. Redesigned domain screens (journal, planner, …) follow one spec each (3…n).

The shell is a **behavior-preserving port of vanilla's `main.js` composition** onto Stencil
components from `@oyl/ui-oyl`. Where vanilla's flow is already proven by e2e, the shell keeps
it; where vanilla carries old-design baggage (layouts, widgets) the shell drops it.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Build/serve | Stencil `www` output, with `@oyl/all-of-oyl/client` and `@oyl/ui-oyl` **bundled from source** by Stencil's compiler. No importmap, no vendored dist. Served as a static SPA (http-server with SPA fallback, like vanilla). |
| Theme/layout state | **Theme picker only.** Same `oyl/settings` blob and 8 themes (anti-FOUC head script carried over), so a user switching apps keeps their theme. Vanilla's 5 layouts and the widget deck are **not** ported; the redesign replaces them in later sub-projects. |
| e2e | **New shell-only specs** under `apps/e2e-oyl/tests-stencil/`, a third and fourth Playwright project (`stencil-desktop`, `stencil-mobile`), same fixtures and hygiene rule, app on **8043**, same backend on 1341 (CORS widened). vanilla's 21 specs stay untouched. |
| Routing | `createRouteState` from the client layer; a Stencil `oyl-router` switches on the route signal. Link interception: the same delegated-click approach as vanilla, ported to TS in the app. |
| Signals bridge | A tiny `useSignal`-style helper: components hold a `@State()` mirror of each signal they read, kept in sync by an `effect` created in `connectedCallback` and disposed in `disconnectedCallback`. No new reactive primitive; one copy of the core. |

## Package layout

```
apps/stencil-oyl/
  package.json          @oyl/stencil-oyl, private; deps: @oyl/all-of-oyl, @oyl/ui-oyl (workspace)
  stencil.config.ts     namespace 'oyl'; www output; dev server 3344
  tsconfig.json
  vitest.config.ts      @stencil/vitest (spec + unit), as ui-oyl
  vitest-setup.ts       + the ElementInternals shim from ui-oyl
  src/
    index.html          anti-FOUC script, <meta name="oyl-api-base">, tokens + 8 theme links, <oyl-app>
    global/app.css      document-level reset/layout (body, .page) — the only light-DOM CSS
    boot/
      compose.ts        createApp(win, doc): builds every state object (pure wiring, testable)
      ports.ts          browserDataPorts (TS port of vanilla's)
      link-interceptor.ts
      theme.ts          createThemeState(storage) + applier (TS port of vanilla's theme/*)
    bridge/
      signal-state.ts   bindSignal(host, signal, setter) → disposer; tracks(host, fn)
    components/
      oyl-app/          composition root element: owns createApp(), renders shell
      oyl-shell/        frame: header (brand, toolbar slot), ui-nav, main, ui-notice host
      oyl-router/       route signal → screen element (routes map, 'not-found' fallback)
      oyl-theme-picker/ swatch radiogroup + mode segmented control (port of vanilla's picker)
      oyl-account-menu/ Profile link; Log out / Sign in
      oyl-login/ oyl-register/   auth pages on ui-field + ui-button
      oyl-status/       Status screen: Connection, Account, Diagnostics, Data tools cards
      oyl-not-found/
  www/                  build output (git-ignored)
```

Tag prefix `oyl-` (domain/app components) per the ui-oyl convention; every element uses
`ui-*` primitives for controls and surfaces, with no raw `<button>`/`<input>` in app
components except where a primitive has no equivalent (the native `<select>` in Connection).

## Boot and composition

`compose.ts` is vanilla's `main.js` minus DOM construction, as a function:

```ts
export async function createApp(win: Window, doc: Document): Promise<App>
```

It returns `{ routeState, authState, noticeState, themeState, dataState, profileStore,
googleStore, googleLoginHref, connection, tz, mode, flush }`. The sequence is vanilla's,
in the same order: storage/theme/route state → api base + auth → `adoptTokenFromHash`
→ api client + connectivity + repositories → profile load + tz → `createDataState` →
`routeState.start()` → hash-adoption redirect → forced-login redirect → `refresh()` + tz
reload check + flush → Google probe → connectivity/sign-in/storage/unhandledrejection
listeners → `?seed`. Each step keeps vanilla's comments where they explain a trap (probe
sequencing, the deferred guard microtask, only-if-empty seeding).

`<oyl-app>` calls `createApp` in `componentWillLoad`, stores the result, and renders
`<oyl-shell>` with the state objects passed as props. A boot failure renders the same
"OYL failed to start: …" fallback text vanilla shows.

## Signals ↔ Stencil bridge

```ts
// bridge/signal-state.ts
export function bindSignal<T>(signal: { get(): T }, apply: (v: T) => void): () => void
```

`bindSignal` is `effect(() => apply(signal.get()))` and returns the disposer. Components
use it from `connectedCallback` and dispose in `disconnectedCallback`:

```ts
@State() route = ''
private stop = () => {}
connectedCallback() { this.stop = bindSignal(this.routeSignal, (r) => (this.route = r)) }
disconnectedCallback() { this.stop() }
```

Rules: a component never calls `signal.get()` inside `render()` (untracked reads go stale
silently); it reads its `@State()` mirror. Signals are passed as **props** (`routeSignal`,
`session`, `notice`), not read from globals, so specs can inject fakes. `signal`/`effect`
are imported only from `@oyl/all-of-oyl/client` (one reactive core — the vanilla guardrail
applies, enforced by a unit test that greps for any other `signal`/`effect` source).

## Routing

- `createRouteState(win, { interceptLinks: (nav) => interceptLinks(win, nav) })` exactly as
  vanilla; `interceptLinks` is a TS port of `link-interceptor.js` (delegated `document`
  click, `composedPath()` anchor search, same exclusions).
- `<oyl-router routeSignal routes>`: `routes: Record<string, () => HTMLElement>`; on route
  change it replaces its single child. Unknown routes render `<oyl-not-found>` with the
  route name as **text** (the existing injection test).
- `<ui-nav>` gets `items` (journal, planner, nutrition, finance, goals, vault, insights,
  status) and `current` from the route signal; `orientation` flips to `bottom` at ≤640px
  via a `matchMedia` listener in `oyl-shell` (vanilla's breakpoint, so the mobile spec
  carries over). `oyl-shell` reserves bottom padding when docked and has no
  `container-type` (the fixed-position trap noted in CLAUDE.md).
- Screens that don't exist yet (journal…insights) render a **placeholder** `<oyl-not-yet>`
  ("Journal is coming to the new OYL. Use the classic app for now." with a link to the
  vanilla origin when `<meta name="oyl-classic-url">` is set). Nav still lists them so
  the shell's IA is complete and routing specs can exercise real links.

## Auth

- `/login` and `/register` pages on `ui-card` + `ui-field` + `ui-button`, submitting through
  a native light-DOM `<form>` (the form-associated primitives make this work). Same
  behavior as vanilla: on success set remote mode and `location.assign('/status')`; errors
  surface inline via `error` on the field or a `ui-notice tone="danger"` in the card.
  Google sign-in button appears when `googleLoginHref` is non-null.
- Forced-login guard: `shouldRedirectToLogin` from the client layer, wired in `compose.ts`
  exactly as vanilla (initial check + the deferred-microtask effect).
- `oyl-account-menu` in the toolbar: Profile link always; Log out / Sign in by session.

## Theme state (app-side, ported)

`boot/theme.ts` ports vanilla's `state/theme.js` + `theme/theme-manager.js` +
`theme-catalog.js` to TS (same `THEMES`, `MODES`, `DEFAULT_SETTINGS`, `nextSettings`,
`applyTheme`, `createThemeApplier` with the view-transition cross-fade, catalog labels and
preview colors). `oyl-theme-picker` is a port of `oyl-theme-toggle`'s UX (trigger with three
chips + name; popover radiogroup of swatch cards; System/Light/Dark segmented control;
selection applies instantly and stays open). The ui-oyl theme files are linked from
`index.html` via `@oyl/ui-oyl/themes/<name>.css` (copied into `www/` by Stencil's `copy`).
The theme-collection e2e assertions (`html[data-theme]`, `color-scheme`, persistence,
"every theme offered") are re-expressed in the stencil specs.

## Data wiring and flusher

Identical to vanilla: one `ApiClient` + `WriteOutbox` + `ReadCache` via `makeRepositories`,
`createDataState` with `browserDataPorts`, `createFlusher` behavior through `flush()` on
boot, on `online`, on sign-in, and on another tab's outbox write; `unhandledrejection`
→ notice for `HttpRepositoryError`/`REVISION_CONFLICT`; `storage` events → theme refresh /
auth refresh / flush / debounced data refresh. `dataState.pending` feeds a "N pending"
indicator in the header (ui-notice tone=warn when offline with pending writes).

## Status screen (`/status`)

Cards (`ui-card`), in order:

1. **Connection** — mode (Remote/Local `<select>`), backend URL (`ui-field`), default URL
   hint, "Apply & reload" (`ui-button variant="primary"`). Same `onApply` as vanilla.
2. **Diagnostics** — `dl` of schema, theme, build, storage estimate, pending writes, and one
   `dt/dd` per collection count (the existing spec selector `dt:text-is("notes") + dd`).
3. **Data tools** — `data-act="seed|export|import|reset"` buttons with vanilla's gating:
   seed/export/import enabled in Remote mode, reset only in Local mode, with the same
   explanatory text ("Reset applies to local data — available in Local mode."). Seed confirms
   via `confirm()` when the account isn't empty; reset confirms via `confirm()`; export
   downloads `oyl-backup-<date>.json`; import picks a file.

The Account section is **not** on Status (vanilla moved it to Profile); the account menu
covers sign-out. Profile itself is a later screen; until then `/profile` shows the
placeholder.

## Dev and e2e

- `pnpm stencil dev` → Stencil dev server on **3344** (proxying is not needed: the dev
  server does SPA fallback itself). Backend: `pnpm strapi-app develop` on 1340 as usual;
  CORS gains `http://localhost:3344`.
- `pnpm stencil build` → `www/`. `pnpm stencil test` → `@stencil/vitest`. `pnpm stencil
  typecheck`.
- e2e: `apps/e2e-oyl/tests-stencil/*.spec.ts` with projects `stencil-desktop` and
  `stencil-mobile` (Pixel 7), `baseURL` **8043**, served by `pnpm -C ../.. stencil build &&
  http-server ../stencil-oyl/www -p 8043 --proxy …`. `start-backend.mjs` adds 8043 (and
  3344) to `CORS_ORIGINS`. Fixtures (`registerUser`, `primeRemoteSession`, hygiene) are
  shared; `signIn` waits for `oyl-shell` in both apps, so it is unchanged.
- Shell-only spec set: `smoke` (signed-in boot lands on /status with nav, toolbar, status;
  no session → /login), `auth` (register, login happy + wrong password, logout, session
  persists), `routing` (deep link, intercepted nav clicks, back/forward, not-found text,
  inert markup), `status` (diagnostics cards, counts after seed, tool gating, export
  download, reset confirm), `theme` (switch persists, all themes offered, mode persists),
  `mobile` (bottom bar on mobile, no horizontal overflow, tabs tappable, 44px targets),
  `sync` (dead backend → notice not crash; invalid token → login; pending indicator).
- `pnpm e2e` runs **all four** projects. The CI deploy gate (`pnpm test` + `pnpm typecheck`)
  gains the new package automatically through the `./apps/*` aggregates.

## Verification

- Unit (`*.unit.ts`): `compose.ts` boot order against fakes (route-window fake, memory
  storage, stub fetch returning a bootstrap document) asserting the redirect decisions and
  that `refresh()`/`flush()` run; `interceptLinks` port; theme state port (moved assertions
  from vanilla's theme tests); the one-reactive-core grep.
- Spec (`*.spec.tsx`): every component renders from injected signals and reacts to a
  `signal.set()` (the bridge), `oyl-router` swaps children and renders not-found as text,
  `oyl-status` gates tools by mode, `oyl-login` submits credentials through the native form.
- e2e: the seven spec files above green on both stencil projects; vanilla's four projects
  stay green with **no spec edits**.
- Definition of Done per CLAUDE.md: `pnpm stencil test|typecheck|build`, root aggregates,
  `pnpm e2e`.

## Out of scope

- Domain screens (3…n), Profile, Google connect/disconnect UI (the Google *login* button is
  in; connect/status lives on Profile).
- Layouts, widgets, layout picker.
- Prerender/hydrate (n+1), deploy/CI changes to publish stencil-oyl (cutover).
- Changing vanilla-oyl, `@oyl/all-of-oyl`, or `@oyl/ui-oyl` beyond what the shell needs
  (expected: none; if a primitive gap appears it gets its own small ui-oyl commit first).
- Sub-project 0 follow-ups (`createDataState({ newId })` forwarding test; vanilla `main.js`
  import consolidation) — still deferred.

## Risks

| Risk | Mitigation |
|---|---|
| Stencil bundles `@oyl/all-of-oyl` from source: NodeNext `.js` extensions and `exports` resolution | Stencil uses Rollup + node resolution; `exports` maps `./client` to TS source today and vanilla's tsc already resolves it. Task 1 proves it before anything else is built. |
| Two reactive cores (Stencil dedupes nothing; a second `signal.ts` would silently break reactivity) | Only one import path (`@oyl/all-of-oyl/client`); unit grep gate; the bridge is the only place `effect` is called in components. |
| Form-associated primitives inside Stencil pages under happy-dom | Same shim as ui-oyl; e2e proves the real browser path. |
| Untracked `signal.get()` in `render()` | Rule + a spec per component that flips a signal and expects a re-render. |
| e2e runtime grows (4 projects) | Shell specs are few and fast; `--project` filters stay available; the recorded `--workers=4` rule holds. |
