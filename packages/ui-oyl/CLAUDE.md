# ui-oyl — domain-agnostic Stencil component library

Spec: `docs/superpowers/specs/2026-10-07-ui-oyl-library-design.md`. **Tag prefix `ui-` is this library; `oyl-` stays for app domain components.** Knows nothing about OYL domains: a unit gate fails on any `@oyl/all-of-oyl` import.

## Contents

- Tokens `src/global/tokens.css`: vanilla's structural tokens + `--size-control` 44px, `--radius-pill`, `--line-1/2`, motion.
- 8 themes in `src/global/themes/` — **the source of truth** since the cutover (apps consume `@oyl/ui-oyl/themes/<name>.css`; `themes.unit.ts` checks the set and color tokens). vanilla's copies may drift.
- Primitives:
  - `ui-button` (form-associated submit)
  - `ui-field` (label+input+hint/error, `uiInput`/`uiChange`, form-associated value; `name`/`type`/`disabled` reflected)
  - `ui-select` (label+native select, `options` prop, form-associated; an options change that drops the value silently adopts the first option)
  - `ui-checkbox` (form value `on` while checked, `uiChange {checked}`)
  - `ui-textarea` (autogrow, ⌘/Ctrl+Enter → `uiSubmit`)
  - `ui-segment` (radiogroup segmented control, options carry `data-value`)
  - `ui-card`, `ui-notice`, `ui-nav` (plain anchors — the app's link interceptor navigates), `ui-icon` (inline SVG map)

## Outputs

`dist` (lazy loader, `@oyl/ui-oyl/loader`), `dist-custom-elements` single-export module (`@oyl/ui-oyl`, what stencil-oyl imports), `docs-readme` (per-component `readme.md`, committed, as is `src/components.d.ts`), `@oyl/ui-oyl/tokens.css`, `@oyl/ui-oyl/themes/<name>.css`. `www/` is the dev-only showcase (`pnpm ui dev`, port 3443).

## Tests

- `pnpm ui test` (`stencil-test`: dev build → Vitest `spec` project in `environment: 'stencil'`/happy-dom + `unit` project in node). The dev build trims `dist/` to the lazy loader, so run `pnpm ui build` **after** tests when you need the full `dist/`.
- `pnpm ui typecheck` (`tsc --noEmit`; specs excluded — Vitest transforms them).

## Gotchas

- Component CSS may reference only token names in `src/global/contract.ts` (plus component-private `--_*`); add a name there and in `tokens.css` together.
- happy-dom has no `attachInternals`; `vitest-setup.ts` shims the members the library uses and records `setFormValue` on the host as `__formValue` for specs.
- Don't set `noEmit` in `tsconfig.json` (Stencil's transpile then finds no components).
- Custom events never reuse native names (`uiInput`, not `input`).
- The artifact/claude.ai host rewrites `<link>`s, so verify themes with `pnpm ui dev` or headless Chromium, not a published artifact.
