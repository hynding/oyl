# `packages/ui-oyl` — Tokens, themes and v1 primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@oyl/ui-oyl` at `packages/ui-oyl`: a domain-agnostic Stencil 4 component library with the redesign's design tokens, the 8 themes (byte-identical to vanilla's), and six primitives (`ui-button`, `ui-field`, `ui-card`, `ui-notice`, `ui-nav`, `ui-icon`), built as `dist` + `dist-custom-elements` + `docs-readme`, tested with `@stencil/vitest` on the repo's Vitest 4.

**Architecture:** Tokens and themes are plain CSS custom properties on `:root` (they cross shadow roots); components read only the documented semantic names. Each component is one folder with `.tsx` + `.css` + `.spec.tsx` (+ generated `readme.md`). File-level guarantees (theme contract/parity, token usage, domain-agnostic) are Node `*.unit.ts` tests that need no build. Theme *state* (picker, persistence) is not in the library.

**Tech Stack:** Stencil `@stencil/core` ^4.45, `@stencil/vitest` ^1.15 (CLI `stencil-test`), Vitest ^4.1 (repo pin), happy-dom (repo already has it), TypeScript 5, pnpm workspace, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-oyl-library-design.md`

## Global Constraints

- **Branch:** `feat/ui-oyl` off `master` (already created; the spec is commit `c3b6851`). One commit per task, prefix `feat`/`chore`/`docs`, trailer `Co-Authored-By: Claude …` as the session provides. Never commit on red. Do not push or open a PR unless asked.
- **Domain-agnostic:** nothing under `packages/ui-oyl/src/` imports `@oyl/all-of-oyl` (any subpath). Task 2's unit test enforces it from the start.
- **Token discipline:** component CSS references only contract names (see spec §Token contract). Task 2's unit test enforces it; add a name to the contract *in `tokens.css` and the test's allow-list together*, never ad hoc.
- **Theme files are copies:** `src/global/themes/<name>.css` must stay byte-equal to `apps/vanilla-oyl/styles/themes/<name>.css`. Never edit the library copy alone; if a theme needs a change it changes in vanilla first (not in this sub-project — the spec puts vanilla out of scope).
- **Stencil conventions:** `shadow: true` on every component; `@Prop({ reflect: true })` for `disabled`, `variant`, `tone`, `orientation`, `size`; host `display` set explicitly in `:host`; every component CSS starts with `@import "../../global/base.css";`. Sentence case for any rendered text.
- **Generated files:** `src/components.d.ts` and each component's `readme.md` (docs-readme) are **committed** (Stencil's recommendation; it lets `tsc --noEmit` and reviewers work without a build). `dist/`, `loader/`, `www/`, `.stencil/` are git-ignored.
- **Per-task gate** (from the repo root; all green before commit):
  ```bash
  pnpm ui test        # stencil-test: dev build + spec + unit projects
  pnpm ui typecheck   # tsc --noEmit
  pnpm ui build       # prod build: dist, dist-custom-elements, docs-readme, themes copy
  ```
  Tasks 1 and 10 additionally run the root aggregates `pnpm test` and `pnpm typecheck` (CI's deploy gate), which now include the new package.
- **Ports:** the dev showcase uses **3443**. Nothing in this plan touches 1341/1342/8042 (e2e) or 1340/8041 (dev).
- **Tests assert observable behavior** (rendered shadow DOM, attributes, events, `FormData`), never Stencil internals. Use `@stencil/vitest`'s `render`, `waitForChanges`, `setProps`, and matchers (`toHaveAttribute`, `toEqualHtml`, `toHaveTextContent`).

---

## Task 1: Scaffold the package and prove the toolchain

**Files:**
- Create: `packages/ui-oyl/package.json`, `stencil.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest-setup.ts`, `.gitignore`, `src/index.ts`, `src/dev/index.html`, `src/global/tokens.css` (empty layer declaration only), `src/components/ui-icon/ui-icon.tsx` + `.css` + `.spec.tsx` (placeholder render only; Task 3 fills it), `scripts/copy-themes.mjs`
- Modify: root `package.json` (`"ui": "pnpm --filter @oyl/ui-oyl"` script)

- [ ] **Step 1: Write the failing spec first.** `src/components/ui-icon/ui-icon.spec.tsx`:
  ```tsx
  import { render, h, describe, it, expect } from '@stencil/vitest'
  describe('ui-icon', () => {
    it('renders a host element', async () => {
      const { root } = await render(<ui-icon name="check" />)
      expect(root).toHaveShadowRoot()
    })
  })
  ```
- [ ] **Step 2: package.json.**
  ```json
  {
    "name": "@oyl/ui-oyl", "version": "0.1.0", "private": true, "type": "module",
    "description": "Domain-agnostic Stencil component library, tokens and themes for OYL",
    "exports": {
      ".": { "types": "./dist/components/index.d.ts", "import": "./dist/components/index.js" },
      "./loader": { "types": "./loader/index.d.ts", "import": "./loader/index.js" },
      "./tokens.css": "./dist/ui-oyl/ui-oyl.css",
      "./themes/*": "./dist/themes/*",
      "./package.json": "./package.json"
    },
    "files": ["dist", "loader"],
    "scripts": {
      "dev": "stencil build --dev --watch --serve",
      "build": "stencil build --docs && node scripts/copy-themes.mjs",
      "test": "stencil-test",
      "test:watch": "stencil-test --watch",
      "typecheck": "tsc --noEmit"
    },
    "devDependencies": {
      "@stencil/core": "^4.45.2", "@stencil/vitest": "^1.15.1",
      "happy-dom": "<same range vanilla-oyl pins>", "typescript": "^5", "vitest": "^4.1.10"
    }
  }
  ```
  Copy the exact `happy-dom` range from `apps/vanilla-oyl/package.json`.
- [ ] **Step 3: stencil.config.ts.**
  ```ts
  import type { Config } from '@stencil/core'
  export const config: Config = {
    namespace: 'ui-oyl',
    taskQueue: 'async',
    sourceMap: true,
    srcIndexHtml: 'src/dev/index.html',
    globalStyle: 'src/global/tokens.css',
    outputTargets: [
      { type: 'dist', esmLoaderPath: '../loader' },
      { type: 'dist-custom-elements', customElementsExportBehavior: 'single-export-module', externalRuntime: false, generateTypeDeclarations: true },
      { type: 'docs-readme' },
      { type: 'www', dir: 'www', serviceWorker: null },
    ],
    devServer: { port: 3443, openBrowser: false },
  }
  ```
- [ ] **Step 4: tsconfig.json** — `"extends"` nothing (Stencil needs its own): `target ES2022`, `module ESNext`, `moduleResolution bundler`, `lib ["DOM","ES2022"]`, `jsx react`, `jsxFactory h`, `jsxFragmentFactory Fragment`, `experimentalDecorators true`, `strict true`, `noUnusedLocals true`, `noUnusedParameters true`, `skipLibCheck true`, `include ["src"]`, `exclude ["src/**/*.spec.tsx","src/**/*.unit.ts","dist","www","loader"]`. (Specs are typechecked by Vitest's transform, not `tsc`; this keeps `tsc` free of the `@stencil/vitest` JSX globals.)
- [ ] **Step 5: vitest.config.ts + vitest-setup.ts** (spec + unit projects, per the `@stencil/vitest` README; setup imports `./dist/ui-oyl/ui-oyl.esm.js` inside `beforeAll`; spec project `environment: 'stencil'`, `environmentOptions: { stencil: { domEnvironment: 'happy-dom' } }`; unit project `environment: 'node'`, include `src/**/*.unit.ts`).
- [ ] **Step 6: minimal sources.** `src/index.ts` (`export * from './components'` is generated by Stencil — leave the barrel exporting `IconName` later; for now an empty `export {}`), `src/global/tokens.css` containing only `@layer tokens, themes;` and an empty `@layer tokens { :root {} }`, `src/dev/index.html` with `<script type="module" src="/build/ui-oyl.esm.js">` + `<link rel="stylesheet" href="/build/ui-oyl.css">` + `<ui-icon name="check"></ui-icon>`, `scripts/copy-themes.mjs` (copies `src/global/themes/*.css` → `dist/themes/`, creating the dir; no-op if the source dir is empty), `.gitignore` (`dist/ loader/ www/ .stencil/ node_modules/`), and the `ui-icon` placeholder:
  ```tsx
  import { Component, Prop, h } from '@stencil/core'
  @Component({ tag: 'ui-icon', styleUrl: 'ui-icon.css', shadow: true })
  export class UiIcon { @Prop() name!: string; render() { return <span /> } }
  ```
- [ ] **Step 7: install + run.** `pnpm install` (root). `pnpm ui test` must build then pass 1 spec. `pnpm ui typecheck` green (commit the generated `src/components.d.ts`). `pnpm ui build` green: confirm `dist/components/index.js`, `dist/components/index.d.ts`, `loader/index.js`, `dist/ui-oyl/ui-oyl.css`, and `src/components/ui-icon/readme.md` exist. Root `pnpm test` and `pnpm typecheck` still green.
- [ ] **Step 8: add the root shortcut** `"ui": "pnpm --filter @oyl/ui-oyl"` to root `package.json` scripts (alphabetical with the others).
- [ ] **Step 9: commit** — `chore(ui-oyl): scaffold Stencil package with vitest + outputs`.

---

## Task 2: Tokens, themes and the file-level guards

**Files:**
- Create: `src/global/tokens.css` (full), `src/global/base.css`, `src/global/themes/{classic,forest,sunrise,ocean,lavender,ember,ink,paper}.css`, `src/global/tokens.unit.ts`, `src/global/themes.unit.ts`, `src/agnostic.unit.ts`, `src/global/contract.ts`

- [ ] **Step 1: write the three failing unit tests.**
  - `themes.unit.ts`: (a) theme name set === `THEMES` from `../../../apps/vanilla-oyl/src/theme/theme-manager.js` (dynamic `import()` of the JS module — it has no DOM deps at module scope; if it does, read the array from the file text with a regex and say so in a comment); (b) each theme file declares exactly the 12 names in `contract.ts` `COLOR_TOKENS` (regex `--color-[a-z0-9-]+:`), (c) each file is byte-equal to `apps/vanilla-oyl/styles/themes/<name>.css` (`readFileSync` both; `expect(lib).toBe(vanilla)`).
  - `tokens.unit.ts`: for every `src/components/**/*.css`, every `var(--name` reference is in `contract.ts` `ALL_TOKENS` (color + structural names). Also asserts `tokens.css` declares every structural name in `STRUCTURAL_TOKENS` and opens with `@layer tokens, themes;`.
  - `agnostic.unit.ts`: `grep`-style walk of `src/**/*.{ts,tsx,css}` fails on `@oyl/all-of-oyl`.
- [ ] **Step 2: `contract.ts`** — exported `COLOR_TOKENS` (12), `STRUCTURAL_TOKENS` (`--space-1,2,3,4,6,8`, `--radius-1,2,pill`, `--font-sans,mono`, `--step--1,0,1,2`, `--focus-ring`, `--size-control`, `--line-1,2`, `--dur-fast,base`, `--ease-out`), `ALL_TOKENS`. This file is the single list the tests and the docs refer to.
- [ ] **Step 3: `tokens.css`** — `@layer tokens, themes;` then `@layer tokens { :root { …vanilla's values verbatim… ; --size-control: 2.75rem; --radius-pill: 999px; --line-1: 0.5px; --line-2: 1px; --dur-fast: 120ms; --dur-base: 200ms; --ease-out: cubic-bezier(.2,0,0,1); } @property --color-bg {…as vanilla…} }`.
- [ ] **Step 4: `base.css`** — `*, *::before, *::after { box-sizing: border-box; } :host(:focus-visible), :focus-visible { outline: var(--focus-ring); outline-offset: 2px; }` (vanilla's `baseStyles`, verbatim).
- [ ] **Step 5: copy the 8 theme files** with `cp apps/vanilla-oyl/styles/themes/*.css packages/ui-oyl/src/global/themes/`.
- [ ] **Step 6: showcase wiring** — `src/dev/index.html` links all 8 themes from `/themes/<name>.css` (add `{ src: 'global/themes', dest: 'themes' }` to the `www` target's `copy`), sets `<html data-theme="classic">`, and has a `<select>` for theme + a System/Light/Dark `<select>` that set `data-theme` and `style.colorScheme` on `<html>` (inline script, dev-only).
- [ ] **Step 7: gate + commit** — `feat(ui-oyl): tokens, themes, contract guards`. `pnpm ui build` must produce `dist/themes/*.css` (8 files).

---

## Task 3: `ui-icon`

**Files:** `src/components/ui-icon/{ui-icon.tsx,ui-icon.css,icons.ts,ui-icon.spec.tsx,readme.md}`, `src/index.ts` (export `IconName`, `ICON_NAMES`)

- [ ] **Step 1: failing specs** — renders an `<svg viewBox="0 0 24 24">` for a known name; `aria-hidden="true"` and no `role` when no `label`; `role="img"` + `aria-label` when `label` set; `size="s"` → host class/attr that the CSS maps to 16px, default `m` 20px; unknown name renders nothing and logs nothing (empty shadow root).
- [ ] **Step 2: `icons.ts`** — `export const ICONS = { … } as const satisfies Record<string, string>` mapping name → `<path d>` string(s). Names: `journal, planner, nutrition, finance, goals, vault, insights, status, profile, info, check, warning, danger, close, plus, chevron-left, chevron-right, menu`. Paths from Tabler Icons (MIT) outline set; include the MIT attribution comment at the top of `icons.ts`. `export type IconName = keyof typeof ICONS`.
- [ ] **Step 3: component** — `@Prop() name!: IconName`, `@Prop({ reflect: true }) size: 's' | 'm' = 'm'`, `@Prop() label?: string`. Renders `<svg … fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` with the paths. CSS: `:host { display: inline-flex; inline-size: 1.25rem; block-size: 1.25rem; color: inherit }`, `:host([size="s"]) { inline-size: 1rem; block-size: 1rem }`, `svg { inline-size: 100%; block-size: 100% }`.
- [ ] **Step 4: gate + commit** — `feat(ui-oyl): ui-icon`.

---

## Task 4: `ui-button`

**Files:** `src/components/ui-button/{ui-button.tsx,ui-button.css,ui-button.spec.tsx,readme.md}`

- [ ] **Step 1: failing specs** — default variant `secondary` reflected; `variant="primary"` renders the accent fill (assert the inner `<button>` has class `primary`); `href` renders `<a href>` instead of `<button>`; `disabled` reflects and the inner control is `disabled` / `aria-disabled`; `type="submit"` inside a light-DOM `<form>`: clicking calls the form's `requestSubmit` (spy on it) — this is the form-associated path; slot content renders.
- [ ] **Step 2: component** — `@Component({ tag: 'ui-button', styleUrl, shadow: true, formAssociated: true })`, `@AttachInternals() internals!: ElementInternals`. Props: `variant: 'primary'|'secondary'|'ghost'|'danger' = 'secondary'` (reflect), `type: 'button'|'submit' = 'button'`, `disabled = false` (reflect), `href?: string`. On click with `type === 'submit'` and not disabled: `this.internals.form?.requestSubmit()`. Render `<a>` when `href` (with `aria-disabled` when disabled, no `href` attr when disabled), else `<button type="button">` (always `type="button"` internally — the submit is delegated through internals, so a nested native submit never double-fires).
- [ ] **Step 3: CSS** — min height `var(--size-control)`, padding `0 var(--space-4)`, `border-radius: var(--radius-1)`, `font: inherit`, `font-weight: 500`, gap `var(--space-2)` for icon+label. Variants: primary = `background: var(--color-accent); color: var(--color-on-accent)`, hover `var(--color-accent-hover)`; secondary = transparent + `var(--line-2) solid var(--color-border)`, hover `background: var(--color-surface-2)`; ghost = no border, hover surface-2; danger = `color: var(--color-danger)`, border `var(--color-danger)`. `:host([disabled])` → `opacity: .5; pointer-events: none`. Transition `background var(--dur-fast) var(--ease-out)`.
- [ ] **Step 4: gate + commit** — `feat(ui-oyl): ui-button`.

---

## Task 5: `ui-field`

**Files:** `src/components/ui-field/{ui-field.tsx,ui-field.css,ui-field.spec.tsx,readme.md}`

- [ ] **Step 1: failing specs** — label text rendered in a `<label for>` bound to the inner `<input id>`; `type` passes through (default `text`); `required`, `autocomplete`, `name` pass through; typing dispatches a composed `input` event with `detail.value` and updates `value`; `hint` renders with `aria-describedby`; `error` renders with `aria-describedby` + `aria-invalid="true"` on the input and the hint hidden; **FormData round-trip:** inside a light-DOM `<form>`, after `setProps({ value: 'x' })`, `new FormData(form).get(name) === 'x'` (if happy-dom lacks `attachInternals`, spy `internals.setFormValue` and assert it was called with `'x'` — note the fallback in the test).
- [ ] **Step 2: component** — `formAssociated: true`, `@AttachInternals()`. Props: `label!`, `name!`, `type: 'text'|'email'|'password'|'number'|'date' = 'text'`, `value = ''` (mutable), `required`, `autocomplete?`, `hint?`, `error?`. `@Event({ bubbles: true, composed: true }) input: EventEmitter<{ value: string }>` and `change`. `@Watch('value')` → `internals.setFormValue(value)`; `componentWillLoad` sets the initial form value. Ids via a module counter (`ui-field-${n}`).
- [ ] **Step 3: CSS** — `:host { display: block }`; label `font-size: var(--step--1); color: var(--color-muted)`; input min height `var(--size-control)`, `border: var(--line-2) solid var(--color-border)`, `border-radius: var(--radius-1)`, `background: var(--color-surface)`, `color: var(--color-text)`, `padding: 0 var(--space-3)`, `font: inherit`, number/date inputs `font-family: var(--font-mono)`; error text `color: var(--color-danger)`, invalid input border `var(--color-danger)`.
- [ ] **Step 4: gate + commit** — `feat(ui-oyl): ui-field`.

---

## Task 6: `ui-card`

**Files:** `src/components/ui-card/{…}`

- [ ] **Step 1: failing specs** — default slot renders; `heading` renders an `<h2>` in a header region; `header` slot replaces the heading; `footer` slot renders in a footer region with a top hairline; `padding="none"` reflects and removes body padding (assert class on the body element).
- [ ] **Step 2: component + CSS** — `:host { display: block; background: var(--color-surface); border: var(--line-1) solid var(--color-border); border-radius: var(--radius-2) }`; header/body/footer padding `var(--space-4)`; heading `font-size: var(--step-0); font-weight: 500; margin: 0`.
- [ ] **Step 3: gate + commit** — `feat(ui-oyl): ui-card`.

---

## Task 7: `ui-notice`

**Files:** `src/components/ui-notice/{…}`

- [ ] **Step 1: failing specs** — `tone` default `info` reflected; `role="status"` for info/ok/warn, `role="alert"` for danger; the matching icon name is rendered (`<ui-icon name="warning">` for warn, etc.); `dismissible` renders a close button (`aria-label="Dismiss"`) that emits `dismiss`; without `dismissible` no button.
- [ ] **Step 2: component + CSS** — flex row, `gap: var(--space-3)`, `padding: var(--space-3) var(--space-4)`, `border-radius: var(--radius-1)`, `border: var(--line-2) solid`; tone sets border + icon `color` to `--color-accent` / `--color-ok` / `--color-warn` / `--color-danger`; background stays `var(--color-surface)` (no tint tokens in v1). The close control is a `ui-button variant="ghost"` with `ui-icon name="close"`.
- [ ] **Step 3: gate + commit** — `feat(ui-oyl): ui-notice`.

---

## Task 8: `ui-nav`

**Files:** `src/components/ui-nav/{…}`, `src/index.ts` (export `NavItem`)

- [ ] **Step 1: failing specs** — renders `<nav aria-label="Primary">` with one `<a href>` per item, icon + label; `current="journal"` marks the matching item `aria-current="page"` and nothing else; `orientation` default `top` reflected; `orientation="bottom"` reflected (CSS does the docking — assert only the attribute); items are plain anchors with no click handling (no `navigate` event; clicking does not call `preventDefault` — assert `defaultPrevented === false` on a dispatched click).
- [ ] **Step 2: component** — `@Prop() items: NavItem[] = []` where `NavItem = { href: string; label: string; icon: IconName; name: string }` (`name` is the route name compared with `current`), `@Prop() current?: string`, `@Prop({ reflect: true }) orientation: 'top'|'bottom' = 'top'`.
- [ ] **Step 3: CSS** — top: horizontal flex, each tab min height `var(--size-control)`, `padding: 0 var(--space-3)`, `gap: var(--space-2)`, active tab `color: var(--color-accent)` with a 2px bottom rule; bottom: `:host([orientation="bottom"]) { position: fixed; inset-block-end: 0; inset-inline: 0; background: var(--color-surface); border-block-start: var(--line-1) solid var(--color-border); padding-block-end: env(safe-area-inset-bottom) }`, tabs stacked icon-over-label, `font-size: var(--step--1)`, equal `flex: 1`.
- [ ] **Step 4: gate + commit** — `feat(ui-oyl): ui-nav`.

---

## Task 9: Showcase page

**Files:** `src/dev/index.html`

- [ ] **Step 1:** Replace the placeholder body with one section per component showing every variant/tone/size/state (disabled, error, hint, dismissible, current tab, both nav orientations — bottom in a 390px-wide `<iframe srcdoc>` or a bordered box, since fixed positioning would cover the page), plus a token sheet: the 12 color swatches and the spacing/radius/type scale. Theme + scheme selects from Task 2 at the top.
- [ ] **Step 2:** `pnpm ui dev`, open `http://localhost:3443`, click through all 8 themes × 3 schemes; fix any component that paints wrong in a theme (dark `ink` inverts accent polarity — `--color-on-accent` must be honored everywhere). Stop the server when done (never leave it running).
- [ ] **Step 3: gate + commit** — `feat(ui-oyl): dev showcase`.

---

## Task 10: Docs and repo wiring

**Files:** `CLAUDE.md`, `.gitignore` (root — nothing needed if the package `.gitignore` covers it; verify), spec status line, `docs/superpowers/specs/2026-10-06-extract-client-layer-design.md` (program table row 1 → "done")

- [ ] **Step 1: CLAUDE.md** — add the `@oyl/ui-oyl` row to the Packages table (role: domain-agnostic Stencil library; tokens + 8 themes byte-copied from vanilla with a parity test; `ui-` prefix for library tags vs `oyl-` for app domain components; outputs; `@stencil/vitest` builds before testing; committed `components.d.ts` + readmes); add `pnpm ui dev|build|test|typecheck` to Dev workflows; add the 3443 port to the port map prose; add the tests/typecheck row.
- [ ] **Step 2:** Mark the ui-oyl spec `Status: implemented on branch feat/ui-oyl`; in the extract-client-layer spec's program table, note sub-project 1 as implemented.
- [ ] **Step 3:** Root `pnpm test` and `pnpm typecheck` green; `pnpm ui build` green from a clean `dist/` (`rm -rf packages/ui-oyl/{dist,loader,www}` first).
- [ ] **Step 4: commit** — `docs: ui-oyl package in CLAUDE.md; spec statuses`.

---

## Done when

- All ten tasks committed on `feat/ui-oyl`; every gate green; `dist/components/index.js` exports the six elements with types; `dist/themes/` has 8 files byte-equal to vanilla's.
- Sub-project 2 can `import { defineCustomElements } from '@oyl/ui-oyl/loader'` or `import { UiButton, … } from '@oyl/ui-oyl'`, link `@oyl/ui-oyl/tokens.css` and `@oyl/ui-oyl/themes/<name>.css`, and build its shell from these six elements alone.

## Deferred (not in this plan)

- `ui-shell`, dialogs/menus, tables, chart widgets, screen rows/composers — each needs its own spec once a second screen wants it.
- Hydrate/prerender (sub-project n+1), Storybook, visual regression.
- Removing the theme byte-parity test and vanilla's theme copies (cutover sub-project).
- Sub-project 2 follow-ups carried from sub-project 0: `createDataState({ newId })` forwarding test; consolidating vanilla `main.js`'s `@oyl/all-of-oyl/client` import lines.
