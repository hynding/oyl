# `packages/ui-oyl` — Design tokens, themes and v1 primitives — Design

**Date:** 2026-10-07
**Status:** reviewed; plan: `docs/superpowers/plans/2026-10-07-ui-oyl-library.md`
**Program:** Stencil front-end (`apps/stencil-oyl`) — sub-project 1 (see
`2026-10-06-extract-client-layer-design.md` §Program context)

## Purpose

`@oyl/ui-oyl` is the reusable, domain-agnostic Web Component library the Stencil front end
is built from. It owns the visual language of the redesign — tokens, themes, and a small set of
primitives — and knows nothing about journals, budgets or accounts. `apps/stencil-oyl`
(sub-project 2) composes it with `@oyl/all-of-oyl/client` into screens.

v1 is deliberately small: the tokens, the 8 themes, and six primitives — exactly what
sub-project 2's shell (login/register, nav, Status screen, notices) needs. Screen-specific
components (rows, composers, pickers) are **not** library material until two screens want the
same thing.

## Visual direction: "Instrument", touch-sized

Chosen from three mocked directions (Ledger / Instrument / Soft):

- **Structure from Instrument.** Bordered rows and bordered lists, not floating cards; a
  4px grid; numbers in the mono face; one accent-filled action per view, everything else
  outlined or quiet. OYL is mostly scanning numbers (totals, ledgers, measurements), so the
  layout optimizes for that.
- **Sizing from Soft.** 44px minimum control height and tap target, pill chips for filters,
  the bottom tab bar on narrow viewports. Touch-first, since the app is used on a phone as
  much as a desktop.
- **Dropped:** the serif display face (Ledger) and tint-instead-of-border surfaces (Soft).
  Both would force new token families; neither pays for itself in v1. The `paper` theme keeps
  its serif override, so the editorial option survives as a theme rather than a system rule.

Consequences for the library: a border token family stays central; the type scale stays
system-font and fluid; an icon primitive is required (nav tabs are icon + label).

## Package layout and naming

```
packages/ui-oyl/
  package.json          @oyl/ui-oyl, private, "type": "module"
  stencil.config.ts
  tsconfig.json
  vitest.config.ts      @stencil/vitest
  src/
    index.ts            Stencil barrel (exports types + token names)
    global/
      tokens.css        structural tokens (space, radius, type, control sizes, motion, focus)
      themes/<name>.css the 8 themes, one file each, same contract
      base.css          shared shadow base rules, @import-ed by every component CSS
    components/
      ui-button/   ui-button.tsx ui-button.css ui-button.spec.tsx
      ui-field/    …
      ui-card/     …
      ui-notice/   …
      ui-nav/      …
      ui-icon/     ui-icon.tsx ui-icon.css icons.ts ui-icon.spec.tsx
    dev/index.html      showcase page served by `stencil build --dev --serve`
```

- **Tag prefix `ui-`** for the library. The app keeps `oyl-` for domain components, so the two
  tiers are distinguishable at a glance and never collide with vanilla's `oyl-*` tags.
- Component class names are PascalCase of the tag (`UiButton`), files kebab-case, one
  component per folder with its CSS and spec beside it (repo convention: small,
  single-responsibility files).
- Root `package.json` gains the filter shortcut `"ui": "pnpm --filter @oyl/ui-oyl"`.

## Token contract

Two layers, both plain CSS custom properties so they cross the shadow boundary with no
runtime. **Components read only the semantic names below; theme files are the only place
that writes color values.**

### Structural (`global/tokens.css`, `:root`)

Carried over from vanilla verbatim so the two apps can share a theme file during the
side-by-side period: `--space-1..8` (0.25/0.5/0.75/1/1.5/2 rem), `--radius-1`/`--radius-2`,
`--font-sans`/`--font-mono`, `--step--1..2` (fluid `clamp()`), `--focus-ring`.

Added for the redesign:

| Token | Value | Why |
|---|---|---|
| `--size-control` | `2.75rem` (44px) | min height of buttons, inputs, nav tabs |
| `--radius-pill` | `999px` | chips and the pill variant |
| `--line-1`/`--line-2` | `0.5px` / `1px` | hairline vs. emphasized border width |
| `--dur-fast`/`--dur-base` | `120ms` / `200ms` | the only two motion durations |
| `--ease-out` | `cubic-bezier(.2,0,0,1)` | — |

### Color (one file per theme, `:root[data-theme="<name>"]`, `light-dark()` + `oklch()`)

The 12 names vanilla uses today, unchanged: `--color-bg`, `--color-surface`,
`--color-surface-2`, `--color-text`, `--color-muted`, `--color-border`, `--color-accent`,
`--color-accent-hover`, `--color-on-accent`, `--color-danger`, `--color-warn`, `--color-ok`.
The files are **copied byte-for-byte from `apps/vanilla-oyl/styles/themes/<name>.css`**, so
the 8 themes look identical in both apps. They keep their `@layer themes { … }` wrapper, and
three of them (ink, sunrise, paper) also override structural tokens (radius, font) by design;
`tokens.css` therefore opens with `@layer tokens, themes;` so those overrides win.

The theme set (classic, forest, sunrise, ocean, lavender, ember, ink, paper) is kept as-is:
the files already exist, they are `light-dark()` so System/Light/Dark comes free from
`color-scheme`, and `apps/e2e-oyl/tests/theme.spec.ts` already proves the model. Theme
*selection* (the picker, persistence, view-transition cross-fade) is app state and stays
out of the library; `ui-oyl` only guarantees that any `data-theme` + `color-scheme` on
`:root` restyles every component.

### Shadow base (`global/base.css`)

Equivalent of vanilla's `baseStyles`: `*, *::before, *::after { box-sizing: border-box }`
and the `:focus-visible` ring. Every component CSS starts with `@import "../../global/base.css";`
(Stencil inlines it at build), so no component depends on a document-level reset.

## v1 primitives

Six components. Each lists its public API in full; anything not listed is out of scope.

| Tag | Props | Events / slots | Notes |
|---|---|---|---|
| `ui-button` | `variant: 'primary' \| 'secondary' \| 'ghost' \| 'danger'` (default `secondary`), `type: 'button' \| 'submit'`, `disabled`, `href?` | default slot; renders `<a>` when `href` is set | `type="submit"` submits the enclosing light-DOM form via `ElementInternals` (`formAssociated`). Min height `--size-control`. |
| `ui-field` | `label`, `name`, `type` (text/email/password/number/date), `value`, `required`, `autocomplete`, `error?`, `hint?` | `input` (bubbles, composed, `detail: { value }`); `change` | Label + input + hint/error in one shadow root with `aria-describedby`/`aria-invalid` wired. `formAssociated`, so native `<form>` submit and `FormData` see it. |
| `ui-card` | `heading?`, `padding: 'md' \| 'none'` | slots: default, `header`, `footer` | Surface + hairline border, `--radius-2`. The Status screen's sections. |
| `ui-notice` | `tone: 'info' \| 'ok' \| 'warn' \| 'danger'`, `dismissible` | default slot; `dismiss` event | Inline banner (`role="status"`, `alert` for danger). Positioning (vanilla's fixed top bar) is the app's job. |
| `ui-nav` | `items: NavItem[]` (`{ href, label, icon }`), `current` (route name), `orientation: 'top' \| 'bottom'` | `navigate` is **not** emitted — items are real `<a href>` so the app's link interceptor handles them | Horizontal tab row; `orientation="bottom"` docks as a fixed bottom bar (the app sets it from a media query, as vanilla's `oyl-nav` does today). `aria-current="page"` on the active item. |
| `ui-icon` | `name: IconName`, `size: 's' \| 'm'` (16/20px), `label?` | — | Inline SVG from a typed map in `icons.ts` (≈12 outline glyphs for nav + notices + account). No icon font (CSP, zero runtime deps). `aria-hidden` unless `label` is set. |

Shared conventions: every component is `shadow: true`; host `display` is set explicitly;
`disabled` and `hidden` reflect to attributes; text is sentence case; no component imports
anything from `@oyl/all-of-oyl` (domain-agnostic is a build-time rule — see Verification).

## Stencil configuration

- `@stencil/core` 4.45.x; `@stencil/vitest` 1.15.x on the repo's existing Vitest 4.
- `namespace: 'ui-oyl'`, `taskQueue: 'async'`, `sourceMap: true`.
- Output targets:
  1. `dist` with `esmLoaderPath: '../loader'` — the lazy-loading build (`dist/ui-oyl/ui-oyl.esm.js`)
     for any consumer that just wants a `<script type="module">`.
  2. `dist-custom-elements` with `customElementsExportBehavior: 'single-export-module'`,
     `externalRuntime: false`, `generateTypeDeclarations: true` — what `apps/stencil-oyl`
     imports (tree-shaken, one `defineCustomElements()` or per-element `defineCustomElement`).
  3. `docs-readme` — a README per component, committed (the API reference the app
     reads).
  4. `www` is **dev-only** (`stencil build --dev --watch --serve`, serves `src/dev/index.html`
     on port **3443**); `www/` is git-ignored and never published.
- `globalStyle: 'src/global/tokens.css'` → `dist/ui-oyl/ui-oyl.css`; the theme files are
  copied verbatim to `dist/themes/` via the `copy` task of the `dist` target.
- `package.json` `exports`: `"."` → custom elements (`dist/components/index.js` + types),
  `"./loader"`, `"./tokens.css"`, `"./themes/*.css"`.
- `hydrate` output is **not** built here; sub-project n+1 adds it in `apps/stencil-oyl`,
  whose build includes the library's elements.

## Dev workflow

```bash
pnpm ui dev        # stencil build --dev --watch --serve → showcase on :3443
pnpm ui build      # production build (dist, dist-custom-elements, docs)
pnpm ui test       # @stencil/vitest spec tests
pnpm ui typecheck  # tsc --noEmit
```

Port 3443 sits with the repo's other 3xxx dev ports and clears 1341/1342/8042 (e2e).

## Verification

Two Vitest projects, both under `@stencil/vitest`'s `defineVitestConfig`:

- **`spec`** (`src/**/*.spec.tsx`, `environment: 'stencil'` with `domEnvironment:
  'happy-dom'`, which the repo already uses): component tests. `@stencil/vitest` tests a
  *built* output, so `pnpm ui test` is its `stencil-test` CLI (dev build, then Vitest); the
  setup file imports `dist/ui-oyl/ui-oyl.esm.js`.
- **`unit`** (`src/**/*.unit.ts`, `environment: 'node'`): file-level checks that need no
  build.

- **TDD per component:** the `*.spec.tsx` (render + prop/attribute reflection + event +
  a11y attributes) is written first; the component makes it pass.
- **Theme contract (unit):** every `src/global/themes/*.css` declares exactly the 12 color
  names (structural overrides allowed); the theme-name set equals vanilla's `THEMES` registry
  (`apps/vanilla-oyl/src/theme/theme-manager.js`); and each file is byte-equal to its vanilla
  twin. The parity half is deleted at cutover, when vanilla's copies go.
- **Token usage (unit):** every component CSS may reference only `--color-*`, `--space-*`,
  `--radius-*`, `--size-*`, `--line-*`, `--dur-*`, `--ease-*`, `--font-*`, `--step-*`,
  `--focus-ring` names from the contract (catches typos and private tokens).
- **Domain-agnostic gate (unit):** no file under `src/` imports `@oyl/all-of-oyl`.
- **Definition of Done:** `pnpm ui test`, `pnpm ui typecheck`, `pnpm ui build` green; root
  `pnpm test`/`pnpm typecheck` still green (the new package joins the `./packages/*`
  aggregates). No e2e in this sub-project — the library has no app surface; sub-project 2's
  e2e project covers it in situ.

## Out of scope

- `apps/stencil-oyl`, the signals↔Stencil bridge, routing, theme/layout state and pickers.
- Any layout/shell frame (`ui-shell`): the app composes it from CSS + `ui-nav`.
- Screen components (rows, composers, pickers), dialogs, menus, tables, charts/widgets.
- Hydrate/prerender output, a Storybook, visual regression testing.
- Changing vanilla-oyl in any way.

## Risks

| Risk | Mitigation |
|---|---|
| `@stencil/vitest` is young; a gap forces jsdom hacks | Specs stay to render/props/events; no DOM-API-heavy tests. If it blocks, fall back to Stencil's own `newSpecPage` runner for the library only — the repo's Vitest rule applies to everything else. |
| `formAssociated` + `ElementInternals` in `ui-field`/`ui-button` | Supported in every target browser (Chromium, Safari ≥16.4, Firefox ≥98); tests assert `FormData` round-trip. |
| Theme files duplicated across two apps | Copied, not referenced, on purpose (the library must stand alone); the byte-parity unit test fails on any drift until cutover retires vanilla's copies. |
| `ElementInternals` under happy-dom | If `attachInternals` is missing or incomplete in the test DOM, the `FormData` round-trip spec asserts through a spied `internals.setFormValue` instead; the behavior itself is unchanged. |
| Scope creep into screen components | The six-component list is the spec; anything else is a new spec. |

## Success criteria

- `packages/ui-oyl` builds all three publish targets; `dist/components/index.js` exports the
  six elements with types; `dist/themes/*.css` holds the 8 themes.
- `pnpm ui dev` shows every component in every theme and both color schemes on the showcase.
- All verification tests green; CLAUDE.md gains a `@oyl/ui-oyl` package row, the `pnpm ui`
  shortcuts, the port, and the `ui-`/`oyl-` prefix rule.
