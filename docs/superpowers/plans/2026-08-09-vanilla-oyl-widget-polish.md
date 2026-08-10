# Vanilla-OYL Widget & Popover Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the deferred-minor items from Plan A's and Plan B's final reviews: converge all five widgets on one badge element + one badge stylesheet, extract the 4×-duplicated outside-closer, make the deck's scroll row keyboard-accessible, and land the small test/doc tightenings.

**Architecture:** Pure consolidation and hardening — no new features, no behavior changes visible to users except deck keyboard focus. Shared badge presentation moves into a constructable stylesheet exported beside `sampleBadge()` (the `baseStyles` pattern); the outside-closer becomes one helper in `popover-sheet.js` with two consumers (`oyl-account-menu` was checked: it has NO popover, so it is NOT a consumer).

**Tech Stack:** Vanilla JS + JSDoc (checkJs), Vitest happy-dom, TS strict for `all-of-oyl/src`, Playwright.

## Global Constraints

- Zero runtime dependencies; JSDoc only in `.js` files; NodeNext `.js` extensions in `all-of-oyl/src`.
- **No behavior changes** beyond: deck container becomes focusable with an accessible name; everything else must render byte-identically (badge markup contract stays `<span data-sample-badge>` text `Sample`, fixture path only).
- Every pre-existing test keeps passing UNCHANGED except where a task explicitly amends it (Task 4's title fix); test diffs otherwise are pure additions or the explicitly listed edits.
- The three-stylesheet media-scoping rule stays intact: the shared badge sheet contains NO media queries and NO `[mode]`/`[orientation]` rules, so existing structural tests stay green.
- Gates: touched-package tests + typecheck per task; **one full DoD sweep in the final task** (`pnpm all-of test`, `pnpm --filter @oyl/all-of-oyl typecheck:src`, `pnpm all-of build`, `pnpm vanilla test`, `pnpm vanilla typecheck`, `pnpm vanilla build:lib` then `pnpm e2e`) — the UI-facing changes make the e2e run mandatory once, at the end.
- Explicitly OUT of scope (stay deferred, do not touch): tz/midnight seams (`hour()`, `today()` rollover), scheduler-level throw containment in `effect`/`flush`, `oyl-account-menu` (no popover exists), the e2e `navTo()` consolidation.
- TDD; commits `refactor:`/`test:`/`docs:` prefixed + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer; stage by explicit path.
- Test-runner note: pass paths directly (`pnpm vanilla test src/widgets/sample-data.test.js`); `--` filtering doesn't work.

---

### Task 1: Badge convergence — one element helper + one shared stylesheet

All five widgets currently carry an identical `[data-sample-badge]` CSS block in their own sheets, and the two Task-6 widgets (`oyl-streak-ring`, `oyl-today-plan`) still build the badge inline instead of using `sampleBadge()`.

**Files:**
- Modify: `apps/vanilla-oyl/src/widgets/sample-data.js` (add `badgeStyles` export)
- Modify: `apps/vanilla-oyl/src/widgets/sample-data.test.js` (add cases)
- Create: `apps/vanilla-oyl/src/widgets/badge-convergence.test.js`
- Modify: all five widget files `apps/vanilla-oyl/src/widgets/oyl-{greeting-digest,streak-ring,today-plan,trend-sparklines,goal-rings}.js`

**Interfaces:**
- Produces: `badgeStyles` — a `CSSStyleSheet` (built with `sheet()` from `../components/sheet.js`) holding the ONE `[data-sample-badge]` rule block, exported from `sample-data.js` beside `sampleBadge()`. Every widget includes it as the FIRST entry of `static styles = [badgeStyles, styles]` and deletes its local `[data-sample-badge]` block. `oyl-streak-ring` deletes its local `badge()` helper and `oyl-today-plan` its inline three-liner; both import `sampleBadge` (already imported by the other three).

- [ ] **Step 1: Write the failing tests**

Append to `apps/vanilla-oyl/src/widgets/sample-data.test.js`:

```js
import { badgeStyles } from './sample-data.js' // merge into the existing import line

it('exports the one shared badge stylesheet', () => {
  expect(badgeStyles).toBeInstanceOf(CSSStyleSheet)
  const text = [...badgeStyles.cssRules].map((r) => r.cssText).join('\n')
  expect(text).toContain('[data-sample-badge]')
  expect(text).toContain('position: absolute')
  // No media queries and no layout-attribute rules — keeps the structural
  // media-scoping tests' world simple.
  expect([...badgeStyles.cssRules].some((r) => 'conditionText' in r)).toBe(false)
})
```

Create `apps/vanilla-oyl/src/widgets/badge-convergence.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { badgeStyles } from './sample-data.js'
import { OylGreetingDigest } from './oyl-greeting-digest.js'
import { OylStreakRing } from './oyl-streak-ring.js'
import { OylTodayPlan } from './oyl-today-plan.js'
import { OylTrendSparklines } from './oyl-trend-sparklines.js'
import { OylGoalRings } from './oyl-goal-rings.js'

const WIDGET_CLASSES = [
  ['oyl-greeting-digest', OylGreetingDigest],
  ['oyl-streak-ring', OylStreakRing],
  ['oyl-today-plan', OylTodayPlan],
  ['oyl-trend-sparklines', OylTrendSparklines],
  ['oyl-goal-rings', OylGoalRings],
]

describe('badge convergence', () => {
  it('every widget adopts the shared badge stylesheet', () => {
    for (const [name, cls] of WIDGET_CLASSES) {
      expect(/** @type {CSSStyleSheet[]} */ (cls.styles).includes(badgeStyles), String(name)).toBe(true)
    }
  })

  it('no widget re-declares its own [data-sample-badge] rule', () => {
    for (const [name, cls] of WIDGET_CLASSES) {
      const own = /** @type {CSSStyleSheet[]} */ (cls.styles)
        .filter((s) => s !== badgeStyles)
        .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
        .filter((t) => t.includes('[data-sample-badge]'))
      expect(own, String(name)).toEqual([])
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vanilla test src/widgets/sample-data.test.js src/widgets/badge-convergence.test.js`
Expected: sample-data case fails (`badgeStyles` not exported); both convergence cases fail.

- [ ] **Step 3: Implement**

In `sample-data.js`, add at the top `import { sheet } from '../components/sheet.js'` and below `sampleBadge()`:

```js
/**
 * The one shared badge stylesheet — include as the FIRST entry of a widget's
 * `static styles` (the baseStyles pattern) so a widget's own sheet could
 * override it if ever needed. Positioning assumes the widget's root wrapper
 * is `position: relative` (every widget's `.wrap` is).
 */
export const badgeStyles = sheet(`
  [data-sample-badge] {
    position: absolute; inset-block-start: 0; inset-inline-end: 0;
    font-size: 0.62rem; text-transform: uppercase; letter-spacing: .06em;
    color: var(--color-muted); border: 1px solid var(--color-border);
    border-radius: 999px; padding: 0 .4rem;
  }
`)
```

(Before writing it, `grep -n "data-sample-badge" apps/vanilla-oyl/src/widgets/oyl-*.js` and copy the EXACT declarations from the widgets' current identical blocks — the block above reflects them, but the source of truth is the code.)

In EACH of the five widget files:
1. Import: add `badgeStyles` to the existing `./sample-data.js` import (streak-ring and today-plan also add `sampleBadge` there).
2. `static styles = [styles]` → `static styles = [badgeStyles, styles]`.
3. Delete the `[data-sample-badge] { … }` block from the local `sheet(...)` string.
4. `oyl-streak-ring.js`: delete the module-level `badge()` helper; replace its call site with `sampleBadge()`. `oyl-today-plan.js`: replace the inline `const b = document.createElement('span'); b.setAttribute('data-sample-badge', ''); b.textContent = 'Sample'; wrap.append(b)` with `wrap.append(sampleBadge())`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test src/widgets/badge-convergence.test.js src/widgets/sample-data.test.js` then the five widget test files, then full `pnpm vanilla test` + `pnpm vanilla typecheck`.
Expected: ALL PASS — the widgets' existing badge presence/absence tests are the behavioral lock; they must pass UNCHANGED.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/
git commit -m "refactor: converge all widgets on sampleBadge() and one shared badge stylesheet" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Shared `closeOnOutside()` for toolbar popovers

The pointerdown + focusin outside-closers are duplicated verbatim in `oyl-theme-toggle.js` and `oyl-layout-picker.js` (4 listeners, 2 files).

**Files:**
- Modify: `apps/vanilla-oyl/src/components/popover-sheet.js` (add helper)
- Modify: `apps/vanilla-oyl/src/components/popover-sheet.test.js` (add cases)
- Modify: `apps/vanilla-oyl/src/components/oyl-theme-toggle.js`, `apps/vanilla-oyl/src/components/oyl-layout-picker.js` (replace the two document listeners each)

**Interfaces:**
- Produces: `closeOnOutside(host: HTMLElement, panel: HTMLElement, setOpen: (open: boolean) => void, signal: AbortSignal): void` from `popover-sheet.js` — registers `pointerdown` AND `focusin` document listeners that call `setOpen(false)` when the panel is open and the event's `composedPath()` does not include `host`; both bound with `{ signal }`.

- [ ] **Step 1: Write the failing test**

Append to `apps/vanilla-oyl/src/components/popover-sheet.test.js`:

```js
import { closeOnOutside } from './popover-sheet.js' // merge into the existing import
import { describe, expect, it } from 'vitest' // already imported — keep one line

describe('closeOnOutside', () => {
  function harness() {
    const host = document.createElement('div')
    const panel = document.createElement('div')
    panel.hidden = false
    document.body.append(host)
    let open = true
    const controller = new AbortController()
    closeOnOutside(host, panel, (v) => { open = v; panel.hidden = !v }, controller.signal)
    return { host, panel, isOpen: () => open, controller }
  }

  it.each(['pointerdown', 'focusin'])('closes on outside %s', (type) => {
    const { isOpen, controller } = harness()
    document.body.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
    expect(isOpen()).toBe(false)
    controller.abort()
  })

  it.each(['pointerdown', 'focusin'])('ignores inside %s (composedPath contains host)', (type) => {
    const { host, isOpen, controller } = harness()
    host.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true)
    controller.abort()
  })

  it('does nothing when the panel is already hidden', () => {
    const { panel, isOpen, controller } = harness()
    panel.hidden = true
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true) // setOpen never called
    controller.abort()
  })

  it('stops listening after the signal aborts', () => {
    const { controller, panel, isOpen } = harness()
    controller.abort()
    panel.hidden = false
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(isOpen()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test src/components/popover-sheet.test.js`
Expected: FAIL — `closeOnOutside` not exported.

- [ ] **Step 3: Implement**

In `popover-sheet.js`:

```js
/**
 * The shared outside-closer for toolbar popovers: pointer AND keyboard parity
 * (Enter-activated triggers fire no pointerdown; without focusin, keyboard-
 * opened popovers can stack). composedPath makes the containment check
 * shadow-safe.
 * @param {HTMLElement} host @param {HTMLElement} panel
 * @param {(open: boolean) => void} setOpen @param {AbortSignal} signal
 */
export function closeOnOutside(host, panel, setOpen, signal) {
  for (const type of ['pointerdown', 'focusin']) {
    document.addEventListener(
      type,
      (e) => {
        if (!panel.hidden && !e.composedPath().includes(host)) setOpen(false)
      },
      { signal },
    )
  }
}
```

In BOTH `oyl-theme-toggle.js` and `oyl-layout-picker.js`: add `closeOnOutside` to the existing `./popover-sheet.js` import; delete the two `document.addEventListener('pointerdown'|'focusin', …)` blocks; in their place call `closeOnOutside(this, panel, setOpen, this.lifecycle)`. (Escape handling stays where it is — it is component-local, not part of the helper.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test src/components/popover-sheet.test.js src/components/oyl-theme-toggle.test.js src/components/oyl-layout-picker.test.js` — the components' EXISTING outside-close + focusin tests must pass unchanged (they are the behavioral lock on the swap). Then full `pnpm vanilla test` + `pnpm vanilla typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/popover-sheet.js apps/vanilla-oyl/src/components/popover-sheet.test.js apps/vanilla-oyl/src/components/oyl-theme-toggle.js apps/vanilla-oyl/src/components/oyl-layout-picker.js
git commit -m "refactor: shared closeOnOutside helper for toolbar popovers" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Deck keyboard accessibility

The deck's scroll row (`overflow-x: auto` on mobile and in band mode) is not keyboard-scrollable: nothing inside receives focus and the container has no tabindex.

**Files:**
- Modify: `apps/vanilla-oyl/src/widgets/oyl-widgets.js`
- Modify: `apps/vanilla-oyl/src/widgets/oyl-widgets.test.js` (add one case)

**Interfaces:**
- Produces: the deck container gains `tabindex="0"`, `role="group"`, and `aria-label="Highlights"` — focusable so arrow/keyboard scrolling works; the shared focus ring comes from `baseStyles` (`:focus-visible`) for free.

- [ ] **Step 1: Write the failing test**

Add to `oyl-widgets.test.js` (reuse the file's `mount` helper):

```js
it('is keyboard-scrollable: the deck container is focusable with an accessible name', () => {
  const root = mount([stub('a')])
  const deck = /** @type {HTMLElement} */ (root.querySelector('.deck'))
  expect(deck.getAttribute('tabindex')).toBe('0')
  expect(deck.getAttribute('role')).toBe('group')
  expect(deck.getAttribute('aria-label')).toBe('Highlights')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vanilla test src/widgets/oyl-widgets.test.js`
Expected: the new case FAILS (no tabindex).

- [ ] **Step 3: Implement**

In `oyl-widgets.js` `render()`, right after `deck.className = 'deck'`:

```js
    // Keyboard access: the row scrolls (mobile base + band mode), and widgets
    // are non-interactive, so the container itself must take focus for
    // keyboard scrolling. Focus ring comes from the shared baseStyles.
    deck.tabIndex = 0
    deck.setAttribute('role', 'group')
    deck.setAttribute('aria-label', 'Highlights')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vanilla test src/widgets/oyl-widgets.test.js`, then full `pnpm vanilla test` + `pnpm vanilla typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/widgets/oyl-widgets.js apps/vanilla-oyl/src/widgets/oyl-widgets.test.js
git commit -m "fix: make the widget deck scroll row keyboard-accessible" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Test/doc tightenings + full DoD sweep

The remaining micro-items from the ledgers, then the one full gate run for the whole pass.

**Files:**
- Modify: `packages/all-of-oyl/src/insights/day-streak.ts` (doc only)
- Modify: `packages/all-of-oyl/src/insights/daily-series.test.ts` (one assert)
- Modify: `apps/vanilla-oyl/src/widgets/context.test.js` (title + one branch)
- Modify: `apps/vanilla-oyl/src/widgets/oyl-greeting-digest.test.js` (two boundary cases)

**Interfaces:** none — test/doc only.

- [ ] **Step 1: Make the four tightenings (test changes are TDD-degenerate — they must pass immediately against unchanged product code; run each file after editing)**

1. `day-streak.ts` — append to the `streakOf` doc comment:
```
 * Callers pass a range-bounded set (activeDaysIn over a bounded range): the
 * walk-back visits one day per consecutive member, so the set's span bounds
 * the work.
```
2. `daily-series.test.ts` — strengthen the spending assertion: `expect(spendingOn(journal, day('2026-08-06'))).toBeGreaterThan(0)` → `.toBe(25)` (the fixture is `Money.usd(2500)` = 25 whole-currency units; this pins the unit contract the widgets rely on). If the fixture's amount differs in the file, pin to the fixture's actual whole-unit value — exactness is the point, don't change the fixture.
3. `context.test.js` — the case titled `'profileName reads the signal; null profile gives undefined'` never tests the null branch. Fix: change the file's `makeCtx()` signature to `makeCtx(profileValue = /** @type {any} */ ({ displayName: 'Steve' }))` and use `profile: signal(profileValue)` inside it (all existing callers unchanged), then extend the case:
```js
  it('profileName reads the signal; null profile gives undefined', () => {
    const { ctx } = makeCtx()
    expect(ctx.profileName()).toBe('Steve')
    expect(makeCtx(null).ctx.profileName()).toBeUndefined()
  })
```
4. `oyl-greeting-digest.test.js` — extend the greeting test with the boundary hours:
```js
    expect(mount({ hour: 11 }).querySelector('.hello')?.textContent).toBe('Good morning, Steve')
    expect(mount({ hour: 12 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 17 }).querySelector('.hello')?.textContent).toBe('Good afternoon, Steve')
    expect(mount({ hour: 18 }).querySelector('.hello')?.textContent).toBe('Good evening, Steve')
```

- [ ] **Step 2: Run the touched files**

`pnpm all-of test` (day-streak + daily-series), `pnpm vanilla test src/widgets/context.test.js src/widgets/oyl-greeting-digest.test.js` — all pass.

- [ ] **Step 3: Full DoD sweep for the whole polish pass**

```bash
pnpm all-of test
pnpm --filter @oyl/all-of-oyl typecheck:src
pnpm all-of build
pnpm vanilla test
pnpm vanilla typecheck
pnpm --filter @oyl/e2e-oyl typecheck
pnpm vanilla build:lib
# kill stale :8042/:1341 processes first
pnpm e2e
```
Expected: all green (e2e both projects; the badge/deck changes are UI-facing so this run is mandatory).

- [ ] **Step 4: Commit**

```bash
git add packages/all-of-oyl/src/insights/day-streak.ts packages/all-of-oyl/src/insights/daily-series.test.ts apps/vanilla-oyl/src/widgets/context.test.js apps/vanilla-oyl/src/widgets/oyl-greeting-digest.test.js
git commit -m "test: pin greeting boundaries, exact spending units, null-profile branch; document streakOf bounds" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Explicitly deferred (recorded, untouched by this plan)

Tz/midnight seams (`hour()` host-local, `today()` rollover) → effective-timezone sub-project; scheduler-level effect-throw containment → needs its own design (reactive core semantics); real-browser connectedCallback exception semantics → covered by hygiene pageerror in e2e; `navTo()` e2e consolidation.
