# vanilla-oyl Foundation — Design

**Date:** 2026-06-12
**Status:** Approved
**Builds on:** `2026-06-11-all-of-oyl-domain-core-design.md`

## Purpose

Establish `apps/vanilla-oyl` as the first app under the new `apps/` root: a
zero-runtime-dependency web app — pure JavaScript with comprehensive JSDoc/TypeScript
annotations, HTML5 + Web Components, modern CSS3 — consuming `packages/all-of-oyl/src`
as the single source of truth for all business logic, with localStorage as the database
until a new backend exists.

This spec covers the **foundation only**: workspace wiring, the browser build of
all-of-oyl, a `LocalStorageRepository` in the shared core, the reactive state system,
theming, the app shell, a hash router, multi-tab coherence, backup/restore, and a
Status screen that proves every subsystem end-to-end. Domain screens (journal, planner,
vault, goals/insights) are each a follow-up spec built on this foundation.

## At a glance (decisions)

1. New apps live in `apps/*`; `packages/vanilla-oyl` is renamed `@oyl/vanilla-oyl-legacy`
   and deleted later.
2. Zero **runtime** dependencies in the app; minimal devDependencies for tooling
   (typescript, vitest, happy-dom, http-server).
3. App code is `.js` with comprehensive JSDoc annotations, checked by `tsc` under
   `strict` + `checkJs`. No compile step for app code.
4. all-of-oyl gains a package-owned `build` (tsc → `dist/` ESM + `.d.ts`); the app
   references it through a one-entry `importmap`. Existing consumers keep typechecking
   the TS source — `exports` does not change.
5. `LocalStorageRepository<T>` lives in `all-of-oyl/src/core`, written against an
   injected `StorageLike` (and the same injected `clock` as `InMemoryRepository`),
   validated by a repository **contract test suite** shared with `InMemoryRepository`.
   A new `collections` manifest in all-of-oyl maps every persistable collection to its
   codec — the one list apps and the future backend share.
6. Web Components use shadow DOM + shared constructable stylesheets; themes are CSS
   custom properties that inherit through shadow boundaries.
7. Two themes (`classic`, `forest`) × light/dark modes via `light-dark()` +
   `color-scheme`; mode defaults to `prefers-color-scheme`.
8. Reactive state: a ~150-line signals core (`signal`/`computed`/`effect`, microtask
   batching, TC39-aligned semantics) + `OylElement` base class with fine-grained
   bindings (build template once, bind parts with effects — no VDOM, no diffing).
9. localStorage is treated as a real database: namespaced keys, a schema-version key,
   export/import backup, explicit (never automatic) demo seeding.
10. Hash router with View Transitions; `storage`-event listener for multi-tab coherence.

## Scope and decomposition

**In scope (this spec):** everything listed above, plus responsive layout and the
Status screen.

**Out of scope (each a future spec):** domain screens (journal → planner → vault →
goals/insights), the replacement backend, Playwright e2e wiring, deleting the legacy
package, PWA/offline manifest, form-associated custom elements (`ElementInternals` —
arrives with the first real form), IndexedDB (the `Repository` port makes a later swap
free; localStorage is the decision until the backend spec).

**Decided-next, not built-now — write-path coherence.** The foundation only ever
re-hydrates the in-memory roots wholesale (on boot, seed, import, and multi-tab events),
so repo and root never disagree. The first domain screen that *writes* a single record
must keep the repository and the hydrated `Journal`/`Planner`/`Vault` signal in sync —
either surgical update of the root or targeted re-hydrate. Naming it here so the first
screen spec designs it deliberately rather than discovering it. The foundation
deliberately ships no per-record write path.

## Workspace changes

- `pnpm-workspace.yaml`: add `apps/*`.
- `packages/vanilla-oyl/package.json`: rename package to `@oyl/vanilla-oyl-legacy`
  (folder stays; nothing else changes there). **Before renaming**, audit references to
  the old name/script: the root `vanilla` filter script, the `vanilla (manual)` docker
  compose service, and `CLAUDE.md`'s `pnpm vanilla preview` note all assume the old
  package. The new app uses `dev`, not `preview`, and reclaims host port 8041.
- Root `package.json`: `vanilla` filter script points at the new `@oyl/vanilla-oyl`
  in `apps/`; `test` / `lint` / `typecheck` aggregates widen from `./packages/*` to
  include `./apps/*`.

## all-of-oyl updates

### Browser-resolvable ESM

`tsc` never rewrites import specifiers, so emitted ESM must carry extensions the
browser can resolve natively:

- All relative imports in `src/` (including tests) gain explicit `.js` extensions.
- `src/tsconfig.json`: `module` and `moduleResolution` → `nodenext`.
- Vitest and the existing consumers (react-oyl, next-oyl, which typecheck the TS
  source) are unaffected.

### Package-owned build

- New `tsconfig.build.json`: emits ESM JS + `.d.ts` + sourcemaps to `dist/`;
  includes `fixtures/` (the Status screen and demo seeding use `makeSeed`),
  excludes `*.test.ts`.
- New script: `"build": "tsc -p tsconfig.build.json"` (callable as `pnpm all-of build`).
- `exports` map unchanged — only the vanilla app's **browser runtime** consumes `dist/`,
  by copying it, not via Node resolution. `dist/` is gitignored.
- `inlineSources: true` (or `sourcesContent`) in the build so the sourcemaps still
  resolve after `dist/` is copied to the app's `vendor/` (the original `src/` is no
  longer at the map's relative path).
- **One-importmap-entry invariant:** the importmap has exactly one entry because every
  internal import in `dist/` is relative and resolves natively. This holds only while
  `dist/` contains **zero bare-specifier imports**. A build-time check greps the emitted
  `dist/` for bare imports and fails the build if any appear (e.g. a future stray
  `rrule` import) — the invariant is enforced, not assumed.

### LocalStorageRepository

New `src/core/local-storage-repository.ts`:

```ts
interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

class LocalStorageRepository<T extends { id: Id; meta?: PersistedMeta }>
  implements Repository<T> {
  constructor(
    storage: StorageLike,
    key: string,                       // full storage key, e.g. 'oyl/data/entries'
    codec: {
      toJSON(item: T): unknown
      fromJSON(shape: unknown): T      // e.g. reviveEntry / revivePlan / Goal.fromJSON
    },
    clock?: () => Date,                // injected like InMemoryRepository, for deterministic meta in tests
  )
}
```

- One storage key per collection holding a JSON array of `toJSON` shapes.
- Semantics mirror `InMemoryRepository` exactly: meta stamping on save,
  `REVISION_CONFLICT` on stale revisions, soft delete via `deletedAt`,
  idempotent `purge`.
- **Clones, does not alias.** `InMemoryRepository` is documented as a reference that
  aliases and mutates the caller's object in place; this adapter serializes through
  JSON, so reads and writes are naturally cloned. Callers must read `meta` off the
  **returned** item, never assume their input was mutated.
- `StorageLike` is injected, so the adapter is unit-testable in Node with an
  in-memory fake and reusable by react-oyl later. The domain never touches
  `window.localStorage` directly; the app passes it in.
- Exported from `src/index.ts` (with `StorageLike`).

### Collections manifest (single source of truth for what's persistable)

`Seed` already enumerates the canonical set of collections (18 today: users, lifeAreas,
activities, foods, accounts, entries, goals, budgets, plans, projects, dayPlans,
documents, possessions, subscriptions, contacts, giftIdeas, connections, grants) and
implies each one's codec. To stop apps from re-deriving (and drifting from) that
mapping, add `src/collections.ts`: a manifest mapping each collection name to its
codec `{ toJSON, fromJSON }` — `entries`→`reviveEntry`, `plans`→`revivePlan`, every
other collection→its class `fromJSON`. `bootstrap.js`, `backup.js`, demo seeding, and
the eventual backend all consume this one manifest. Adding a domain later means one
manifest entry, in the domain core, where it belongs. Exported from `src/index.ts`.

### Repository contract suite

Extract the behavioral assertions from the existing `InMemoryRepository` tests into a
shared contract suite (`src/core/repository-contract.ts` or equivalent test helper):
a function that, given a factory for a fresh `Repository<T>` (and a shared fake clock),
runs the full set of get/list/save/delete/purge/meta/conflict assertions. Both
`InMemoryRepository` and `LocalStorageRepository` must pass it verbatim.

The contract asserts **behavior, not object identity**: meta *values*, revision math,
`REVISION_CONFLICT` throwing, soft-deleted records invisible to `get`/`list` — all read
off the **returned** item. It must not assert the in-memory adapter's aliasing, since
the two implementations legitimately differ there. The contract is the spec; written
before the new adapter.

## App structure

```
apps/vanilla-oyl/
  index.html              # importmap { "@oyl/all-of-oyl": "./vendor/all-of-oyl/index.js" },
                          # inline head theme-bootstrap script (anti-FOUC), modulepreload
                          # hints, document-level stylesheets, <oyl-shell>, module-load fallback
  package.json            # @oyl/vanilla-oyl; devDeps only: typescript, vitest, happy-dom,
                          # http-server, @oyl/all-of-oyl (workspace:*)
  tsconfig.json           # allowJs + checkJs + strict (mirrors src's noUncheckedIndexedAccess
                          # + exactOptionalPropertyTypes), noEmit. '@oyl/all-of-oyl' resolves
                          # via the workspace symlink to src/index.ts — like every other
                          # consumer — so typecheck/tests need NO prior build (build is
                          # browser-runtime only)
  scripts/copy-lib.mjs    # copies packages/all-of-oyl/dist → vendor/all-of-oyl
  src/
    main.js               # registers elements, boots theme manager + router + storage
    lib/reactive/         # signal.js, computed.js, effect.js, oyl-element.js
    state/                # signal-holding modules: theme.js, route.js, data.js (hydrated
                          # roots + storage health)
    storage/
      keys.js             # the key-namespace constants (single source of key names)
      bootstrap.js        # walks the all-of-oyl `collections` manifest to construct one
                          # LocalStorageRepository per collection, hydrates
                          # Journal/Planner/Vault + catalogs into state signals
      clock.js            # single now()/today provider; default timezone from
                          # Intl…resolvedOptions().timeZone (no user record yet)
      schema.js           # schema-version read/write + migration seam
      backup.js           # export/import (download / file-picker restore)
      seed.js             # explicit demo-data seeding via makeSeed
    components/           # oyl-shell.js, oyl-theme-toggle.js, oyl-router.js,
                          # oyl-status-panel.js, shared stylesheet helpers
  styles/                 # document-level, layered: reset.css, tokens.css,
                          # themes/classic.css, themes/forest.css, layout.css
  test/                   # vitest unit + component tests
  vendor/                 # build output target, gitignored
```

Scripts:

- `dev` — build all-of-oyl → `copy-lib` → `http-server -c-1 -p 8041`. Note: the
  unbundled barrel pulls dozens of ESM files; over HTTP/1.1 (`http-server`) that's a
  request waterfall. Acceptable for a personal app, mitigated with
  `<link rel="modulepreload">` hints for the entry modules; a no-dependency bundling
  step is a deferred option if it ever bites.
- `dev:watch` — `tsc --watch` on all-of-oyl with copy-on-change (or `vendor/all-of-oyl`
  as a symlink to `dist/` for the duration), so edits on either side of the parity
  boundary are live.
- `test` — vitest (node env for pure logic, happy-dom for component tests).
- `typecheck` — `tsc --noEmit`.

## Storage: namespace, schema, backup, seeding

### Key namespace (defined once, in `storage/keys.js`)

| Key | Holds |
|---|---|
| `oyl/schema-version` | Integer version of the stored shapes |
| `oyl/settings` | Theme, mode, and future app preferences (JSON) |
| `oyl/data/<collection>` | One JSON array per collection (entries, plans, goals, …) |

The `oyl/` prefix is the filter for the multi-tab listener and the capture set for
export. No other localStorage keys are read or written.

### Schema version

Written on first boot; checked on every boot. On mismatch, a migration step runs
before hydration (the foundation ships version `1` and an empty migration table —
the seam exists so the first breaking `toJSON` change has somewhere to live).
Unknown *higher* version (downgrade scenario) → error state on the Status screen,
no writes.

### Export / import

- **Export:** one JSON document — schema version, exported-at instant, settings, and
  every `oyl/data/*` collection (already `toJSON` shapes — the wire format is the
  backup format is the future backend-seed format). Downloaded via a Blob link.
- **Import:** file picker → validate schema version (migrate if older) → run every
  shape through the revivers (via the `collections` manifest — unknown kinds throw, so
  corrupt backups are rejected loudly, before anything is written) → write collections,
  then write `oyl/schema-version` **last** as the commit point → re-hydrate state.
  Import **replaces**; merge is explicitly out of scope.
- **Torn-write safety:** localStorage has no multi-key transaction, so a crash mid-import
  could leave partial data. Mitigation: validate fully before the first write, and treat
  `oyl/schema-version` as the commit marker (written last). On boot, data keys present
  without a valid version = torn write → recovery prompt on the Status screen, no silent
  use of half-written state.

### Seeding

Never automatic. Empty-on-first-visit is the honest state. Demo data loads only via
the Status screen's "Load demo data" button (confirm-gated if data exists) or the
`?seed` query param for dev convenience. Seeding writes `makeSeed` fixtures through
the normal repositories (walking the `collections` manifest, so the full round-trip
of every persistable type is exercised).

**Single local profile.** The foundation has no auth and one implicit local profile.
The demo seed includes a second user plus connections/grants purely to round-trip the
sharing *shapes*; sharing itself is **inert** here — per the domain spec, grant
evaluation requires a trusted boundary, so client-only sharing is decoration until the
backend exists. Multi-profile/auth is out of scope.

## Theming and modern CSS

### Mechanism

- `<html data-theme="classic|forest">` selects the palette;
  `color-scheme: light | dark` on `:root` selects the mode.
- Tokens are CSS custom properties declared once per theme using **`light-dark()`**,
  so each theme defines both modes in one block:
  `--color-bg: light-dark(oklch(97% 0.01 90), oklch(18% 0.01 90))`.
- Mode defaults to `prefers-color-scheme` and live-follows the OS **until** the user
  explicitly chooses; explicit choices persist to `oyl/settings`. Three mode states map
  to `color-scheme` on `:root`: `system`→`light dark` (UA picks, `light-dark()` follows
  `prefers-color-scheme`), `light`→`light`, `dark`→`dark`.
- Custom properties **and `color-scheme`** inherit through shadow boundaries, so
  `light-dark()` inside component sheets resolves to the active mode — components consume
  tokens and never know which theme is active.
- **Anti-FOUC:** a single tiny inline `<script>` in `<head>` reads `oyl/settings` and
  sets `data-theme` + `color-scheme` synchronously before first paint, so reloads never
  flash the default theme. This is the only inline JS in the app and the one element a
  future CSP must hash; `theme-manager.js` takes over once modules load.

### CSS feature commitments (all evergreen-baseline; importmaps already set that floor)

- **`oklch()`** palettes (perceptually uniform lightness → tractable contrast-safe
  light/dark pairs) and **`color-mix()`** for derived hover/active states.
- **`@property`**-registered tokens for anything animated.
- **Container queries** for component responsiveness; viewport media queries reserved
  for the shell's macro layout.
- Native **CSS nesting**; **`@layer reset, tokens, themes, layout`** ordering the
  document-level sheets (shadow DOM handles component isolation).
- Fluid type/spacing via **`clamp()`**; **logical properties** throughout;
  **`dvh`** + `env(safe-area-inset-*)` for the shell.
- **`@starting-style`** + `transition-behavior: allow-discrete` for entry/exit
  transitions, gated behind `prefers-reduced-motion`.

### Accessibility (baked into the token system, not retrofitted)

- Every theme×mode combination ships contrast-checked token pairs (AA minimum).
- `:focus-visible` ring tokens; visible focus everywhere.
- `prefers-reduced-motion` respected by all transitions, including view transitions.
- `<oyl-shell>` exposes proper landmarks (header/nav/main); components carry ARIA
  where shadow DOM hides native semantics.
- **Route changes** move focus to the new view's heading and announce via an
  `aria-live` region — View Transitions are visual only and don't help screen-reader
  or keyboard users.
- Theme names are placeholders; visual identity gets the frontend-design treatment
  at implementation.

## Responsive design

Mobile-first. The shell is a CSS grid with named areas; navigation collapses to a
bottom bar on narrow viewports and sits as a header rail on wide ones. Every component
is a container (`container-type: inline-size`) and adapts to its own width — domain
screens added later inherit responsiveness from the token + container-query system
rather than reimplementing breakpoints.

## Reactive state system (`src/lib/reactive/`)

A small signals core — TC39-Signals-aligned **semantics**, minimal **API** (if native
`Signal` lands, migration is a reimplementation of three functions, not an app rewrite):

- **`signal(initial, equals?)`** — readable/writable reactive value; reads inside an
  active effect auto-track; writes notify dependents. An **equality gate** (`Object.is`
  by default; opt-in custom comparator) skips notification when the value is unchanged —
  signals holding domain value objects can pass `.equals` to avoid spurious re-runs.
- **`computed(fn)`** — derived, lazily recomputed, trackable; same equality gate.
- **`effect(fn)`** — runs now (synchronously, so a connected element has content
  immediately), re-runs when tracked signals change; returns `dispose()`. Re-runs batch
  on a microtask: multiple writes in one tick paint once, and an effect never observes a
  half-updated batch (glitch-free). **Cycle detection:** an effect that writes a signal
  it reads throws rather than looping forever. **Disposal** removes the effect from every
  source's subscriber set — no dangling references, no leaks.

**`OylElement`** (extends `HTMLElement`), the Lit-like layer on the Solid-like core:

- Constructor: shadow root + shared constructable stylesheets (`adoptedStyleSheets`,
  sheets built from JS template strings via `replaceSync` — CSS module scripts are
  not yet cross-browser baseline).
- `connectedCallback`: build the template **once**; bind dynamic parts (text nodes,
  attributes, class/visibility toggles) with individual effects. No VDOM, no diffing,
  no re-render-the-world — a signal change updates exactly the bound node, and input
  focus/state survives updates for free.
- **Lifecycle ownership:** every effect and event listener registers against a
  per-instance `AbortController`; `disconnectedCallback` aborts it. Leak-free by
  construction.
- Attribute ↔ signal reflection helper for `data-`-driven variants.

App-level shared state lives in plain signal-holding modules under `src/state/`
(theme, mode, route, hydrated roots, storage health) — imported directly by
components; no global store object, no context machinery.

The signals **contract suite is written before the implementation**: tracking,
batching, glitch-freedom, computed laziness, equality-gate suppression, cycle detection,
disposal (subscriber removal), nested effects. Highest-risk code in the app, best TDD
material in it.

## Router and view transitions

- `route` signal fed by `hashchange`; `<oyl-router>` maps hash → view element and
  swaps inside `document.startViewTransition()` when available (plain swap otherwise,
  and always plain under `prefers-reduced-motion`).
- Foundation routes: `#/status` (default) — the route table is data, adding domain
  screens later is one entry each.

## Multi-tab coherence

A `storage`-event listener (fires only in *other* tabs) filtered to the `oyl/` prefix:

- `oyl/settings` changed → theme/mode signals update (tabs agree on appearance).
- `oyl/data/*` or `oyl/schema-version` changed → re-hydrate roots into the state
  signals; bound DOM updates ripple automatically.

`REVISION_CONFLICT` from the repository remains the integrity backstop when two tabs
race a write; the listener is UX coherence, not a substitute.

## Status screen (`#/status`)

The foundation's proof and permanent diagnostics page. It exercises **every**
subsystem, and the foundation's acceptance list is exactly this screen's behaviors:

1. Imports `@oyl/all-of-oyl` via the importmap (build + copy + importmap proven).
2. Boots repositories over real localStorage; reads back through the revivers;
   hydrates `Journal`/`Planner`/`Vault` (adapter + codecs + hydration proven).
3. Renders live record counts per collection through signal bindings (reactive core
   proven — counts update without re-render).
4. Shows schema version, storage health, `navigator.storage.estimate()` readout,
   active theme/mode, and the lib build timestamp.
5. Hosts "Download backup", "Import backup", "Load demo data" (confirm-gated), and
   confirm-gated "Reset local data".
6. Default route — arriving proves the router; navigating proves view transitions.
7. Two open tabs: importing data in one updates the other (multi-tab proven).
8. Renders `DomainError` states (corrupt data, version-downgrade, quota) as visible
   error panels, never swallowed.

## Error handling

- **Module-load failure** (broken build/importmap): static fallback message in
  `index.html`, shown until `main.js` boots and removes it.
- **Corrupt stored data:** revivers throw `DomainError('UNKNOWN_KIND', …)` → Status
  screen error panel with confirm-gated "Reset local data". No partial hydration.
- **Schema downgrade** (stored version newer than app): read-only error state, no
  writes.
- **Quota exceeded:** save failures propagate and render; never swallowed.
- **Effect errors:** an effect that throws logs and disposes itself rather than
  wedging the batch queue.

## Testing strategy (TDD throughout)

| Layer | How |
|---|---|
| Signals core | Behavioral contract suite written first (node env): tracking, batching, glitch-freedom, laziness, disposal |
| `LocalStorageRepository` | Shared repository contract suite (vitest, fake `StorageLike`) run against both adapters |
| Schema/backup/seed | Unit tests over fake storage: version gates, atomic import, reviver rejection of corrupt payloads |
| Theme manager | Pure unit tests: state transitions, system-follow vs explicit, persistence |
| Components | vitest + happy-dom: registration, render, bindings update, toggle interaction, disconnect cleanup (no leaked effects). Tests guard `customElements.define` (re-register across files throws) |
| Types | `tsc --noEmit` over JSDoc-annotated JS, strict + checkJs |
| Browser truth | Manual via `pnpm vanilla dev` against the Status screen's acceptance list; Playwright e2e is a named follow-up |

**happy-dom capability gap (be honest about it):** happy-dom does not fully implement
`adoptedStyleSheets`/`CSSStyleSheet.replaceSync`, `document.startViewTransition`,
`matchMedia`, `crypto.randomUUID`, or `navigator.storage.estimate`. So component
**logic** (binding updates, events, disconnect cleanup) is unit-tested with documented
shims for those APIs; CSS **rendering** (themes, container queries, transitions) is
verified only in a real browser. Every one of those APIs is feature-detected in app
code regardless, so a missing API degrades rather than throws.

## Build sequence (for the implementation plan)

Bottom-up, each phase green before the next: reactive core → all-of-oyl updates
(`.js` extensions, build + bare-specifier guard, `LocalStorageRepository` + shared
contract, `collections` manifest) → app skeleton (workspace rename/audit, importmap,
anti-FOUC head script, copy-lib) → storage layer (keys, schema/torn-write, manifest-driven
bootstrap, backup, seed) → themes/tokens → components (`OylElement`, toggle, shell) →
router (+ focus/live-region a11y) → Status screen → manual acceptance pass.

Typecheck and unit tests resolve all-of-oyl to `src` and so never depend on the build;
only the browser-facing phases (`copy-lib`, `dev`, manual acceptance) require
`pnpm all-of build` first.
