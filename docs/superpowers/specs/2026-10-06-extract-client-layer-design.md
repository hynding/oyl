# Extract the Client Layer into `@oyl/all-of-oyl/client` — Design

**Date:** 2026-10-06
**Status:** Implemented on branch refactor/extract-client-layer (plan: docs/superpowers/plans/2026-10-06-extract-client-layer.md)
**Program:** Stencil front-end (`apps/stencil-oyl`) — sub-project 0 of the program below

## Purpose

`apps/stencil-oyl` will be the next version of the OYL front end, built with Stencil. The
move is motivated by authoring ergonomics (TSX + TS instead of JSDoc'd vanilla JS), a
reusable Web Component library, prerender/SEO, and a fresh UX redesign. vanilla-oyl stays
production on DreamHost (side by side) until stencil-oyl reaches parity.

Both apps need the same client state layer: the signals core, the domain stores, the
online-first bootstrap/outbox/flusher wiring, auth and routing state. Today that layer lives
in `apps/vanilla-oyl/src/{lib/reactive,state,storage}` as ~2k lines of DOM-light JS.
CLAUDE.md requires shared logic to live only in `@oyl/all-of-oyl/src` and never be
duplicated in an app, so the layer has to move **before** stencil-oyl is written.

This sub-project is a **behavior-preserving move**. The client layer goes into
`packages/all-of-oyl/src/client/` (ported to strict TS) and is exported as
`@oyl/all-of-oyl/client`. vanilla-oyl re-points its imports and must behave identically,
proven by its unit tests and the unchanged e2e suite.

## Program context

| # | Sub-project | Depends on |
|---|---|---|
| **0** | **Extract client layer (this spec)** | — |
| 1 | `packages/ui-oyl`: domain-agnostic Stencil component library (design tokens, themes for the redesign, primitives) with `dist` + custom-elements outputs — **implemented** (spec `2026-10-07-ui-oyl-library-design.md`) | — |
| 2 | `apps/stencil-oyl` shell: scaffold, signals↔Stencil bridge, routing, login/register/guard, data wiring + flusher, Status screen, dev port, its own e2e project — **implemented** (spec `2026-10-07-stencil-oyl-shell-design.md`) | 0, 1 |
| 3…n | Redesigned screens, one spec each — **3 Journal implemented** (`2026-10-08-stencil-oyl-journal-design.md`), **4 Planner implemented** (`2026-10-08-stencil-oyl-planner-design.md`), **5 Nutrition implemented** (`2026-10-08-stencil-oyl-nutrition-design.md`), **6 Finance implemented** (`2026-10-08-stencil-oyl-finance-design.md`), **7 Vault implemented** (`2026-10-08-stencil-oyl-vault-design.md`), **8 Goals implemented** (`2026-10-09-stencil-oyl-goals-design.md`), **9 Insights implemented** (`2026-10-09-stencil-oyl-insights-design.md`), **10 Profile implemented** (`2026-10-09-stencil-oyl-profile-design.md`) — every screen is redesigned; no placeholder remains | 2 |
| n+1 | Prerender/SEO via Stencil hydrate output | 2 |
| n+2 | Cutover: deploy/CI switch to stencil-oyl, retire vanilla-oyl | parity |

Program decisions already made: side-by-side transition (vanilla-oyl stays prod until
cutover); the reusable library is a separate package (`packages/ui-oyl`), the app is
`apps/stencil-oyl`; Stencil 4.x with `@stencil/vitest` (the repo stays on Vitest); vanilla's
History-API route state is reused rather than adopting `@stencil/router`.

## Boundary: what moves, what stays

**Moves to `packages/all-of-oyl/src/client/`:**

| From `apps/vanilla-oyl/src/` | To `client/` |
|---|---|
| `lib/reactive/{signal,computed,effect,internals}.js` | `reactive/*.ts` |
| `storage/{keys,clock,config,settings,schema,connectivity,lock}.js` | `storage/*.ts` |
| `storage/{bootstrap,seed}.js` | `storage/*.ts` |
| `storage/backup.js` — whole module; see Amendment 1 | `storage/backup.ts` |
| `state/{journal,planner,vault,goals,budgets,accounts,consumables,consumable-products,profile,google}-store.js` | `stores/<name>.ts` (drop `-store` suffix) |
| `state/notice.js` | `stores/notice.ts` |
| `state/{auth,auth-guard,route}.js` | `session/*.ts` |
| `state/data.js` | `data.ts` |

**Stays in vanilla-oyl:**

- `lib/reactive/oyl-element.js`: vanilla's component base class (imports `effect` from the package).
- `state/link-interceptor.js`: DOM click delegation (injected into route state; see §Seams).
- `state/theme.js`, `state/layout.js`, `theme/*`, `layouts/*`: the redesign replaces them, so
  sharing them would freeze the old design system into the core.
- `lib/debounce.js`, `widgets/sample-data.js`.
- the backup *download* helper in `main.js` (anchor click via `URL.createObjectURL`).

## Module layout and public surface

```
packages/all-of-oyl/src/client/
  index.ts        barrel for @oyl/all-of-oyl/client
  ports.ts        injected-global interfaces
  reactive/       signal.ts computed.ts effect.ts internals.ts
  storage/        keys.ts clock.ts config.ts settings.ts schema.ts connectivity.ts
                  lock.ts bootstrap.ts seed.ts backup.ts
  stores/         journal.ts planner.ts vault.ts goals.ts budgets.ts accounts.ts
                  consumables.ts consumable-products.ts profile.ts google.ts notice.ts
  session/        auth.ts auth-guard.ts route.ts
  data.ts         createDataState
```

- `packages/all-of-oyl/package.json` `exports` gains `"./client": "./src/client/index.ts"`
  (mirrors `./format`).
- The barrel exports the **same names** vanilla imports today (`signal`, `computed`,
  `effect`, `createJournalStore`, `createDataState`, `makeRepositories`, `createFlusher`,
  `decodeBootstrap`, `parsePath`, `createRouteState`, `createAuthState`, `seedAccount`, …).
  No export is renamed and no store API is reshaped; Stencil-specific ergonomics are
  sub-project 2's concern.
- Inside `client/`, imports are **relative with `.js` extensions only**, including domain
  types (`../journal/…`). `client/` never imports the bare `@oyl/all-of-oyl` specifier, which
  keeps `scripts/check-no-bare-imports.mjs` green. The root barrel (`src/index.ts`) does
  **not** re-export `client/`, so the domain core never depends on signals.
- `pnpm all-of build` already emits all of `src/` into `dist/`, so `dist/client/` appears
  without build-config changes. `apps/vanilla-oyl/scripts/copy-lib.mjs` copies all of `dist/`
  and is unchanged.
- `apps/vanilla-oyl/index.html` importmap gains
  `"@oyl/all-of-oyl/client": "/vendor/all-of-oyl/client/index.js"` (root-absolute path, per
  CLAUDE.md).
- vanilla's `tsc` (bundler resolution) and Vitest resolve `/client` to TS source through
  `exports` without extra config.
- Tests move with their modules as co-located `*.test.ts` and run in all-of-oyl's Vitest
  (node environment, no happy-dom).

## Seams: injected globals

The all-of-oyl browser build compiles with `lib: ["ES2022"]` (no DOM). Everything
browser-shaped becomes a minimal structural interface in `client/ports.ts`, reusing the
existing core ports where they exist.

| Global today | Port | Used by |
|---|---|---|
| `localStorage` | `EnumerableStorage extends StorageLike` (core) adding `key(i)`, `length`, `removeItem` (only the members actually used) | data, schema, keys, settings, seed, backup |
| `fetch` | `FetchFn` (existing, `core/http-repository.ts`) | auth, google |
| `location`, `history`, `popstate`, `URL` | `RouteWindow` = `LocationLike` + `HistoryLike` + `EventTargetLike` + `URL` constructor | route |
| `location.hash` + `history.replaceState` (`#google=` adoption) | `LocationLike` + `HistoryLike` | auth |
| `navigator.onLine` + `online`/`offline` events | `ConnectivityWindow` → existing `Connectivity` | `createBrowserConnectivity` |
| `navigator.locks` | `LockManagerLike` (optional member) | `createBrowserLock` |
| `navigator.storage.estimate` | `estimateStorage?: () => Promise<{ usage: number, quota: number } \| null>` option | `createDataState` (Status diagnostics) |
| `crypto.randomUUID` | `newId?: () => string` option | `makeRepositories` (outbox mutation ids), seed (`remapIds`) |
| `globalThis.__OYL_LIB_BUILD__` | `build?: string` option | `createDataState().readDiagnostics` |
| `document` (backup download) | not ported; the download stays in vanilla | — |

### Route state

`createRouteState` currently defaults `win = window`, calls `new URL(path, win.location.origin)`,
and calls vanilla's `interceptLinks(win, navigate)` inside `start()`. It becomes:

```ts
createRouteState(win: RouteWindow, opts?: { interceptLinks?: (navigate: Navigate) => () => void })
```

- `win` is required (no `window` default).
- `URL` is taken from `win.URL` (browsers expose `window.URL`), so URL semantics are
  unchanged and no path parsing is hand-rolled.
- `interceptLinks` defaults to a no-op; vanilla passes `(navigate) => interceptLinks(window, navigate)` over its existing `link-interceptor.js` (see Amendment 3).

### Defaults vs. required

- **Browser adapters** (`createBrowserConnectivity(win)`, `createBrowserLock(win)`,
  `createRouteState(win, …)`) take their port as a **required** argument, as today.
- **Diagnostics/id options** get ES-only defaults: `estimateStorage → async () => null`,
  `newId →` the existing `m-${Date.now()}-${random}` fallback, `build → 'dev'`. vanilla's
  `main.js` passes the real browser implementations (`crypto.randomUUID`,
  `navigator.storage.estimate`, `__OYL_LIB_BUILD__`), so app behavior is unchanged. A
  composition test (below) guards against a forgotten wire.

Structural probes such as `(globalThis.crypto)` cast to `{ randomUUID?: … }` compile
without the DOM lib, so the build gate would not catch them. They are converted to options
anyway, because CLAUDE.md's rule is "injected via interfaces", not "compiles without DOM".

### TS port rules

- JSDoc types become TS types one-for-one, and `@typedef`s become exported `type`s. There is
  no logic change, export renaming, or reordering of behavior.
- The strict `src/` gate applies (`noUnusedLocals`, `noUnusedParameters`,
  `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`). Existing `any` casts may carry
  over as `any`; no new ones are added, and no compiler rule or lint rule is loosened.
- The `exactOptionalPropertyTypes` spread idiom (`...(x !== undefined ? { x } : {})`) is
  preserved.
- `Intl` and `Date` are ECMAScript; `clock.ts` keeps using them directly.

## Migration sequence

One branch, `refactor/extract-client-layer`, off `master`. One commit per layer; each commit
moves its modules + tests, re-points vanilla imports, and deletes the originals.

| # | Commit | Moves | vanilla re-points | e2e |
|---|---|---|---|---|
| 1 | Scaffold `/client` | `index.ts`, `ports.ts`, `exports` entry, importmap entry | — | — |
| 2 | Reactive core | `signal`, `computed`, `effect`, `internals` | ~40 sites incl. `oyl-element.js`, `main.js` | **run** |
| 3 | Storage leaves | `keys`, `clock`, `config`, `settings`, `schema`, `connectivity`, `lock` | ~25 sites | — |
| 4 | Domain stores | 8 data stores + `profile`, `google`, `notice` | ~20 sites | — |
| 5 | Data wiring | `bootstrap`, `data` (+ `estimateStorage`/`newId`/`build` options, wired via new vanilla `storage/browser-ports.js`) | `main.js`, status panel | **run** |
| 6 | Session | `auth`, `auth-guard`, `route` (+ `interceptLinks`/`URL` seams) | `main.js` | — |
| 7 | Seed/backup | `seed`, backup serialize/parse | `main.js`, status panel | **run** (final) |
| 8 | Docs | CLAUDE.md (all-of-oyl row, `/client` convention), this spec's status | — | — |

The reactive core moves as one unit in commit 2 because `internals.ts` holds the
"currently running effect" tracking context. If any module resolves a second copy,
dependencies silently stop registering and screens stop re-rendering with no error.

## Verification

**Every commit:**

- `pnpm --filter @oyl/all-of-oyl test`
- `pnpm all-of typecheck:src` (strict, DOM-free)
- `pnpm --filter @oyl/all-of-oyl exec tsc --noEmit`
- `pnpm all-of build` (DOM-safety + no bare imports in `dist/`)
- `pnpm vanilla test`
- `pnpm vanilla typecheck`

**Commits 2, 5, 7:** `pnpm e2e` green on desktop + mobile, with **no spec edits**.

**Guardrail tests (new):**

1. **Single reactive instance** (vanilla, commit 2): an `OylElement` subclass renders a
   `signal` imported from `@oyl/all-of-oyl/client`; setting the signal re-renders the
   element. Fails if vanilla ever resolves a second copy of the reactive core.
2. **Composition wiring** (vanilla, commit 5): the data layer `main.js` builds receives a
   `newId` backed by `crypto.randomUUID` and a non-default `estimateStorage`. To make this
   testable, commit 5 extracts `main.js`'s data-layer option assembly into an exported
   `browserDataPorts(globalLike)` in vanilla's new `src/storage/browser-ports.js`; the test
   calls it with a fake `globalThis`-shaped object.
3. **New seams** (all-of-oyl): `createRouteState` uses `win.URL` and calls the injected
   `interceptLinks` on `start()` (and its disposer on `stop()`); `createDataState` reports the
   injected `build` and `estimateStorage` values in `readDiagnostics()`.

**Test count:** before commit 1, record the all-of-oyl + vanilla unit test counts. After
commit 7, the combined count must be ≥ baseline plus the new guardrail tests. Moved tests
change only in file extension, import paths, type annotations, and fake ports replacing
happy-dom globals; assertions are not weakened or removed.

**TDD:** for moved modules, the moved test is the failing-first test (it moves first and
fails on the missing module; then the module moves and it passes). The seams and guardrails
above are genuinely new tests written before their code.

## Out of scope

- Any Stencil code, `packages/ui-oyl`, `apps/stencil-oyl` (sub-projects 1–2).
- Reshaping store or signal APIs for Stencil ergonomics; the signals↔Stencil bridge.
- Theme/layout state and catalogs, `OylElement`, `link-interceptor`, `debounce`,
  `sample-data`, backup download.
- Backend, API, deploy, and CI changes. No API surface changes, so `E2E_BACKEND=php pnpm e2e`
  is not required.

## Risks

| Risk | Mitigation |
|---|---|
| Two reactive-core instances, so screens silently stop updating | Core moves as one unit (commit 2); single-instance guardrail test; e2e at commit 2 |
| Moved tests dropped or weakened | Baseline count before commit 1; tests move verbatim except for the listed mechanical changes |
| A happy-dom-dependent test hides a real DOM dependency | Tests run in node env in all-of-oyl, so a DOM need fails and gets a port, never a polyfill |
| Inline-importmap CSP hash drift | Confirm `scripts/dreamhost/publish-www.sh` computes the hash from `index.html` at publish time (its existing deploy-script tests, plus `pnpm deploy:dreamhost --dry-run --only www`) — not run (it connects to production); verified instead by reading publish-www.sh → render-htaccess.mjs → deploy/csp-hashes.js, which hash index.html's inline scripts at publish time |
| Docker image build | `Dockerfile.app` copies package manifests; confirm `docker compose build vanilla` still succeeds after the `exports` change |

## Success criteria

- `apps/vanilla-oyl/src/lib/reactive/` contains only `oyl-element.js` (+ test);
  `apps/vanilla-oyl/src/state/` contains only `link-interceptor`, `theme`, `layout` (+ tests);
  `apps/vanilla-oyl/src/storage/` contains only `browser-ports.js` (+ test).
- All verification gates are green, and the e2e suite passes with no spec changes.
- `@oyl/all-of-oyl/client` is importable from strict TS (source) and from the browser build
  (`dist/client/index.js` via importmap).

## Amendments during planning

1. **`backup.js` moves whole.** The download (`URL.createObjectURL` anchor click) lives in vanilla's `main.js`, not in `storage/backup.js`, which is DOM-free. vanilla's `src/storage/` therefore ends with only `browser-ports.js` (+ test).
2. **`createDataState`'s `themeState` becomes a structural port.** `data.js` takes vanilla's `ThemeState` only to echo `themeState.settings.get()` in `readDiagnostics()`. Theme state stays in vanilla, so `data.ts` types it as `{ settings: { get(): TTheme } }` (generic `TTheme`).
3. **The `interceptLinks` option is a thunk over `navigate` only:** `interceptLinks?: (navigate: Navigate) => () => void`. Passing route's `RouteWindow` to vanilla's `interceptLinks(win: Window, …)` would fail `strictFunctionTypes`. vanilla passes `(nav) => interceptLinks(window, nav)`.
4. **Host globals `queueMicrotask` and `console`** (used by `reactive/internals`) are declared module-locally, following the existing precedent in `core/id.ts` (`declare const crypto: …`). They are ECMAScript-host APIs present in every runtime, not DOM, so they are not injected.
5. **`seed.ts`'s `remapIds` default id source becomes core `Id.create()`** (which is `crypto.randomUUID()` via `core/id.ts`). The behavior is identical, with no new global probe.
