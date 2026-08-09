# Vanilla-OYL Layout System (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-swappable app-shell layouts (classic / sidebar / dashboard / focus / wide) for `apps/vanilla-oyl`, persisted like themes, with widget regions present but empty (widgets ship in Plan B).

**Architecture:** One `oyl-shell` renders a named-region CSS grid; each layout is a self-contained module (frozen descriptor + one constructable stylesheet) registered in a catalog that mirrors `theme-catalog.js`. A layout signal drives an `adoptedStyleSheets` swap + host-attribute flip; slotted `oyl-nav` gets a reflected `orientation` attribute. Spec: `docs/superpowers/specs/2026-08-07-vanilla-oyl-layout-system-design.md` (read it if anything here seems ambiguous — it is the authority).

**Tech Stack:** Vanilla JS + JSDoc (checkJs), Web Components (shadow DOM), signals core in `src/lib/reactive/`, Vitest (happy-dom), Playwright e2e.

## Global Constraints

- Zero runtime dependencies in `apps/vanilla-oyl`. No new packages anywhere.
- **Every desktop-layout CSS rule sits inside `@media (min-width: 641px)`** — in per-layout sheets AND in `oyl-nav`'s `orientation`-keyed rules. Below 641px only unkeyed base rules apply (the proven mobile bottom-tab UX).
- **Never set `container-type` on `oyl-shell`'s `:host`** (it would trap the slotted nav's `position: fixed` mobile bar).
- Settings writes are read-merge-write **from the RAW stored JSON** (`JSON.parse(storage.getItem(SETTINGS_KEY))`), never from an in-memory signal (signals hold normalized values that already dropped unknown keys).
- Default layout id is `'classic'`; any unknown/corrupt persisted value decodes to `'classic'`.
- `apps/vanilla-oyl/index.html` is NOT touched (asset paths stay root-absolute).
- TDD: write the failing test, see it fail, implement, see it pass, commit. Never weaken a rule to pass a test.
- Component tests assert via the component's OWN shadowRoot/props — never a parent's textContent (shadow DOM doesn't pierce).
- Commit messages: `feat:`/`fix:`/`refactor:` prefix + trailer `Co-Authored-By: Claude <noreply@anthropic.com>` on its own line.
- All commands run from the repo root. Unit suite: `pnpm vanilla test`. Typecheck: `pnpm vanilla typecheck`. E2E: `pnpm e2e`.

---

### Task 1: Raw settings reader + theme writer preserves unknown keys

The theme writer (`update()` in `src/state/theme.js`) currently persists `JSON.stringify(next)` where `next` is `{ theme, mode }` — any theme change would erase a sibling `layout` field. Fix it with a shared raw reader.

**Files:**
- Create: `apps/vanilla-oyl/src/storage/settings.js`
- Create: `apps/vanilla-oyl/src/storage/settings.test.js`
- Modify: `apps/vanilla-oyl/src/state/theme.js` (the `update` method, currently lines 32–36)
- Modify: `apps/vanilla-oyl/src/state/theme.test.js` (add cases; keep existing ones green)

**Interfaces:**
- Produces: `readRawSettings(storage) => Record<string, unknown>` from `src/storage/settings.js` — the raw persisted `oyl/settings` blob, `{}` on missing/corrupt/non-object. Tasks 4 and 8 import it.

- [ ] **Step 1: Write the failing tests**

`apps/vanilla-oyl/src/storage/settings.test.js` (new file):

```js
import { describe, expect, it } from 'vitest'
import { readRawSettings } from './settings.js'
import { SETTINGS_KEY } from './keys.js'

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
  }
}

describe('readRawSettings', () => {
  it('returns the stored object verbatim, unknown keys included', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'forest', layout: 'sidebar', future: 1 }))
    expect(readRawSettings(storage)).toEqual({ theme: 'forest', layout: 'sidebar', future: 1 })
  })
  it('returns {} when missing', () => {
    expect(readRawSettings(memStorage())).toEqual({})
  })
  it('returns {} on corrupt JSON', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, '{nope')
    expect(readRawSettings(storage)).toEqual({})
  })
  it('returns {} on non-object JSON (number, array, null)', () => {
    for (const raw of ['7', '[1]', 'null']) {
      const storage = memStorage()
      storage.setItem(SETTINGS_KEY, raw)
      expect(readRawSettings(storage)).toEqual({})
    }
  })
})
```

Additions to `apps/vanilla-oyl/src/state/theme.test.js` (append inside the file, reusing its existing storage stub if one exists — otherwise add the same `memStorage` helper as above):

```js
it('update() preserves unknown settings keys (e.g. layout) in the stored blob', () => {
  const storage = memStorage()
  storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'forest', mode: 'dark', layout: 'sidebar' }))
  const state = createThemeState(storage)
  state.update({ theme: 'ink' })
  expect(JSON.parse(/** @type {string} */ (storage.getItem(SETTINGS_KEY)))).toEqual({
    theme: 'ink',
    mode: 'dark',
    layout: 'sidebar',
  })
})

it('update() merges from RAW storage, not the normalized signal (out-of-band write survives)', () => {
  const storage = memStorage()
  const state = createThemeState(storage) // signal born WITHOUT layout
  // Another writer (the future layout state) adds a key after this state was created:
  storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'focus' }))
  state.update({ mode: 'light' })
  const stored = JSON.parse(/** @type {string} */ (storage.getItem(SETTINGS_KEY)))
  expect(stored.layout).toBe('focus')
  expect(stored.mode).toBe('light')
})
```

(`SETTINGS_KEY` import: `import { SETTINGS_KEY } from '../storage/keys.js'` in theme.test.js.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test -- src/storage/settings.test.js src/state/theme.test.js`
Expected: settings.test.js FAILS (module not found); the two new theme cases FAIL (stored blob equals `{theme, mode}` only).

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/storage/settings.js` (new file):

```js
import { SETTINGS_KEY } from './keys.js'

/** @typedef {{ getItem(k: string): string | null }} ReadableStorage */

/**
 * The RAW persisted settings blob — never normalized, so unknown keys survive.
 * Writers MUST merge onto this (not onto an in-memory signal, which holds a
 * normalized value that already dropped keys it doesn't know).
 * @param {ReadableStorage} storage
 * @returns {Record<string, unknown>}
 */
export function readRawSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {}
  } catch {
    return {}
  }
}
```

In `apps/vanilla-oyl/src/state/theme.js`: add `import { readRawSettings } from '../storage/settings.js'` and change `update` to:

```js
    /** @param {Partial<ThemeSettings>} change */
    update(change) {
      const next = nextSettings(settings.get(), change)
      settings.set(next)
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readRawSettings(storage), ...next }))
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test -- src/storage/settings.test.js src/state/theme.test.js`
Expected: ALL PASS (including the pre-existing theme tests — the merge must not change `{theme, mode}` behavior when no extra keys exist).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/storage/settings.js apps/vanilla-oyl/src/storage/settings.test.js apps/vanilla-oyl/src/state/theme.js apps/vanilla-oyl/src/state/theme.test.js
git commit -m "fix: theme settings writes preserve unknown sibling keys (raw read-merge-write)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Layout catalog + `classic` layout module

The catalog mirrors `src/theme/theme-catalog.js` in spirit: a list of frozen descriptors + lookup/validation helpers. `classic` is the current frame's desktop geometry, extracted.

**Files:**
- Create: `apps/vanilla-oyl/src/layouts/classic.js`
- Create: `apps/vanilla-oyl/src/layouts/layout-catalog.js`
- Create: `apps/vanilla-oyl/src/layouts/layout-catalog.test.js`

**Interfaces:**
- Produces (from `layout-catalog.js`; Tasks 4, 6, 7 consume):
  - `LAYOUTS: LayoutDescriptor[]` (order = picker order: classic, sidebar, dashboard, focus, wide — Task 2 registers only `classic`; Task 3 adds the rest)
  - `DEFAULT_LAYOUT` — the string `'classic'`
  - `isLayoutId(v: unknown) => boolean`
  - `byId(id: string) => LayoutDescriptor` (unknown id → the classic descriptor)
  - `ORIENTATION: Record<NavMode, 'horizontal'|'vertical'>` — `{ top: 'horizontal', side: 'vertical', floating: 'horizontal' }`
  - `LayoutDescriptor` typedef: `{ id: string, label: string, description: string, navMode: 'top'|'side'|'floating', widgets: 'rail'|'band'|'none', pageWidth: 'classic'|'wide', styles: CSSStyleSheet }`

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/layouts/layout-catalog.test.js` (new file). Written against the FULL five-layout catalog from the start — after Task 2 only the classic-specific assertions pass, so Task 2 asserts a 1-layout catalog and Task 3 flips the count. To keep both tasks green independently, drive counts off `LAYOUTS.length` and pin the full list only in Task 3. Task 2 version:

```js
import { describe, expect, it } from 'vitest'
import { LAYOUTS, DEFAULT_LAYOUT, isLayoutId, byId, ORIENTATION } from './layout-catalog.js'

describe('layout catalog', () => {
  it('has classic as the default and first entry', () => {
    expect(DEFAULT_LAYOUT).toBe('classic')
    expect(LAYOUTS[0]?.id).toBe('classic')
  })

  it('every descriptor is frozen and complete', () => {
    for (const l of LAYOUTS) {
      expect(Object.isFrozen(l), l.id).toBe(true)
      expect(typeof l.label).toBe('string')
      expect(typeof l.description).toBe('string')
      expect(['top', 'side', 'floating']).toContain(l.navMode)
      expect(['rail', 'band', 'none']).toContain(l.widgets)
      expect(['classic', 'wide']).toContain(l.pageWidth)
      expect(l.styles).toBeInstanceOf(CSSStyleSheet)
    }
  })

  it('ids are unique', () => {
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length)
  })

  it('isLayoutId accepts every catalog id and rejects everything else', () => {
    for (const l of LAYOUTS) expect(isLayoutId(l.id)).toBe(true)
    expect(isLayoutId('cyberpunk')).toBe(false)
    expect(isLayoutId(undefined)).toBe(false)
    expect(isLayoutId(7)).toBe(false)
  })

  it('byId falls back to classic for unknown ids', () => {
    expect(byId('nope').id).toBe('classic')
    expect(byId('classic').id).toBe('classic')
  })

  it('maps every navMode to a nav orientation', () => {
    expect(ORIENTATION).toEqual({ top: 'horizontal', side: 'vertical', floating: 'horizontal' })
  })

  it('classic keeps the current frame contract', () => {
    const classic = byId('classic')
    expect(classic.navMode).toBe('top')
    expect(classic.widgets).toBe('none')
    expect(classic.pageWidth).toBe('classic')
  })

  it('every layout sheet rule is scoped to desktop (min-width: 641px)', () => {
    for (const l of LAYOUTS) {
      for (const rule of l.styles.cssRules) {
        const media = /** @type {CSSMediaRule} */ (rule)
        expect('conditionText' in media, `${l.id}: "${rule.cssText.slice(0, 60)}" must be an @media rule`).toBe(true)
        expect(media.conditionText).toBe('(min-width: 641px)')
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/layouts/layout-catalog.test.js`
Expected: FAIL — module `./layout-catalog.js` not found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/layouts/classic.js` (new file):

```js
import { sheet } from '../components/sheet.js'

/**
 * Classic — the original single-column, top-nav frame.
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const classic = Object.freeze({
  id: 'classic',
  label: 'Classic',
  description: 'Top navigation, single centered column',
  navMode: /** @type {const} */ ('top'),
  widgets: /** @type {const} */ ('none'),
  pageWidth: /** @type {const} */ ('classic'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          "title nav toolbar"
          "widgets widgets widgets"
          "page page page";
      }
      .title, .toolbar { padding-block: var(--space-3); }
      .nav-dock {
        display: flex; align-items: center;
        background: var(--color-surface);
        border-block-end: 1px solid var(--color-border);
      }
      .page { max-inline-size: 680px; margin-inline: auto; }
    }
  `),
})
```

`apps/vanilla-oyl/src/layouts/layout-catalog.js` (new file):

```js
import { classic } from './classic.js'

/**
 * The layout catalog — mirrors theme-catalog.js: one frozen descriptor per layout,
 * registered here. Adding a layout = new module in src/layouts/ + one import line.
 *
 * @typedef {'top' | 'side' | 'floating'} NavMode
 * @typedef {'rail' | 'band' | 'none'} WidgetsMode
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description: string,
 *   navMode: NavMode,
 *   widgets: WidgetsMode,
 *   pageWidth: 'classic' | 'wide',
 *   styles: CSSStyleSheet,
 * }} LayoutDescriptor
 */

/** @type {LayoutDescriptor[]} Picker order. */
export const LAYOUTS = [classic]

export const DEFAULT_LAYOUT = 'classic'

/**
 * How each navMode presents the slotted oyl-nav (reflected as its `orientation`
 * attribute by the shell). `floating` is horizontal: the pill is styled from the
 * focus layout's sheet via ::slotted — oyl-nav itself has no `floating` hook.
 * @type {Record<NavMode, 'horizontal' | 'vertical'>}
 */
export const ORIENTATION = Object.freeze({ top: 'horizontal', side: 'vertical', floating: 'horizontal' })

/** @param {unknown} v @returns {boolean} */
export function isLayoutId(v) {
  return typeof v === 'string' && LAYOUTS.some((l) => l.id === v)
}

/** Unknown ids resolve to classic — never throws, never renders an empty frame. @param {string} id @returns {LayoutDescriptor} */
export function byId(id) {
  return LAYOUTS.find((l) => l.id === id) ?? classic
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vanilla test -- src/layouts/layout-catalog.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/layouts/
git commit -m "feat: layout catalog with classic layout module (descriptor + desktop-scoped sheet)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: The other four layout modules (sidebar, dashboard, focus, wide)

Pure data + CSS. The Task 2 catalog test already enforces frozen/complete/scoped for whatever is registered; this task adds the four modules, registers them, and pins the full set.

**Files:**
- Create: `apps/vanilla-oyl/src/layouts/sidebar.js`, `dashboard.js`, `focus.js`, `wide.js`
- Modify: `apps/vanilla-oyl/src/layouts/layout-catalog.js` (imports + `LAYOUTS`)
- Modify: `apps/vanilla-oyl/src/layouts/layout-catalog.test.js` (pin the full set)

**Interfaces:**
- Consumes: `sheet(css)` from `src/components/sheet.js`; the `LayoutDescriptor` shape and grid-area names from Task 2 (`title`, `nav`, `widgets`, `page` areas; `.title`, `.toolbar`, `.nav-dock`, `.widgets`, `.page` classes — Task 6 builds shadow DOM matching these).
- Produces: the five-descriptor `LAYOUTS` every later task relies on.

- [ ] **Step 1: Extend the catalog test (failing)**

In `layout-catalog.test.js`, add:

```js
  it('registers exactly the five v1 layouts in picker order', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual(['classic', 'sidebar', 'dashboard', 'focus', 'wide'])
  })

  it('descriptor values match the spec table', () => {
    const table = /** @type {Record<string, [string, string, string]>} */ ({
      classic: ['top', 'none', 'classic'],
      sidebar: ['side', 'rail', 'wide'],
      dashboard: ['top', 'band', 'classic'],
      focus: ['floating', 'none', 'classic'],
      wide: ['top', 'none', 'wide'],
    })
    for (const l of LAYOUTS) {
      expect([l.navMode, l.widgets, l.pageWidth], l.id).toEqual(table[l.id])
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/layouts/layout-catalog.test.js`
Expected: FAIL — `LAYOUTS` has 1 entry.

- [ ] **Step 3: Implement the four modules**

Each file carries the same LAYOUT MODULE RULES comment as `classic.js` (copy it verbatim into each header).

`apps/vanilla-oyl/src/layouts/sidebar.js`:

```js
import { sheet } from '../components/sheet.js'

/**
 * Sidebar — left rail: vertical nav on top, widget rail below; wide page.
 * (LAYOUT MODULE RULES — copy of the block in classic.js.)
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const sidebar = Object.freeze({
  id: 'sidebar',
  label: 'Sidebar',
  description: 'Side navigation with a widget rail, wider page',
  navMode: /** @type {const} */ ('side'),
  widgets: /** @type {const} */ ('rail'),
  pageWidth: /** @type {const} */ ('wide'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: 15rem 1fr auto;
        grid-template-rows: auto 1fr auto;
        grid-template-areas:
          "nav title toolbar"
          "nav page page"
          "widgets page page";
      }
      .title, .toolbar { padding-block: var(--space-3); }
      .nav-dock {
        background: var(--color-surface);
        border-inline-end: 1px solid var(--color-border);
        padding: var(--space-4) var(--space-3);
      }
      .widgets {
        background: var(--color-surface);
        border-inline-end: 1px solid var(--color-border);
        padding: var(--space-3);
      }
      .page { max-inline-size: 960px; margin-inline: auto; }
    }
  `),
})
```

`apps/vanilla-oyl/src/layouts/dashboard.js`:

```js
import { sheet } from '../components/sheet.js'

/**
 * Dashboard — a widget band above the page on every screen; top nav.
 * Visually ≈ classic until Plan B fills the band (deliberate, documented state).
 * (LAYOUT MODULE RULES — copy of the block in classic.js.)
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const dashboard = Object.freeze({
  id: 'dashboard',
  label: 'Dashboard',
  description: 'Highlights band above every screen',
  navMode: /** @type {const} */ ('top'),
  widgets: /** @type {const} */ ('band'),
  pageWidth: /** @type {const} */ ('classic'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          "title nav toolbar"
          "widgets widgets widgets"
          "page page page";
      }
      .title, .toolbar { padding-block: var(--space-3); }
      .nav-dock {
        display: flex; align-items: center;
        background: var(--color-surface);
        border-block-end: 1px solid var(--color-border);
      }
      .widgets {
        padding: var(--space-3) var(--space-4);
        border-block-end: 1px solid var(--color-border);
        background: color-mix(in oklch, var(--color-surface) 60%, transparent);
      }
      .page { max-inline-size: 680px; margin-inline: auto; }
    }
  `),
})
```

`apps/vanilla-oyl/src/layouts/focus.js`:

```js
import { sheet } from '../components/sheet.js'

/**
 * Focus — minimal chrome: transparent header, floating pill nav, roomy type.
 * The pill is host-level styling on the slotted oyl-nav (::slotted) because
 * focus and classic are attribute-identical on the nav (both `horizontal`).
 * (LAYOUT MODULE RULES — copy of the block in classic.js.)
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const focus = Object.freeze({
  id: 'focus',
  label: 'Focus',
  description: 'Distraction-free: floating nav, extra whitespace',
  navMode: /** @type {const} */ ('floating'),
  widgets: /** @type {const} */ ('none'),
  pageWidth: /** @type {const} */ ('classic'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: 1fr auto;
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          "title toolbar"
          "nav nav"
          "page page";
      }
      .title, .toolbar { background: transparent; border-block-end: none; padding-block: var(--space-2); }
      .nav-dock {
        position: fixed; inset-inline: 0; inset-block-end: var(--space-5); z-index: 10;
        display: flex; justify-content: center;
        pointer-events: none; /* the pill re-enables; the empty gutter stays click-through */
      }
      ::slotted([slot="nav"]) {
        pointer-events: auto;
        background: color-mix(in oklch, var(--color-surface) 88%, transparent);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: var(--space-1) var(--space-2);
        box-shadow: 0 8px 24px color-mix(in oklch, var(--color-text) 15%, transparent);
        backdrop-filter: blur(8px);
      }
      .page {
        max-inline-size: 680px; margin-inline: auto;
        font-size: 1.0625em; line-height: 1.6;
        padding-block-start: var(--space-8);
        padding-block-end: 7rem; /* long pages must never end under the pill */
      }
    }
  `),
})
```

`apps/vanilla-oyl/src/layouts/wide.js`:

```js
import { sheet } from '../components/sheet.js'

/**
 * Wide — classic arrangement, roomier 960px frame for dense screens.
 * (LAYOUT MODULE RULES — copy of the block in classic.js.)
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const wide = Object.freeze({
  id: 'wide',
  label: 'Wide',
  description: 'Top navigation, roomier 960px column',
  navMode: /** @type {const} */ ('top'),
  widgets: /** @type {const} */ ('none'),
  pageWidth: /** @type {const} */ ('wide'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          "title nav toolbar"
          "widgets widgets widgets"
          "page page page";
      }
      .title, .toolbar { padding-block: var(--space-3); }
      .nav-dock {
        display: flex; align-items: center;
        background: var(--color-surface);
        border-block-end: 1px solid var(--color-border);
      }
      .page { max-inline-size: 960px; margin-inline: auto; }
    }
  `),
})
```

In `layout-catalog.js`, update the imports and list:

```js
import { classic } from './classic.js'
import { sidebar } from './sidebar.js'
import { dashboard } from './dashboard.js'
import { focus } from './focus.js'
import { wide } from './wide.js'
```

```js
/** @type {LayoutDescriptor[]} Picker order. */
export const LAYOUTS = [classic, sidebar, dashboard, focus, wide]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vanilla test -- src/layouts/layout-catalog.test.js`
Expected: PASS — including the structural media-scoping test now covering all five sheets.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/layouts/
git commit -m "feat: sidebar, dashboard, focus, and wide layout modules" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Layout state (`createLayoutState`)

Persist/read the `layout` field of the settings blob; near-copy of `createThemeState`, sharing `readRawSettings`.

**Files:**
- Create: `apps/vanilla-oyl/src/state/layout.js`
- Create: `apps/vanilla-oyl/src/state/layout.test.js`

**Interfaces:**
- Consumes: `readRawSettings` (Task 1), `DEFAULT_LAYOUT`/`isLayoutId` (Task 2), `signal` from `src/lib/reactive/signal.js`, `SETTINGS_KEY` from `src/storage/keys.js`.
- Produces: `createLayoutState(storage) => { layout: Signal<string>, setLayout(id: string): void, refresh(): void }`. Tasks 7 and 8 consume this exact shape.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/state/layout.test.js` (new file):

```js
import { describe, expect, it } from 'vitest'
import { createLayoutState } from './layout.js'
import { SETTINGS_KEY } from '../storage/keys.js'

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
  }
}

describe('createLayoutState', () => {
  it('defaults to classic with no stored settings', () => {
    expect(createLayoutState(memStorage()).layout.get()).toBe('classic')
  })

  it('reads a persisted layout', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'sidebar' }))
    expect(createLayoutState(storage).layout.get()).toBe('sidebar')
  })

  it('falls back to classic on unknown or corrupt values', () => {
    for (const raw of [JSON.stringify({ layout: 'cyberpunk' }), '{broken', JSON.stringify({ layout: 7 })]) {
      const storage = memStorage()
      storage.setItem(SETTINGS_KEY, raw)
      expect(createLayoutState(storage).layout.get()).toBe('classic')
    }
  })

  it('setLayout persists and preserves sibling keys (theme)', () => {
    const storage = memStorage()
    storage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'forest', mode: 'dark' }))
    const state = createLayoutState(storage)
    state.setLayout('focus')
    expect(state.layout.get()).toBe('focus')
    expect(JSON.parse(/** @type {string} */ (storage.getItem(SETTINGS_KEY)))).toEqual({
      theme: 'forest',
      mode: 'dark',
      layout: 'focus',
    })
  })

  it('setLayout ignores unknown ids', () => {
    const storage = memStorage()
    const state = createLayoutState(storage)
    state.setLayout('cyberpunk')
    expect(state.layout.get()).toBe('classic')
    expect(storage.getItem(SETTINGS_KEY)).toBe(null) // no write happened
  })

  it('refresh() re-reads storage (multi-tab sync)', () => {
    const storage = memStorage()
    const state = createLayoutState(storage)
    storage.setItem(SETTINGS_KEY, JSON.stringify({ layout: 'wide' }))
    state.refresh()
    expect(state.layout.get()).toBe('wide')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/state/layout.test.js`
Expected: FAIL — module `./layout.js` not found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/state/layout.js` (new file):

```js
import { signal } from '../lib/reactive/signal.js'
import { SETTINGS_KEY } from '../storage/keys.js'
import { readRawSettings } from '../storage/settings.js'
import { DEFAULT_LAYOUT, isLayoutId } from '../layouts/layout-catalog.js'

/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/** @param {AppStorage} storage @returns {string} */
function readLayout(storage) {
  const id = readRawSettings(storage).layout
  return isLayoutId(id) ? /** @type {string} */ (id) : DEFAULT_LAYOUT
}

/**
 * Layout state: a layout-id signal plus setLayout() that validates, persists
 * (merging onto the RAW stored blob so theme/mode survive), and emits.
 * @param {AppStorage} storage
 */
export function createLayoutState(storage) {
  const layout = signal(readLayout(storage))
  return {
    layout,
    /** @param {string} id */
    setLayout(id) {
      if (!isLayoutId(id)) return
      layout.set(id)
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readRawSettings(storage), layout: id }))
    },
    /** Re-read from storage (multi-tab sync). */
    refresh() {
      layout.set(readLayout(storage))
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vanilla test -- src/state/layout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/state/layout.js apps/vanilla-oyl/src/state/layout.test.js
git commit -m "feat: layout state with validated persistence into the shared settings blob" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `oyl-nav` orientation attribute

A presentation-only hook: `orientation="vertical"` stacks the tabs (desktop only). All orientation-keyed rules MUST be media-scoped — an unscoped one would beat the mobile bottom-bar rules on specificity and break phones under the sidebar layout.

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.js` (styles only — the `styles` `sheet(...)` at the top)
- Modify: `apps/vanilla-oyl/src/components/oyl-nav.test.js` (add cases)

**Interfaces:**
- Consumes: nothing new. The shell (Task 6) sets/removes the `orientation` attribute on the element; `oyl-nav`'s JS never reads it (pure CSS hook).
- Produces: the `orientation` content attribute contract: values `horizontal` (default, attribute may be absent) and `vertical`.

- [ ] **Step 1: Write the failing test**

Add to `apps/vanilla-oyl/src/components/oyl-nav.test.js` (match the file's existing setup style for creating the element; the structural sheet test needs no DOM):

```js
it('scopes every orientation-keyed rule to desktop widths', () => {
  // Structural: happy-dom can't evaluate media queries, so assert the sheet's shape.
  // An unscoped [orientation] rule would override the mobile bottom-bar rules.
  const sheets = /** @type {CSSStyleSheet[]} */ (OylNav.styles)
  const offenders = []
  for (const s of sheets) {
    for (const rule of s.cssRules) {
      const text = /** @type {CSSStyleRule} */ (rule).selectorText ?? ''
      if (text.includes('[orientation')) offenders.push(rule.cssText)
      if ('conditionText' in rule && /** @type {CSSMediaRule} */ (rule).conditionText !== '(min-width: 641px)') {
        // media blocks other than the mobile one and the desktop one are unexpected
        if (/** @type {CSSMediaRule} */ (rule).conditionText !== '(max-width: 640px)') offenders.push(rule.cssText)
      }
    }
  }
  expect(offenders).toEqual([])
})

it('has vertical-orientation rules inside the desktop media block', () => {
  const sheets = /** @type {CSSStyleSheet[]} */ (OylNav.styles)
  const desktopRules = sheets
    .flatMap((s) => [...s.cssRules])
    .filter((r) => 'conditionText' in r && /** @type {CSSMediaRule} */ (r).conditionText === '(min-width: 641px)')
    .flatMap((r) => [.../** @type {CSSMediaRule} */ (r).cssRules].map((inner) => inner.cssText))
  expect(desktopRules.some((t) => t.includes('[orientation="vertical"]'))).toBe(true)
})
```

(`OylNav` is already exported from `oyl-nav.js`; import it in the test file if the existing tests don't.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/components/oyl-nav.test.js`
Expected: the second test FAILS (no `[orientation="vertical"]` rules exist yet); the first passes vacuously.

- [ ] **Step 3: Implement**

In `oyl-nav.js`, append to the `sheet(...)` CSS string (after the existing mobile block):

```css
  /* Vertical mode (sidebar layout): the shell reflects orientation="vertical".
     DESKTOP-ONLY BY RULE: reflected attributes exist at every viewport, so any
     [orientation]-keyed rule outside this media block would override the mobile
     bottom bar above. The oyl-nav test enforces this structurally. */
  @media (min-width: 641px) {
    :host([orientation="vertical"]) nav {
      flex-direction: column; align-items: stretch; gap: var(--space-1);
    }
    :host([orientation="vertical"]) a {
      justify-content: flex-start; border-radius: var(--radius-1);
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test -- src/components/oyl-nav.test.js`
Expected: ALL PASS (existing nav tests too — no JS changed).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-nav.js apps/vanilla-oyl/src/components/oyl-nav.test.js
git commit -m "feat: oyl-nav vertical orientation hook, desktop-scoped" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `oyl-shell` refactor — regioned grid + layout signal

The biggest task. The shell's shadow DOM becomes five flat grid items (`.title`, `.nav-dock`, `.toolbar`, `.widgets`, `.page`) so pure CSS `grid-template-areas` can rearrange them per layout — slots never move in the DOM, so slotted children (router, nav) keep state across switches. `baseSheet` carries the mobile arrangement + shared chrome; a `track()` swaps `[baseStyles, baseSheet, active.styles]` and reflects attributes.

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.js` (full rewrite of the file)
- Modify: `apps/vanilla-oyl/src/components/oyl-shell.test.js` (update + add cases)

**Interfaces:**
- Consumes: `byId`, `ORIENTATION`, `DEFAULT_LAYOUT` (Task 2); `baseStyles` + `OylElement` from `src/lib/reactive/oyl-element.js`; layout descriptors' `styles` sheets (Tasks 2–3).
- Produces:
  - `OylShell` instance prop `layoutSignal: Signal<string>` (assigned by `main.js` before append; when unset the shell renders `DEFAULT_LAYOUT` non-reactively — keeps old tests and defensive boot behavior).
  - Host attributes `layout="<id>"` and `widgets="rail|band|none"` (CSS hooks; e2e asserts `layout`).
  - Reflects `orientation` onto the slotted `[slot="nav"]` element and `mode` onto `[slot="widgets"]` (when the layout's widgets ≠ `none`), re-applied on `slotchange`.
  - Slot contract: `nav`, `toolbar`, `widgets`, `main` (Plan B slots a deck into `widgets`; Plan A leaves it empty).

- [ ] **Step 1: Rewrite the shell test file (failing)**

Replace the body of `apps/vanilla-oyl/src/components/oyl-shell.test.js` with (keep any existing imports/setup pattern the file already uses for registering elements — the `defineShell()` + `document.createElement` pattern):

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { defineShell, OylShell } from './oyl-shell.js'
import { signal } from '../lib/reactive/signal.js'
import { byId } from '../layouts/layout-catalog.js'

beforeAll(() => defineShell())

/** @param {string} [layoutId] */
function mount(layoutId) {
  const shell = /** @type {OylShell} */ (document.createElement('oyl-shell'))
  if (layoutId) shell.layoutSignal = signal(layoutId)
  document.body.append(shell)
  return shell
}

describe('oyl-shell', () => {
  it('renders the five grid regions and keeps the slot contract', () => {
    const shell = mount()
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    for (const sel of ['.title', '.nav-dock', '.toolbar', '.widgets', '.page']) {
      expect(root.querySelector(sel), sel).toBeTruthy()
    }
    for (const name of ['nav', 'toolbar', 'widgets', 'main']) {
      expect(root.querySelector(`slot[name="${name}"]`), name).toBeTruthy()
    }
    expect(root.querySelector('h1')?.textContent).toBe('OYL')
  })

  it('defaults to the classic layout without a signal', () => {
    const shell = mount()
    expect(shell.getAttribute('layout')).toBe('classic')
    expect(shell.getAttribute('widgets')).toBe('none')
  })

  it('applies the active layout: host attributes + adopted layout sheet', () => {
    const shell = mount('sidebar')
    expect(shell.getAttribute('layout')).toBe('sidebar')
    expect(shell.getAttribute('widgets')).toBe('rail')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    expect([...root.adoptedStyleSheets]).toContain(byId('sidebar').styles)
  })

  it('reacts to layout signal changes and keeps baseStyles + baseSheet adopted', () => {
    const shell = mount('classic')
    const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
    sig.set('wide')
    expect(shell.getAttribute('layout')).toBe('wide')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    // 3 sheets, layout sheet last so it can override baseSheet within its media scope.
    expect(root.adoptedStyleSheets.length).toBe(3)
    expect(root.adoptedStyleSheets[2]).toBe(byId('wide').styles)
  })

  it('reflects orientation onto the slotted nav, including late slotting', () => {
    const shell = mount('sidebar')
    const nav = document.createElement('div')
    nav.slot = 'nav'
    shell.append(nav) // slotted AFTER the layout applied — slotchange must catch it
    return new Promise((resolve) => {
      queueMicrotask(() => {
        expect(nav.getAttribute('orientation')).toBe('vertical')
        const sig = /** @type {import('../lib/reactive/signal.js').Signal<string>} */ (shell.layoutSignal)
        sig.set('classic')
        expect(nav.getAttribute('orientation')).toBe('horizontal')
        resolve(undefined)
      })
    })
  })

  it('reflects mode onto a slotted widgets element only for widget-bearing layouts', () => {
    const shell = mount('dashboard')
    const deck = document.createElement('div')
    deck.slot = 'widgets'
    shell.append(deck)
    return new Promise((resolve) => {
      queueMicrotask(() => {
        expect(deck.getAttribute('mode')).toBe('band')
        resolve(undefined)
      })
    })
  })

  it('never sets container-type on the host (would trap the fixed mobile nav)', () => {
    const shell = mount('classic')
    const root = /** @type {ShadowRoot} */ (shell.shadowRoot)
    const all = root.adoptedStyleSheets.flatMap((s) => [...s.cssRules].map((r) => r.cssText)).join('\n')
    expect(all).not.toContain('container-type')
  })
})
```

Note: if happy-dom does not fire `slotchange`, the two reflection tests may need the direct path instead — the shell also reflects synchronously inside its layout `track()`, so replace the `queueMicrotask` wait with `sig.set(...)` round-trip (set to another layout and back) and assert after. Prefer `slotchange` first; fall back only if the environment genuinely doesn't emit it, and note which path the test exercises in a comment.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/components/oyl-shell.test.js`
Expected: FAIL — no `.title`/`.nav-dock` regions, no `layout` attribute handling.

- [ ] **Step 3: Rewrite `oyl-shell.js`**

Full new content:

```js
import { OylElement, baseStyles } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { byId, ORIENTATION, DEFAULT_LAYOUT } from '../layouts/layout-catalog.js'

/** @typedef {import('../lib/reactive/signal.js').Signal<string>} LayoutSignal */

/*
 * The shared frame every layout builds on. Contains ALL sub-641px rules: below that
 * width no per-layout sheet applies (they are media-scoped by rule), so this IS the
 * mobile arrangement — the fixed bottom tab bar comes from oyl-nav's own stylesheet.
 * No container-type on :host — layout containment would trap the slotted nav's
 * position:fixed bottom bar (it must position against the viewport on mobile).
 */
const baseSheet = sheet(`
  :host {
    display: grid;
    min-block-size: 100dvh;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto auto 1fr;
    grid-template-areas:
      "title toolbar"
      "nav nav"
      "widgets widgets"
      "page page";
  }
  .title { grid-area: title; }
  .nav-dock { grid-area: nav; }
  .toolbar { grid-area: toolbar; }
  .widgets { grid-area: widgets; }
  .page { grid-area: page; }
  :host([widgets="none"]) .widgets { display: none; }

  .title, .toolbar {
    display: flex; align-items: center; gap: var(--space-4);
    background: var(--color-surface);
    border-block-end: 1px solid var(--color-border);
    padding-block: var(--space-2);
  }
  .title { padding-inline-start: max(var(--space-4), env(safe-area-inset-left)); }
  .toolbar { justify-content: flex-end; padding-inline-end: max(var(--space-4), env(safe-area-inset-right)); }
  h1 { font-size: var(--step-1); margin-block: 0; }

  .page {
    inline-size: 100%;
    padding: clamp(var(--space-4), 4vw, var(--space-8)) var(--space-4) 4rem;
  }
  /* Mobile: oyl-nav docks as a fixed bottom tab bar — keep the page clear of it. */
  @media (max-width: 640px) {
    .page { padding-block-end: calc(5rem + env(safe-area-inset-bottom)); }
  }
  ::slotted([slot="main"]) { display: block; }
`)

export class OylShell extends OylElement {
  static styles = [baseSheet]

  constructor() {
    super()
    /** Assigned by the host before append; without it the shell renders DEFAULT_LAYOUT statically. @type {LayoutSignal | undefined} */
    this.layoutSignal = undefined
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const title = document.createElement('div')
    title.className = 'title'
    const h1 = document.createElement('h1')
    h1.textContent = 'OYL'
    title.append(h1)

    const navDock = document.createElement('div')
    navDock.className = 'nav-dock'
    const navSlot = document.createElement('slot')
    navSlot.setAttribute('name', 'nav')
    navDock.append(navSlot)

    const toolbar = document.createElement('div')
    toolbar.className = 'toolbar'
    const toolbarSlot = document.createElement('slot')
    toolbarSlot.setAttribute('name', 'toolbar')
    toolbar.append(toolbarSlot)

    const widgets = document.createElement('div')
    widgets.className = 'widgets'
    const widgetsSlot = document.createElement('slot')
    widgetsSlot.setAttribute('name', 'widgets')
    widgets.append(widgetsSlot)

    const page = document.createElement('div')
    page.className = 'page'
    const mainSlot = document.createElement('slot')
    mainSlot.setAttribute('name', 'main')
    page.append(mainSlot)

    root.append(title, navDock, toolbar, widgets, page)

    // Late-slotted children (append order in main.js is not guaranteed relative to
    // the first layout track) still get their reflected attributes.
    navSlot.addEventListener('slotchange', () => this._reflect(), { signal: this.lifecycle })
    widgetsSlot.addEventListener('slotchange', () => this._reflect(), { signal: this.lifecycle })

    let first = true
    this.track(() => {
      const active = byId(this.layoutSignal ? this.layoutSignal.get() : DEFAULT_LAYOUT)
      const swap = () => {
        this.setAttribute('layout', active.id)
        this.setAttribute('widgets', active.widgets)
        if ('adoptedStyleSheets' in root) root.adoptedStyleSheets = [baseStyles, baseSheet, active.styles]
        this._reflect()
      }
      // Same View Transition policy as the router/theme applier: instant on first
      // paint, under reduced motion, and without the API; rapid re-switches may
      // reject the in-flight transition's promises — benign, swallow them.
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (first || reduce || typeof document.startViewTransition !== 'function') {
        first = false
        swap()
      } else {
        const transition = document.startViewTransition(swap)
        transition.ready.catch(() => {})
        transition.finished.catch(() => {})
      }
    })
  }

  /** Push layout-derived attributes onto slotted children (nav orientation, deck mode). */
  _reflect() {
    const active = byId(this.layoutSignal ? this.layoutSignal.get() : DEFAULT_LAYOUT)
    this.querySelector('[slot="nav"]')?.setAttribute('orientation', ORIENTATION[active.navMode])
    const deck = this.querySelector('[slot="widgets"]')
    if (deck && active.widgets !== 'none') deck.setAttribute('mode', active.widgets)
  }
}

/** Register the element (idempotent). */
export function defineShell() {
  if (!customElements.get('oyl-shell')) customElements.define('oyl-shell', OylShell)
}
```

Caution: `_reflect()` is called from inside `track()` — `this.layoutSignal.get()` there is the SAME signal the effect already reads, so no extra subscription harm; the `slotchange` calls run outside any effect and subscribe to nothing (correct).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test -- src/components/oyl-shell.test.js`
Expected: ALL PASS.

- [ ] **Step 5: Run the whole vanilla unit suite**

Run: `pnpm vanilla test`
Expected: ALL PASS — other suites (e.g. `main`-adjacent component tests) must not depend on the old header markup. Fix any breakage by updating THOSE tests' selectors (`header` → `.title`/`.toolbar`), never by re-adding old markup.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-shell.js apps/vanilla-oyl/src/components/oyl-shell.test.js
git commit -m "refactor: oyl-shell regioned grid with layout-signal sheet swap and attribute reflection" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `<oyl-layout-picker>` component

A toolbar popover mirroring `oyl-theme-toggle`'s interaction pattern (trigger + panel, radiogroup, Escape/outside-click close), listing the five layouts. It ONLY writes state — never touches the shell.

**Files:**
- Create: `apps/vanilla-oyl/src/components/oyl-layout-picker.js`
- Create: `apps/vanilla-oyl/src/components/oyl-layout-picker.test.js`

**Interfaces:**
- Consumes: `LAYOUTS`, `byId` (Task 2); instance prop `layoutState` = return of `createLayoutState` (Task 4), assigned by `main.js` before append.
- Produces: element `<oyl-layout-picker>` via `defineLayoutPicker()`; data hooks for e2e: `button[data-layout-trigger]`, `[data-layout-panel]`, `button[data-layout-option="<id>"]`.

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/oyl-layout-picker.test.js` (new file):

```js
import { beforeAll, describe, expect, it } from 'vitest'
import { defineLayoutPicker, OylLayoutPicker } from './oyl-layout-picker.js'
import { createLayoutState } from '../state/layout.js'
import { LAYOUTS } from '../layouts/layout-catalog.js'

beforeAll(() => defineLayoutPicker())

const memStorage = () => {
  const m = new Map()
  return {
    getItem: (/** @type {string} */ k) => m.get(k) ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, v),
  }
}

function mount() {
  const state = createLayoutState(memStorage())
  const el = /** @type {OylLayoutPicker} */ (document.createElement('oyl-layout-picker'))
  el.layoutState = state
  document.body.append(el)
  const root = /** @type {ShadowRoot} */ (el.shadowRoot)
  return { el, state, root }
}

describe('oyl-layout-picker', () => {
  it('offers every catalog layout as a radio option', () => {
    const { root } = mount()
    const options = [...root.querySelectorAll('[data-layout-option]')]
    expect(options.map((o) => o.getAttribute('data-layout-option'))).toEqual(LAYOUTS.map((l) => l.id))
  })

  it('opens on trigger click and reflects the active layout', () => {
    const { root } = mount()
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]'))
    const panel = /** @type {HTMLElement} */ (root.querySelector('[data-layout-panel]'))
    expect(panel.hidden).toBe(true)
    trigger.click()
    expect(panel.hidden).toBe(false)
    expect(root.querySelector('[data-layout-option="classic"]')?.getAttribute('aria-checked')).toBe('true')
    expect(trigger.textContent).toContain('Classic')
  })

  it('selecting an option writes the state (and only the state)', () => {
    const { root, state } = mount()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]')).click()
    ;/** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-option="sidebar"]')).click()
    expect(state.layout.get()).toBe('sidebar')
    expect(root.querySelector('[data-layout-option="sidebar"]')?.getAttribute('aria-checked')).toBe('true')
    expect(root.querySelector('[data-layout-option="classic"]')?.getAttribute('aria-checked')).toBe('false')
  })

  it('reflects external state changes (multi-tab refresh path)', () => {
    const { root, state } = mount()
    state.setLayout('wide')
    const trigger = /** @type {HTMLButtonElement} */ (root.querySelector('[data-layout-trigger]'))
    expect(trigger.textContent).toContain('Wide')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test -- src/components/oyl-layout-picker.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/vanilla-oyl/src/components/oyl-layout-picker.js` (new file). Interaction skeleton copies `oyl-theme-toggle.js` (trigger/panel/radiogroup/Escape/outside-pointerdown — same `setOpen`, same `composedPath` guard, same roving `_radiogroup` arrow-key handler; reread that file when implementing):

```js
import { OylElement } from '../lib/reactive/oyl-element.js'
import { sheet } from './sheet.js'
import { LAYOUTS, byId } from '../layouts/layout-catalog.js'

/** @typedef {ReturnType<typeof import('../state/layout.js').createLayoutState>} LayoutState */

const styles = sheet(`
  :host { position: relative; display: inline-block; }
  .trigger {
    display: inline-flex; align-items: center; gap: var(--space-2);
    background: var(--color-surface); color: var(--color-text);
    border: 1px solid var(--color-border); border-radius: 999px;
    padding: 0.3rem 0.8rem; font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .trigger:hover { border-color: var(--color-accent); }
  .trigger:active { transform: scale(0.98); }
  .panel {
    position: absolute; inset-inline-end: 0; inset-block-start: calc(100% + var(--space-2));
    z-index: 30; inline-size: min(17rem, calc(100vw - 2rem));
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-2); padding: var(--space-3);
    box-shadow: 0 12px 32px color-mix(in oklch, var(--color-text) 18%, transparent);
    display: grid; gap: var(--space-2);
  }
  .panel[hidden] { display: none; }
  .group-label { margin: 0; font-size: 0.72rem; font-weight: 600; color: var(--color-muted); }
  .option {
    display: grid; gap: 0.15rem; padding: var(--space-2);
    border: 1px solid var(--color-border); border-radius: var(--radius-1);
    background: var(--color-surface); font: inherit; text-align: start; cursor: pointer;
  }
  .option:hover { border-color: var(--color-accent); }
  .option[aria-checked="true"] { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); }
  .name { font-size: 0.8rem; font-weight: 600; color: var(--color-text); }
  .hint { font-size: 0.7rem; color: var(--color-muted); }
`)

export class OylLayoutPicker extends OylElement {
  static styles = [styles]

  constructor() {
    super()
    /** Assigned by the host before connect. @type {LayoutState} */
    this.layoutState = /** @type {LayoutState} */ (/** @type {unknown} */ (undefined))
  }

  render() {
    const root = /** @type {ShadowRoot} */ (this.shadowRoot)

    const trigger = document.createElement('button')
    trigger.className = 'trigger'
    trigger.setAttribute('data-layout-trigger', '')
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    const triggerLabel = document.createElement('span')
    trigger.append(triggerLabel)

    const panel = document.createElement('div')
    panel.setAttribute('data-layout-panel', '')
    panel.className = 'panel'
    panel.hidden = true

    const label = document.createElement('p')
    label.className = 'group-label'
    label.textContent = 'Layout'
    const group = document.createElement('div')
    group.setAttribute('role', 'radiogroup')
    group.setAttribute('aria-label', 'Layout')
    group.style.display = 'grid'
    group.style.gap = 'var(--space-2)'

    /** @type {Map<string, HTMLButtonElement>} */
    const buttons = new Map()
    for (const l of LAYOUTS) {
      const btn = document.createElement('button')
      btn.className = 'option'
      btn.setAttribute('role', 'radio')
      btn.setAttribute('data-layout-option', l.id)
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = l.label
      const hint = document.createElement('span')
      hint.className = 'hint'
      hint.textContent = l.description
      btn.append(name, hint)
      btn.addEventListener('click', () => this.layoutState.setLayout(l.id), { signal: this.lifecycle })
      buttons.set(l.id, btn)
      group.append(btn)
    }

    panel.append(label, group)
    root.append(trigger, panel)

    const setOpen = (/** @type {boolean} */ open) => {
      panel.hidden = !open
      trigger.setAttribute('aria-expanded', String(open))
    }
    trigger.addEventListener('click', () => setOpen(panel.hidden), { signal: this.lifecycle })
    root.addEventListener(
      'keydown',
      (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Escape' && !panel.hidden) {
          setOpen(false)
          trigger.focus()
        }
      },
      { signal: this.lifecycle },
    )
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!panel.hidden && !e.composedPath().includes(this)) setOpen(false)
      },
      { signal: this.lifecycle },
    )

    this.track(() => {
      const active = byId(this.layoutState.layout.get())
      triggerLabel.textContent = active.label
      trigger.setAttribute('aria-label', `Layout: ${active.label}. Open layout picker`)
      for (const [id, btn] of buttons) {
        const checked = id === active.id
        btn.setAttribute('aria-checked', String(checked))
        btn.tabIndex = checked ? 0 : -1
      }
    })
  }
}

/** Register the element (idempotent — safe across test files). */
export function defineLayoutPicker() {
  if (!customElements.get('oyl-layout-picker')) customElements.define('oyl-layout-picker', OylLayoutPicker)
}
```

(Arrow-key roving selection: if adding it, copy `_radiogroup`'s keydown handler from `oyl-theme-toggle.js` verbatim onto `group`. Optional for Plan A — the theme toggle precedent makes it a cheap consistency win, but tests above don't require it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vanilla test -- src/components/oyl-layout-picker.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-layout-picker.js apps/vanilla-oyl/src/components/oyl-layout-picker.test.js
git commit -m "feat: oyl-layout-picker toolbar popover writing layout state" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `main.js` wiring + typecheck gate

Connect state → shell → picker; extend the multi-tab storage listener.

**Files:**
- Modify: `apps/vanilla-oyl/src/main.js`

**Interfaces:**
- Consumes: everything above. No new exports (main.js is the composition root).

- [ ] **Step 1: Wire it** (no new unit test — every piece is unit-tested; this task's gates are typecheck + full suite + Task 9's e2e)

In `apps/vanilla-oyl/src/main.js`:

1. Add imports:
```js
import { createLayoutState } from './state/layout.js'
import { defineLayoutPicker } from './components/oyl-layout-picker.js'
```
2. Register the element next to the other `define*` calls in `boot()`:
```js
  defineLayoutPicker()
```
3. Create the state right after `const themeState = createThemeState(storage)`:
```js
  const layoutState = createLayoutState(storage)
```
4. In the `storage` event listener, extend the `SETTINGS_KEY` branch — it is the head of an `if / else if / else` chain (AUTH_KEY, OUTBOX_KEY, debouncedRefresh follow) which MUST stay intact. Change only the first branch:
```js
    if (e.key === SETTINGS_KEY) {
      themeState.refresh()
      layoutState.refresh()
    } else if (e.key === AUTH_KEY) authState.refresh()
    // ... rest of the existing chain unchanged
```
5. Where the shell is created (`const shell = document.createElement('oyl-shell')`), type it and hand it the signal:
```js
  const shell = /** @type {import('./components/oyl-shell.js').OylShell} */ (document.createElement('oyl-shell'))
  shell.layoutSignal = layoutState.layout
```
6. Create the picker next to the theme toggle and include it in the append:
```js
  const layoutPicker = /** @type {import('./components/oyl-layout-picker.js').OylLayoutPicker} */ (
    document.createElement('oyl-layout-picker')
  )
  layoutPicker.slot = 'toolbar'
  layoutPicker.layoutState = layoutState
```
```js
  shell.append(navEl, toggle, layoutPicker, accountMenu, router)
```

- [ ] **Step 2: Typecheck**

Run: `pnpm vanilla typecheck`
Expected: clean. (Common trip-ups: the `OylShell` cast in step 5; `layoutSignal` being `Signal<string> | undefined` on the class — assignment is fine, but never READ it unguarded in main.js.)

- [ ] **Step 3: Full unit suite**

Run: `pnpm vanilla test`
Expected: ALL PASS.

- [ ] **Step 4: Manual smoke (optional but cheap)**

Run: `pnpm vanilla dev`, open `http://localhost:8041`, sign in, switch layouts via the new toolbar picker; verify sidebar shows a left vertical nav, focus shows the floating pill, reload keeps the choice. Stop the server after.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/main.js
git commit -m "feat: wire layout state, shell signal, and layout picker into boot" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: E2E spec + full Definition of Done

**Files:**
- Create: `apps/e2e-oyl/tests/layouts.spec.ts`

**Interfaces:**
- Consumes: the e2e fixtures (`../lib/fixtures` — provides `page`, `signIn`, auto hygiene); data hooks `data-layout-trigger` / `data-layout-option` (Task 7); host attribute `layout` (Task 6); `oyl-nav`'s `orientation` attribute (Tasks 5–6). Conventions: `apps/e2e-oyl/README.md` (per-test users via `signIn`, hygiene auto-fixture — this spec has NO intentional failures, so no `hygiene.allow`).

- [ ] **Step 1: Write the spec**

`apps/e2e-oyl/tests/layouts.spec.ts` (new file):

```ts
/**
 * Interchangeable shell layouts: toolbar picker, oyl-shell[layout] frame swap,
 * persistence in oyl/settings alongside the theme, nav orientation reflection,
 * and cross-screen navigation in every layout (desktop + mobile projects).
 * Plan A: widget regions exist but are empty — `dashboard` is visually ≈ classic
 * until Plan B fills the band, so frame assertions use the host attribute.
 */
import { test, expect } from '../lib/fixtures'

const trigger = 'oyl-layout-picker button[data-layout-trigger]'
const ALL = ['classic', 'sidebar', 'dashboard', 'focus', 'wide'] as const

async function pickLayout(page: import('@playwright/test').Page, id: string) {
  await page.locator(trigger).click()
  await page.locator(`oyl-layout-picker [data-layout-option="${id}"]`).click()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', id)
}

test('defaults to classic and persists a picked layout across reload', async ({ page, signIn }) => {
  await signIn('/')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'classic')
  await pickLayout(page, 'sidebar')
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { layout?: string },
  )
  expect(stored.layout).toBe('sidebar')
  await page.reload()
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'sidebar')
  await expect(page.locator(trigger)).toContainText('Sidebar')
})

test('offers all five layouts and reflects nav orientation per layout', async ({ page, signIn }) => {
  await signIn('/')
  await page.locator(trigger).click()
  await expect(page.locator('oyl-layout-picker [data-layout-option]')).toHaveCount(5)
  await page.keyboard.press('Escape')
  await pickLayout(page, 'sidebar')
  await expect(page.locator('oyl-nav')).toHaveAttribute('orientation', 'vertical')
  await pickLayout(page, 'focus')
  await expect(page.locator('oyl-nav')).toHaveAttribute('orientation', 'horizontal')
})

test('navigation works in every layout', async ({ page, signIn }) => {
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    await page.locator('oyl-nav a[data-route="journal"]').click()
    await expect(page).toHaveURL(/\/journal$/)
    await page.locator('oyl-nav a[data-route="status"]').click()
    await expect(page).toHaveURL(/\/status$/)
  }
})

test('theme and layout persist independently (neither write clobbers the other)', async ({ page, signIn }) => {
  await signIn('/')
  await pickLayout(page, 'wide')
  await page.locator('oyl-theme-toggle button[data-picker-trigger]').click()
  await page.locator('oyl-theme-toggle [data-theme-option="forest"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'wide')
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('oyl/settings') ?? '{}') as { theme?: string; layout?: string },
  )
  expect(stored).toMatchObject({ theme: 'forest', layout: 'wide' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest')
  await expect(page.locator('oyl-shell')).toHaveAttribute('layout', 'wide')
})

test('mobile keeps the bottom tab bar usable in every layout', async ({ page, signIn, isMobile }) => {
  test.skip(!isMobile, 'mobile-project geometry check')
  await signIn('/')
  for (const id of ALL) {
    await pickLayout(page, id)
    const nav = page.locator('oyl-nav')
    await expect(nav).toBeVisible()
    const [navBox, viewport] = await Promise.all([nav.boundingBox(), page.viewportSize()])
    // The tab bar must sit at the bottom edge regardless of layout (fixed dock).
    expect(navBox, id).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(Math.abs(navBox!.y + navBox!.height - viewport!.height), id).toBeLessThan(2)
  }
})
```

Note: if `isMobile` is not already exposed by `../lib/fixtures`, use Playwright's built-in `isMobile` test option — it IS available via test args destructuring in stock Playwright; only adjust if the custom fixtures file overrides the args type, in which case read `apps/e2e-oyl/lib/fixtures.ts` and thread the option through the same way other options are.

- [ ] **Step 2: Typecheck the e2e package**

Run: `pnpm --filter @oyl/e2e-oyl typecheck`
Expected: clean.

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm e2e`
Expected: ALL PASS (both projects — desktop and Pixel 7 — run every spec; the hygiene fixture fails any console error/warning or 4xx/5xx automatically, so a throwing layout switch or a broken asset path shows up here).

- [ ] **Step 4: Full Definition of Done sweep**

Run all of:
```bash
pnpm vanilla test
pnpm vanilla typecheck
pnpm e2e
```
Expected: green, green, green.

- [ ] **Step 5: Commit**

```bash
git add apps/e2e-oyl/tests/layouts.spec.ts
git commit -m "feat: e2e coverage for interchangeable shell layouts (picker, persistence, nav, mobile)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## After Plan A

Plan B (engagement widgets: `all-of-oyl` derivation modules `day-streak.ts`/`daily-series.ts`/`digest.ts`, read-only `WidgetContext` facade, `<oyl-widgets>` deck, five widgets, sample data, `widgets.spec.ts`) gets its own plan document once Plan A ships — its file inventory and interfaces are already pinned in the spec's "Widgets" section.
