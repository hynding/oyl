# Vanilla-OYL interchangeable layout system — design

**Date:** 2026-08-07
**Status:** approved design, pre-implementation
**Goal:** let the app's global frame ("layout") be swapped by the user to experiment with
engagement- and retention-driving designs, with a widget system (charts, streaks, digests)
as the new engagement surface. Adding a layout must be a one-file affair; content and
values must never be duplicated across layouts or widgets.

## Scope decisions (from brainstorming)

- **What swaps:** the whole app shell (frame) — nav placement, page width, widget regions.
  Screens, router, and stores are untouched by a switch; `oyl-nav` gains one
  presentation-only `orientation` attribute (its tab row must re-orient vertically for the
  sidebar layout, which shell CSS cannot reach across the shadow boundary).
- **Layout set (v1):** `classic` (current frame, the default), `sidebar`, `dashboard`,
  `focus`, `wide`.
- **Switching:** a user-facing picker in the header toolbar, persisted per device in the
  existing settings blob (`SETTINGS_KEY`), exactly like the theme system.
- **Widgets (v1):** greeting digest, streak ring, today's plan, trend sparklines, goal
  rings — zero-dependency SVG/CSS, fed by existing stores; empty data falls back to
  clearly-badged sample fixtures.
- **Out of scope:** engagement measurement/analytics (deferred sub-project), per-screen
  layout variants, per-layout widget configuration, server-side layout preference,
  a `?layout=` URL override.

## Architecture

### Layout modules and catalog

New directory `apps/vanilla-oyl/src/layouts/` — one module per layout plus a catalog,
mirroring the theme-catalog pattern:

```
src/layouts/
  layout-catalog.js   # LAYOUTS, byId(), DEFAULT_LAYOUT = 'classic', isLayoutId()
  classic.js          # current single-column top-nav frame, extracted as-is
  sidebar.js          # side nav + vertical widget rail, wide page
  dashboard.js        # horizontal widget band above the page, top nav
  focus.js            # minimal chrome, floating nav, no widgets
  wide.js             # 960px+ frame, top nav, no widgets
```

Each module exports one frozen descriptor:

```js
{
  id: 'sidebar',            // catalog key, persisted value
  label: 'Sidebar',         // picker label
  description: '…',         // picker hint
  navMode: 'top' | 'side' | 'floating',
  widgets: 'rail' | 'band' | 'none',
  pageWidth: 'classic' | 'wide' | 'full',
  styles: sheet(`…`),       // this layout's structural CSS only
}
```

Descriptors are data + one constructable stylesheet. Adding a layout = new module + one
import line in the catalog; deleting a failed experiment = delete the file.

The five v1 descriptors:

| id | navMode | widgets | pageWidth |
|---|---|---|---|
| `classic` | `top` | `none` | `classic` (680px, today's frame) |
| `sidebar` | `side` | `rail` | `wide` (960px) |
| `dashboard` | `top` | `band` | `classic` (680px) |
| `focus` | `floating` | `none` | `classic` (680px, larger type/whitespace via its sheet) |
| `wide` | `top` | `none` | `wide` (960px) |

Who consumes which field: the shell reads `widgets` (dock placement + deck `mode`
reflection) and `navMode` (reflected as `orientation` onto the slotted `oyl-nav`);
`pageWidth` is *metadata* for the picker hint and tests — the actual width is encoded in
each layout's `styles` sheet. `id`/`label`/`description` feed the picker and persistence.

### Shell refactor

`oyl-shell` remains the single frame component. It keeps its slot contract (`nav`,
`toolbar`, `main`) and gains:

- a `widgets` slot,
- a `layoutSignal` prop (`Signal<string>` of layout ids).

Its shadow DOM becomes a named-region CSS grid — regions `header`, `nav-dock`,
`widgets-dock`, `page`. A `track()` reacts to the layout signal by:

1. `this.setAttribute('layout', id)` (hook for per-layout selectors),
2. reflecting `orientation` (from `navMode`) onto the slotted `oyl-nav` and `mode`
   (`rail`/`band`) onto the slotted `oyl-widgets`, and
3. `shadowRoot.adoptedStyleSheets = [...OylElement baseStyles, baseSheet, active.styles]`
   — the element-level `baseStyles` (box-sizing reset + focus ring adopted by
   `OylElement`'s constructor) must be re-included, or the swap would discard them.

`baseSheet` holds everything shared: header rules, safe-area padding, region/wrapper
geometry for the docks, and the entire under-640px mobile arrangement (bottom-tab dock,
page bottom padding). Per-layout sheets declare only grid geometry and region placement.
Appearance *inside* slotted components (nav tab orientation, deck flow, widget cards)
lives in those components' own stylesheets, keyed off the reflected attributes — shell
shadow CSS cannot reach across the slot boundary.

Cascade rule: per-layout sheets are ordered after `baseSheet`, so every rule in a layout
sheet MUST be scoped inside `@media (min-width: 641px)` — below that, only `baseSheet`
applies and **every layout collapses to the proven bottom-tab mobile UX**; layouts are a
desktop/tablet experiment. A vanilla test asserts the mobile arrangement survives under
every layout id.

Carried-over gotcha (documented in each layout module header): no layout may set
`container-type` on `:host` — it would trap the slotted nav's `position: fixed` bottom
bar.

A layout switch never detaches slotted children: the router, screens, nav, and their
state survive; only grid areas and one stylesheet change.

### Data flow

```
main.js: layoutState.layout ──▶ oyl-shell (attribute + sheet swap)
         WidgetContext ──▶ <oyl-widgets slot="widgets"> (deck)
         routeState ──▶ oyl-router slot="main" (unchanged)
```

Existing code that changes: `oyl-shell.js` (CSS split into `baseSheet` + `classic.js`,
regions, attribute reflection), `oyl-nav.js` (an `orientation` attribute switching its
tab row between horizontal and vertical — presentation only), `state/theme.js` +
`theme/theme-manager.js` (settings round-trip, below), and `main.js` wiring (~15 lines).

## Widgets

### Deck and context

`<oyl-widgets>` is one component created in `main.js` and slotted as `widgets`. It
receives a single **`WidgetContext`** — an explicitly read-only facade built in
`src/widgets/context.js` from the stores (never the store objects themselves, whose
`add()`/write APIs must stay unreachable):

```js
{ entriesInRange, plansOn, consumptionsOn, goals, reviewOn, profile, tz, today }
```

Read-only is enforced by shape, not convention: the facade exposes only query functions
and signals, so no widget can enqueue outbox writes.

The deck reads `src/widgets/widget-catalog.js` — a registry `id → { label,
create(context) }` — and instantiates every registered widget in registry order. The
shell reflects a `mode` attribute (`rail` or `band`) onto the `oyl-widgets` host; the
deck's **own** stylesheet renders vertically (rail) or as a horizontal scroll row (band)
and owns widget-card appearance — shell CSS cannot style across the slot boundary. When
the active layout declares `widgets: 'none'`, `main.js` does not mount the deck (no
hidden-but-computing work): an `effect()` in `main.js` mounts/unmounts it as the layout
signal changes. On the default `classic` layout the deck is absent.

### v1 widget set

| Widget id | Data source | Rendering |
|---|---|---|
| `greeting-digest` | profile + planner + goals | time-of-day greeting + one-line summary |
| `streak-ring` | journal (days with ≥1 entry) | SVG ring (`stroke-dasharray`) + day count |
| `today-plan` | planner (today's occurrences) | progress bar + next item label |
| `trend-sparklines` | journal entries via `dailySeries` (`Review` carries period totals only, no per-day data) | three SVG `polyline` charts: spending, calories, active minutes |
| `goal-rings` | `reviewOn(range).goals` | row of small SVG rings + streak flame |

Charts are hand-rolled `<svg>` (~20 lines each), themed via `currentColor` /
`var(--color-accent)` — zero dependencies.

### Derivation: the DRY content/value system

All value computation lives in `@oyl/all-of-oyl` — new modules in `src/insights/`,
beside the existing `streak.ts` (reusing its windowing helpers where they fit, so streak
logic stays in one place), pure and DOM-free (enforced by the existing `pnpm all-of
build` gate):

- `streakOf(days, today)` — consecutive-active-day count (timezone-safe day keys;
  today counts if active but an inactive today does not break yesterday's streak),
- `dailySeries(entries, range, tz)` — per-day numeric buckets for sparklines,
- `digestOf(review, todayPlan)` — the greeting digest's summary values.

Division of responsibility, stated once and enforced in review:

- **values** — derived in `all-of-oyl/src/insights/` (shared core),
- **formatting** — the existing `@oyl/all-of-oyl/format` helpers,
- **appearance** — theme tokens (`light-dark()`/`oklch()` themes already shipped),
- **widget files** — only SVG/DOM assembly on top of the three above.

### Sample (dummy) data

`src/widgets/sample-data.js` exports per-widget fixture inputs. A shared helper
`withSample(real, fixture)` returns the fixture when the real derivation is empty; the
widget then renders a small `Sample` badge. A brand-new account sees a lively,
aspirational deck (itself an engagement lever) that is honest about being illustrative,
and real data replaces fixtures per-widget as soon as it exists. Fixtures are plain
values on render paths — they are never written to any store.

## Picker, persistence, switching

- **State:** new `src/state/layout.js` → `createLayoutState(storage)` exposing
  `layout` (signal), `setLayout(id)`, `refresh()`. Persists a `layout` field inside the
  existing `SETTINGS_KEY` JSON blob (one settings object; theme and layout are sibling
  fields). Unknown/corrupt values decode to `classic` via `isLayoutId()`.
- **Settings round-trip (required fix to existing code):** the theme writer today
  (`nextSettings` in `theme/theme-manager.js`, called by `state/theme.js`) rebuilds the
  blob as `{ theme, mode }` only — a theme change would silently erase `layout`. Both
  writers become read-merge-write: spread the previously stored object and override only
  their own field(s), preserving unknown keys (forward-compatible for future settings).
  Tests: "theme change preserves layout" and "layout change preserves theme". The
  `index.html` inline head script only *reads* theme fields and needs no change.
- **Multi-tab:** `main.js`'s existing `storage` listener for `SETTINGS_KEY` additionally
  calls `layoutState.refresh()` next to `themeState.refresh()`.
- **Picker:** `<oyl-layout-picker>` in the header toolbar beside the theme toggle,
  copying the theme toggle's interaction pattern and visual style, listing the five
  catalog entries. It only writes state (`setLayout`); it never touches the shell.
- **Transition:** the shell wraps the swap in `document.startViewTransition` with the
  same reduced-motion and missing-API fallbacks the theme applier uses (instant swap).
- **First paint:** no inline head script needed — the shell is created in `boot()` after
  settings are read, so the first render already uses the persisted layout.
  `index.html` is untouched (asset paths keep the root-absolute rule).
- **Single write path:** anything that wants to change layout (picker today, a future
  profile section) writes the same signal and inherits correct behavior.

## Error handling

- **Unknown/corrupt layout id** → `classic` fallback on read; never throws, never
  renders an empty frame.
- **Widget isolation:** the deck wraps each `create(context)` in try/catch; a throwing
  widget renders as a muted "unavailable" card while the rest of the deck lives. The
  error still reaches `console.error`, so the e2e hygiene fixture fails the run —
  isolation protects users, not buggy code.
- **Mobile safety:** the under-640px arrangement lives only in `baseSheet` and takes
  cascade precedence; the e2e mobile project asserts it in every layout.

## Testing (TDD, failing test first at each step)

| Layer | Assertions |
|---|---|
| `all-of-oyl` vitest | `streakOf` (timezone boundaries, gaps, today rule), `dailySeries` bucketing, `digestOf` composition. Standing gates: `typecheck:src`, `pnpm all-of build`. |
| `vanilla` vitest (happy-dom) | Catalog: unique ids, frozen descriptors, `isLayoutId`. State: persist/refresh/fallback; theme change preserves layout and vice versa. Shell: host attribute + adopted-sheets swap (incl. `baseStyles` retained) + region placement per descriptor + `orientation`/`mode` reflection onto slotted nav/deck; mobile arrangement survives under every layout id. Nav: `orientation` attribute flips tab-row direction. Deck: registry order, throwing-widget isolation, mount/unmount on `widgets: 'none'`. Widgets: real data render + empty-data Sample badge; context facade exposes no write APIs. Picker: writes the signal. All assertions via each component's own shadowRoot/props. |
| e2e Playwright — new `apps/e2e-oyl/tests/layouts.spec.ts` | Per layout: pick via picker → frame changes (nav position / widget region visibility), survives reload, cross-screen navigation still works, and a theme switch afterwards keeps the chosen layout. After switching a fresh account to a widget-bearing layout (`sidebar`/`dashboard`): Sample badges show; adding a journal entry replaces the streak fixture with real data. Mobile (Pixel 7): bottom tabs + usable page in every layout. Hygiene fixture guards console/network automatically. |

**Definition of Done:** `pnpm all-of test` + `pnpm all-of build`, `pnpm vanilla test` +
`pnpm vanilla typecheck`, `pnpm --filter @oyl/all-of-oyl typecheck:src`, and `pnpm e2e`
all green (UI-facing change → e2e mandatory).

## Implementation sequencing

Two plans, one coupling point (the `widgets` slot + `widgets:` descriptor field):

- **Plan A — layout system:** catalog + five layout modules, settings round-trip fix,
  `state/layout.js`, shell refactor, nav orientation, picker, layouts e2e. Ships with the
  widget regions present but empty.
- **Plan B — engagement widgets:** `all-of-oyl` derivation modules, context facade, deck,
  five widgets, sample data, widget e2e.

Plan A is independently shippable; Plan B lands on top of it.

## File inventory

New:

- `apps/vanilla-oyl/src/layouts/{layout-catalog,classic,sidebar,dashboard,focus,wide}.js` (+ tests)
- `apps/vanilla-oyl/src/state/layout.js` (+ test)
- `apps/vanilla-oyl/src/components/oyl-layout-picker.js` (+ test)
- `apps/vanilla-oyl/src/widgets/{oyl-widgets,widget-catalog,context,sample-data}.js` and one file per widget (+ tests)
- `packages/all-of-oyl/src/insights/{daily-series,digest}.ts` and `streakOf` beside the existing `streak.ts` (+ tests, exported from the package index)
- `apps/e2e-oyl/tests/layouts.spec.ts`

Modified:

- `apps/vanilla-oyl/src/components/oyl-shell.js` (CSS → `baseSheet` + regions + layout signal + attribute reflection)
- `apps/vanilla-oyl/src/components/oyl-nav.js` (`orientation` attribute, presentation only)
- `apps/vanilla-oyl/src/state/theme.js` + `src/theme/theme-manager.js` (settings read-merge-write)
- `apps/vanilla-oyl/src/main.js` (layout state, picker, deck mount effect, storage listener)
