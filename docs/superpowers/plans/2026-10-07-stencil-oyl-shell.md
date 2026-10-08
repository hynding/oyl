# `apps/stencil-oyl` shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/stencil-oyl` — the Stencil app shell: boot/composition ported from vanilla's `main.js`, a signals↔Stencil bridge, History-API routing with placeholder screens, login/register + forced-login guard, online-first data wiring + flusher, theme state + picker, the Status screen, a dev server, and a shell-only e2e project. Vanilla stays untouched and its e2e suite stays green with no spec edits.

**Architecture:** `boot/compose.ts` is a pure `createApp(win, doc)` that builds every state object in vanilla's proven order. `<oyl-app>` calls it and renders `<oyl-shell>`; components receive signals as props and mirror them into `@State()` through `bindSignal` (one `effect` per binding, disposed on disconnect). `@oyl/all-of-oyl` is bundled from its `dist/` browser build via a Rollup resolver; `@oyl/ui-oyl` elements come from its `dist/components`. Stencil `www` output is served as a static SPA.

**Tech Stack:** Stencil 4.45 (`www` target), `@stencil/vitest` 1.15 on Vitest 4, happy-dom, `@oyl/ui-oyl`, `@oyl/all-of-oyl/client`, Playwright (shared `apps/e2e-oyl` fixtures), http-server.

**Spec:** `docs/superpowers/specs/2026-10-07-stencil-oyl-shell-design.md` (read its Amendments: dist bundling, prerequisites)

## Global Constraints

- **Branch:** `feat/stencil-oyl-shell` off `master` (spec commits `099d1d0`, `36be831` are on it). One commit per task; `feat`/`chore`/`docs` prefixes; the session's `Co-Authored-By` trailer. Never commit on red. No push/PR unless asked.
- **Behavior-preserving port of `main.js`.** Boot order, redirects, flusher triggers, listener set, `?seed` gate and the explanatory comments are carried over. The only intentional deviations are those the spec lists (no layouts/widgets, placeholder screens, Status without Account).
- **One reactive core.** `signal`/`computed`/`effect` are imported only from `@oyl/all-of-oyl/client`. Components never call `signal.get()` in `render()`; they read `@State()` mirrors set by `bindSignal`. Signals are props, never module globals (specs inject fakes).
- **Primitives first.** App components use `ui-button`/`ui-field`/`ui-card`/`ui-notice`/`ui-nav`/`ui-icon`; a raw control is allowed only where no primitive fits (the mode `<select>`, the file `<input>` for import). If a primitive gap blocks a task, add it to `packages/ui-oyl` in a separate small commit (spec + test) before continuing.
- **Selectors the e2e specs rely on** (keep stable): `oyl-shell`, `oyl-shell h1` = "OYL", `oyl-nav` hosts `ui-nav` whose anchors count 8, `oyl-status h2` first = "Status", `oyl-account-menu button[data-act="logout"]` / `a[href="/login"]`, `oyl-login h2` = "Sign in", `oyl-register h2` = "Create account", auth inputs `input[name="identifier"|"username"|"email"|"password"]` reachable through `ui-field` shadow roots (Playwright pierces shadow DOM), `oyl-status button[data-act="seed|export|import|reset"]`, `oyl-status dt:text-is("notes") + dd`, theme picker `button[data-picker-trigger]`, `[data-picker-panel]`, `[data-theme-option="<name>"]`, `[data-mode-option="<mode>"]`.
- **Prerequisites chain:** `pnpm all-of build` and `pnpm ui build` must precede a stencil-oyl build/test. The package scripts chain them (`pnpm -C ../.. all-of build && pnpm -C ../.. ui build && stencil …`).
- **Per-task gate** (repo root; green before commit):
  ```bash
  pnpm stencil test       # stencil-test: dev build + spec/unit projects
  pnpm stencil typecheck
  pnpm stencil build      # prod www/
  ```
  Task 10 adds `pnpm e2e --project stencil-desktop --project stencil-mobile --workers=4` and the full `pnpm e2e` (vanilla untouched). Free ports 1341/1342/8042/8043 first; never hand-start servers.
- **Ports:** dev server **3344**; e2e app **8043**; backend 1341; fake Google 1342.
- **Generated files committed:** `src/components.d.ts`. `www/`, `.stencil/` git-ignored.

---

## Task 1: Scaffold the app and prove the pipeline

**Files:** `apps/stencil-oyl/{package.json,stencil.config.ts,tsconfig.json,vitest.config.ts,vitest-setup.ts,.gitignore}`, `src/index.html`, `src/global/app.css`, `src/components/oyl-app/{oyl-app.tsx,oyl-app.css,oyl-app.spec.tsx}`, root `package.json` (`"stencil": "pnpm --filter @oyl/stencil-oyl"`)

- [ ] **Step 1: failing spec** — `oyl-app.spec.tsx`: renders `<oyl-app>`; expects a shadow root containing an `h1` "OYL". (Placeholder render; Task 7 replaces it.)
- [ ] **Step 2: package.json** — name `@oyl/stencil-oyl`, private, `"type": "module"`; deps `@oyl/all-of-oyl: workspace:*`, `@oyl/ui-oyl: workspace:*`; devDeps `@stencil/core ^4.45.2`, `@stencil/vitest ^1.15.1`, `happy-dom ^20`, `typescript ^5`, `vitest ^4.1.10`, `http-server ^14.1.1`. Scripts: `prebuild`-style chaining via `lib`: `"lib": "pnpm -C ../.. all-of build && pnpm -C ../.. ui build"`, `"dev": "pnpm lib && stencil build --dev --watch --serve"`, `"build": "pnpm lib && stencil build"`, `"test": "pnpm lib && stencil-test"`, `"typecheck": "tsc --noEmit"`, `"serve": "http-server www -p 8043 -c-1 --proxy \"http://localhost:8043?\" --silent"`.
- [ ] **Step 3: stencil.config.ts** — `namespace: 'oyl'`, `taskQueue: 'async'`, `sourceMap: true`, `srcIndexHtml: 'src/index.html'`, `globalStyle: 'src/global/app.css'`, `rollupPlugins: { before: [allOfOylDist] }` (the resolver from the spec amendment, `__dirname`-relative to `packages/all-of-oyl/dist`), `outputTargets: [{ type: 'www', dir: 'www', serviceWorker: null, baseUrl: '/', copy: [{ src: '../../../packages/ui-oyl/dist/themes', dest: 'themes' }, { src: '../../../packages/ui-oyl/dist/ui-oyl/ui-oyl.css', dest: 'tokens.css' }] }]`, `devServer: { port: 3344, openBrowser: false, historyApiFallback: { index: 'index.html' } }`.
- [ ] **Step 4: tsconfig/vitest/setup** — copy ui-oyl's `tsconfig.json` (no `noEmit`), `vitest.config.ts` (spec + unit projects), `vitest-setup.ts` (ElementInternals shim; import `./www/build/oyl.esm.js` — confirm the dev build's loader path by listing `www/build` after the first `stencil build --dev`, and fix the setup import if it differs). Also import `@oyl/ui-oyl/loader`'s `defineCustomElements()` in the setup so `ui-*` elements hydrate in specs.
- [ ] **Step 5: index.html** — vanilla's head verbatim (anti-FOUC script, `<meta name="oyl-api-base" content="">`, viewport), then `<link rel="stylesheet" href="/tokens.css">` + 8 `<link href="/themes/<name>.css">`, `<link href="/build/oyl.css">`, `<script type="module" src="/build/oyl.esm.js">`, `<body><oyl-app></oyl-app><p id="boot-fallback" hidden></p></body>`. Root-absolute paths (deep links).
- [ ] **Step 6: app.css** — document-level only: `body { margin:0; font-family: var(--font-sans); font-size: var(--step-0); background: var(--color-bg); color: var(--color-text); }`, `*,*::before,*::after { box-sizing: border-box }`, `:root { color-scheme: light dark }`.
- [ ] **Step 7: oyl-app placeholder** — renders `<h1>OYL</h1>`; `pnpm install`, then gate. Confirm `www/index.html` links resolve (`ls www/themes | wc -l` = 8, `www/tokens.css` exists). Root `pnpm typecheck` green.
- [ ] **Step 8: commit** — `chore(stencil-oyl): scaffold Stencil app with dist bundling + vitest`.

---

## Task 2: Bridge, theme state, link interceptor, browser ports (pure modules)

**Files:** `src/bridge/signal-state.ts` + `.unit.ts`, `src/boot/theme.ts` + `.unit.ts`, `src/boot/link-interceptor.ts` + `.unit.ts`, `src/boot/ports.ts` + `.unit.ts`, `src/reactive-core.unit.ts`

- [ ] **Step 1: failing unit tests.**
  - `signal-state.unit.ts`: `bindSignal(sig, apply)` calls `apply` immediately with the current value, again (after a microtask) when the signal changes, and never after the disposer runs.
  - `theme.unit.ts`: port vanilla's `theme-manager.test.js`, `theme.test.js` (state) and `theme-catalog.test.js` assertions (THEMES/MODES/DEFAULT_SETTINGS, `nextSettings` validation, `applyTheme` on a fake doc, `createThemeApplier` instant-first + reduced-motion + missing API paths, catalog/THEMES parity, `createThemeState` read/update/refresh against `memoryStorage()` from `@oyl/all-of-oyl/client`... note: the memory-storage fake is a test file in all-of-oyl; write a 6-line local fake instead).
  - `link-interceptor.unit.ts`: port vanilla's `link-interceptor.test.js` (same-origin left click → navigate(pathname+search) + preventDefault; modifier keys, `target`, `download`, `rel=external`, cross-origin, same-page hash → untouched) with a fake window/document (`EventTarget` + `composedPath`).
  - `ports.unit.ts`: port vanilla's `browser-ports.test.js` (`newId` uses `crypto.randomUUID` when present else `fallbackId`; `estimateStorage` maps/undefined → null; `build` default 'dev').
  - `reactive-core.unit.ts`: walks `src/**/*.{ts,tsx}` and fails if any file imports `signal`/`effect`/`computed` from anywhere but `@oyl/all-of-oyl/client`, or defines a function named `signal`/`effect`.
- [ ] **Step 2: implement** — `bindSignal` = `effect(() => apply(signal.get()))`; `theme.ts` = one-for-one TS port of vanilla's three theme modules (types `Theme`, `Mode`, `ThemeSettings`; exports `THEMES`, `MODES`, `DEFAULT_SETTINGS`, `THEME_CATALOG`, `resolveColorScheme`, `nextSettings`, `applyTheme`, `createThemeApplier`, `createThemeState`); `link-interceptor.ts` and `ports.ts` = TS ports (JSDoc → types, no logic change).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): signal bridge, theme state, link interceptor, browser ports`.

---

## Task 3: `compose.ts` — the boot sequence

**Files:** `src/boot/compose.ts`, `src/boot/compose.unit.ts`, `src/boot/types.ts`

- [ ] **Step 1: failing unit test** — `createApp(win, doc, { storage, fetch })` against fakes: `fakeRouteWindow()` (copy the shape of all-of-oyl's `route-window-fake.ts` locally — it is a test helper, not exported), a memory storage, and a `fetch` stub that answers `/bootstrap` with an empty bootstrap document and `/users/me` with a profile. Assert: (a) with remote mode + no session, `routeState.route.get() === 'login'` after boot and `history.replaceState` was used; (b) with a session, `fetch` was called for `/bootstrap`, `dataState.counts.get()` is populated, and `flush` ran; (c) `?seed` with an empty account seeds (counts > 0 after boot); (d) `adoptTokenFromHash` runs before the guard (a `#google=<jwt>` hash lands on `/status`, not `/login`). Keep each case small; the point is order and decisions, not store internals.
- [ ] **Step 2: `types.ts`** — `App` interface: `{ win, storage, mode, apiBase, apiDefault, tz, routeState, authState, noticeState, themeState, dataState, profileStore, googleStore, googleLoginHref, flush, connection: { mode, apiBaseUrl, defaultApiBaseUrl, onApply } }`.
- [ ] **Step 3: `compose.ts`** — port `main.js` `boot()` up to (not including) element construction, as `createApp(win: Window, doc: Document, deps?: { storage?: Storage; fetch?: typeof fetch })`. Same imports from `@oyl/all-of-oyl` / `@oyl/all-of-oyl/client`; theme state + applier from `./theme.js`; `interceptLinks`, `browserDataPorts` from siblings. Keep: hash adoption, api client with `onAuthError`, repositories + flush, profile/tz, `createDataState(storage, themeState, …)`, `routeState.start()`, the two redirects, refresh + tz reload + flush, Google probe sequencing (with its comment), connectivity/sign-in/storage/unhandledrejection listeners, `?seed` + `accountIsEmpty`. Also export `accountIsEmpty`, `download(doc)`, `pickAndImport`, `resetData` (ported helpers) from `src/boot/data-tools.ts` for the Status screen.
- [ ] **Step 4: gate + commit** — `feat(stencil-oyl): createApp composition (port of vanilla main.js boot)`.

---

## Task 4: `oyl-router`, `oyl-not-found`, `oyl-not-yet`

**Files:** `src/components/oyl-router/*`, `src/components/oyl-not-found/*`, `src/components/oyl-not-yet/*`

- [ ] **Step 1: failing specs** — router with `routeSignal = signal('status')` and `routes = { status: () => el('p', 'S'), journal: () => el('p', 'J') }` renders the status element; `routeSignal.set('journal')` + `waitForChanges` swaps it (old removed, one child); unknown route renders `<oyl-not-found>` whose text includes the route name and whose `<b>` markup in the route name is **text** (`textContent` contains `<b>`, no `b` element). `oyl-not-yet` renders "`<Name>` is coming to the new OYL." and a classic link only when `classicUrl` is set.
- [ ] **Step 2: implement** — `oyl-router`: props `routeSignal`, `routes: Record<string, () => HTMLElement>`; `@State() route`; `bindSignal` in connected/disconnected; `render()` returns `<slot/>`? No — it owns its child: in `componentDidRender`/on state change it `replaceChildren(routes[route]?.() ?? notFound(route))` on the host's light DOM, so screens render in the light DOM (Playwright selectors like `oyl-status h2` work, and screens can be themed by document CSS). Host `display: block`.
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): oyl-router with not-found and placeholder screens`.

---

## Task 5: Shell chrome — `oyl-shell`, `oyl-nav`, `oyl-account-menu`, `oyl-notice-host`

**Files:** `src/components/oyl-shell/*`, `src/components/oyl-nav/*`, `src/components/oyl-account-menu/*`, `src/components/oyl-notice-host/*`

- [ ] **Step 1: failing specs** — `oyl-shell` renders `<header>` with `<h1>OYL</h1>`, a `toolbar` slot, a `nav` slot, a `main` slot; prop `docked` (boolean, reflected) toggles class `docked` on the page frame (bottom padding). `oyl-nav` (`routeSignal` prop) renders `<ui-nav>` with 8 items (journal, planner, nutrition, finance, goals, vault, insights, status) and `current` mirroring the signal; `orientation` prop passes through. `oyl-account-menu` (`session` signal prop, `onLogout`): signed-in → `ui-button[data-act="logout"]` (renders a `button[data-act="logout"]` inside — put `data-act` on the inner control via a `ui-button` attribute pass-through? No: keep it simple — the menu renders a **native-looking** `ui-button` and the spec selector targets `oyl-account-menu ui-button[data-act="logout"]`; record this selector in the stencil e2e). Signed-out → `a[href="/login"]` "Sign in"; Profile link always. `oyl-notice-host` (`notice` signal prop, `onDismiss`): renders `ui-notice tone="warn" dismissible` fixed at the top when the notice is non-null, nothing otherwise; `dismiss` → `onDismiss`.
- [ ] **Step 2: implement + CSS** — shell: `header` with brand + toolbar (flex, `gap: var(--space-3)`, `min-block-size: var(--size-control)`, hairline bottom border), nav row under it, `.page` main (`max-inline-size: 48rem; margin-inline: auto; padding: var(--space-4)`), `.page.docked { padding-block-end: calc(var(--size-control) + var(--space-6)) }`. **No `container-type` on `:host`.** Nav: `ui-nav` items with the `IconName`s from ui-oyl. The shell owns the `matchMedia('(max-width: 640px)')` listener and sets `docked` + passes `orientation` to `oyl-nav` (prop drilling through `oyl-app` in Task 7 is fine; or the shell renders `oyl-nav` itself from a `routeSignal` prop — choose the latter, fewer slots).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): shell chrome (header, nav, account menu, notice host)`.

---

## Task 6: Auth pages and theme picker

**Files:** `src/components/oyl-auth-form/*`, `src/components/oyl-login/*`, `src/components/oyl-register/*`, `src/components/oyl-theme-picker/*`

- [ ] **Step 1: failing specs** — `oyl-auth-form` (`mode`, `auth`, `googleAuth` signal, `onSuccess`): login mode renders `ui-field name="identifier"` + `name="password"` + submit `ui-button type="submit"` "Sign in"; register mode renders username/email/password + "Create account"; submitting calls `auth.login(id, pw)` / `auth.register(u, e, pw)` and then `onSuccess`; a rejected promise renders the message in `[data-role="error"]` (aria-live); `googleAuth` non-null renders `a[data-act="google"][rel="external"]`. `oyl-login`/`oyl-register` render `h2` "Sign in"/"Create account" inside a `ui-card`, a cross-link ("Create account" / "Sign in" anchors), and the form. `oyl-theme-picker` (`themeState` prop): trigger `button[data-picker-trigger]` shows three chips + current label; click opens `[data-picker-panel]` with 8 `[data-theme-option]` radios (`aria-checked`) and 3 `[data-mode-option]`; clicking an option calls `themeState.update({ theme })` and the panel stays open; Escape closes; outside click closes.
- [ ] **Step 2: implement** — auth form submits through the native `<form>` (`onSubmit` + `preventDefault`), reading values from the `ui-field` elements' `value` props (or `new FormData(form)` — both work with the form-associated primitives; use `FormData` so the e2e path is the real one). Theme picker: port `oyl-theme-toggle`'s structure and the popover CSS (including the mobile sheet rules from `popover-sheet.js` `MOBILE_SHEET_CSS`, inlined) with `ui-button variant="ghost"`-free native `<button>`s **only** for the radio options (they are a radiogroup, not actions — document this exception in the component).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): login/register pages and theme picker`.

---

## Task 7: `oyl-status` and `oyl-app` composition

**Files:** `src/components/oyl-status/*`, `src/components/oyl-app/*` (replace the placeholder)

- [ ] **Step 1: failing specs** — `oyl-status` (`connection`, `diagnostics` signal-ish via `readDiagnostics` prop, `pending` signal, `actions`, `mode`): first `h2` "Status"; Connection card with mode `<select>` (local/remote), `ui-field name="apiBaseUrl"`, "Apply & reload" calling `connection.onApply(mode, url)`; Diagnostics card renders `dt/dd` for schema/theme/build/pending and one pair per `counts` key (`dt:text-is("notes") + dd` = "1" for `{ notes: 1 }`); Data tools card: `ui-button[data-act=…]` (put `data-act` on the `ui-button` host) — in remote mode seed/export/import enabled and reset disabled with the text "Reset applies to local data — available in Local mode."; in local mode the inverse with "Account tools need Remote mode."; clicks call `actions.onSeed/onExport/onImport/onReset`.
- [ ] **Step 2: `oyl-app`** — `componentWillLoad`: `this.app = await createApp(window, document)`; on error set `@State() bootError` and render the fallback text "OYL failed to start: …" (also remove `#boot-fallback`). Render: `<oyl-notice-host notice onDismiss>`, `<oyl-shell routeSignal>` with toolbar `oyl-theme-picker` + `oyl-account-menu`, and `<oyl-router routeSignal routes>` in main. `routes` = `{ status: () => statusEl(app), login, register, profile: notYet('Profile'), journal/planner/nutrition/finance/goals/vault/insights: notYet(...) }` built in `src/boot/routes.ts` (so the map is unit-testable: every nav item has a route; status wires `panel.track`-equivalent via `bindSignal` on `dataState.pending` and a `readDiagnostics()` refresh after `refresh()`).
- [ ] **Step 3: gate + commit** — `feat(stencil-oyl): Status screen and oyl-app composition`.

---

## Task 8: Dev run-through

- [ ] **Step 1:** Free ports; `pnpm strapi-app develop` is **not** to be hand-started — instead reuse the e2e backend script in a one-off: `node apps/e2e-oyl/scripts/start-backend.mjs &` is also hand-starting. So: write a tiny `scripts/dev-stencil.mjs` at the repo root modelled on `scripts/dev.mjs` (backend 1340 health-gated + `pnpm stencil dev` on 3344, one Ctrl-C stops both) and add `"dev:stencil": "node scripts/dev-stencil.mjs"` to the root. Run it, hit `http://localhost:3344/`, verify: `/` → `/login`; register a throwaway user through the UI → `/status` with counts; theme picker switches and persists across reload; nav links route client-side; `/nope` shows Not found; mobile width docks the nav. Stop the stack. Fix what breaks (each fix gets its own spec first).
- [ ] **Step 2:** `apps/strapi-oyl/config/middlewares.ts`: add `http://localhost:3344` and `http://localhost:8043` to the default `CORS_ORIGINS`; `apps/e2e-oyl/scripts/start-backend.mjs`: `CORS_ORIGINS` gains `http://localhost:8043,http://127.0.0.1:8043`.
- [ ] **Step 3: commit** — `feat(stencil-oyl): dev stack script + CORS for the new origins`.

---

## Task 9: e2e project for the shell

**Files:** `apps/e2e-oyl/playwright.config.ts`, `apps/e2e-oyl/lib/urls.ts` (`STENCIL_APP_PORT = 8043`, `STENCIL_APP_URL`), `apps/e2e-oyl/tests-stencil/{smoke,auth,routing,status,theme,mobile,sync}.spec.ts`, `apps/e2e-oyl/README.md`

- [ ] **Step 1: config** — add projects `stencil-desktop` (Desktop Chrome 1280×800) and `stencil-mobile` (Pixel 7) with `testDir: './tests-stencil'` and `use.baseURL: STENCIL_APP_URL`; a fourth `webServer` entry: `pnpm -C ../.. stencil build && pnpm -C ../stencil-oyl serve` with `url: STENCIL_APP_URL`, `reuseExistingServer: true`. Existing `desktop`/`mobile` projects get `testDir: './tests'` explicitly. `signIn` fixture is unchanged (`oyl-shell` exists in both apps); `primeRemoteSession` keys are the same.
- [ ] **Step 2: specs** — port the shell-relevant assertions from `tests/{smoke,auth,routing,status,theme,mobile,sync}.spec.ts` with the stencil selectors from Global Constraints (e.g. `oyl-nav a` → `oyl-nav ui-nav a`, `oyl-status-panel` → `oyl-status`, `oyl-theme-toggle` → `oyl-theme-picker`, `oyl-account-menu button[data-act=logout]` → `oyl-account-menu ui-button[data-act=logout]`). Drop assertions that need domain screens (journal note writes); for `status` "counts reflect server data" use the **seed** action instead of a journal write (`data-act="seed"` then reload, expect `dt:text-is("notes") + dd` > 0). `routing`: deep link to `/journal` expects `oyl-not-yet` text. `sync`: dead backend → notice text "Couldn't reach the backend"; invalid token → `/login`.
- [ ] **Step 3: run** — free ports; `pnpm --filter @oyl/e2e-oyl exec playwright test --project stencil-desktop --project stencil-mobile --workers=4` green; then the full `pnpm --filter @oyl/e2e-oyl exec playwright test --workers=4` green (vanilla's four projects unchanged, no spec edits under `tests/`).
- [ ] **Step 4: README** — document the two project pairs, the port, and the selector conventions for stencil specs.
- [ ] **Step 5: commit** — `test(e2e): stencil-oyl shell projects (desktop + mobile)`.

---

## Task 10: Docs

**Files:** `CLAUDE.md`, both specs' status lines, the extract-client-layer spec's program table (row 2 → implemented)

- [ ] **Step 1: CLAUDE.md** — "Seven members" → eight; add the `@oyl/stencil-oyl` package row (what it is, dist-bundling amendment, prerequisites chain, ports 3344/8043, placeholder screens, e2e `tests-stencil`); Dev workflows: `pnpm dev:stencil`, `pnpm stencil dev|build|test|typecheck`; port map prose; tests table row; gotchas: "stencil-oyl bundles all-of-oyl from `dist/` (run `pnpm all-of build` after `src/` changes or the app runs stale code)", "one reactive core (unit grep)", "screens render in the router's light DOM".
- [ ] **Step 2:** spec statuses; tick this plan's boxes.
- [ ] **Step 3:** final gates: `pnpm stencil test|typecheck|build`, root `pnpm typecheck`, root test aggregate (excluding the two packages that need external prerequisites, as recorded), full `pnpm e2e`.
- [ ] **Step 4: commit** — `docs: stencil-oyl shell in CLAUDE.md; spec statuses`.

---

## Done when

- `pnpm dev:stencil` boots the new app against the local backend; login → status → theme → nav all work.
- Shell e2e (two projects) green; vanilla e2e green with no `tests/` edits.
- Every gate green; branch ready for PR.

## Deferred

- Domain screens (3…n) replace `oyl-not-yet` one spec at a time; Profile screen (Google connect/disconnect UI, profile fields).
- Prerender/hydrate (n+1); deploy/CI for stencil-oyl (cutover).
- Sub-project 0 follow-ups: `createDataState({ newId })` forwarding test; vanilla `main.js` import consolidation.
