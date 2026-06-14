# Vanilla-OYL Cross-Cutting A11y & Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three audited a11y/polish gaps app-wide — accessible names on composite-field controls, keyboard focus continuity on inline confirms, and a design-token focus ring inside shadow DOM.

**Architecture:** Targeted, additive edits. `aria-label` on the inner controls of wrapper-`<div>` fields across four composers; `no.focus()` in the shared `confirm.js`; a shared `:focus-visible` stylesheet prepended by `OylElement` (one edit, all components).

**Tech Stack:** Vanilla JS + JSDoc, Web Components (shadow DOM + constructable stylesheets), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-14-vanilla-oyl-a11y-polish-design.md`

**Branch:** `feat/vanilla-oyl-a11y-polish` (off `master` HEAD). Baseline: `pnpm vanilla test` green (228 tests).

---

## File structure

- **Modify** `oyl-finance-composer.js`, `oyl-goal-composer.js`, `oyl-vault-composer.js`, `oyl-plan-composer.js` — `aria-label` on composite-field inner controls (T1).
- **Modify** `components/confirm.js` — focus "No" on open (T2).
- **Modify** `lib/reactive/oyl-element.js` — export `baseStyles`, prepend to adopted sheets (T3).
- **Tests:** extend the four composer tests (T1); new `confirm.test.js` (T2); extend/create `lib/reactive/oyl-element.test.js` (T3).

---

### Task 1: Accessible names on composite-field controls

**Files:**
- Modify: `apps/vanilla-oyl/src/components/oyl-finance-composer.js`, `oyl-goal-composer.js`, `oyl-vault-composer.js`, `oyl-plan-composer.js`
- Test: the four matching `*.test.js`

- [ ] **Step 1: Write the failing tests**

In `oyl-finance-composer.test.js` (helper `composer(store, accounts)`, `q(el, sel)` exist), add to the main `describe('<oyl-finance-composer>', ...)`:
```js
  it('gives composite-field controls accessible names', async () => {
    const el = composer({ add: async (e) => e })
    await Promise.resolve()
    expect(q(el, 'input[name="amount"]').getAttribute('aria-label')).toBeTruthy()
    expect(q(el, 'select[name="currency"]').getAttribute('aria-label')).toBeTruthy()
    el.remove()
  })
```
In `oyl-goal-composer.test.js`:
```js
  it('gives the target control an accessible name', async () => {
    const el = composer({ add: async (g) => g })
    await Promise.resolve()
    expect(q(el, 'input[name="target"]').getAttribute('aria-label')).toBeTruthy()
    el.remove()
  })
```
In `oyl-vault-composer.test.js`:
```js
  it('gives composite-field controls accessible names', async () => {
    const el = composer({})
    await Promise.resolve()
    expect(q(el, 'input[name="amount"]').getAttribute('aria-label')).toBeTruthy()
    expect(q(el, 'select[name="currency"]').getAttribute('aria-label')).toBeTruthy()
    expect(q(el, 'input[name="cadenceN"]').getAttribute('aria-label')).toBeTruthy()
    expect(q(el, 'select[name="cadenceUnit"]').getAttribute('aria-label')).toBeTruthy()
    el.remove()
  })
```
In `oyl-plan-composer.test.js`:
```js
  it('gives repeat controls accessible names', async () => {
    const el = composer({ add: async (p) => p })
    await Promise.resolve()
    expect(q(el, 'input[name="repeatN"]').getAttribute('aria-label')).toBeTruthy()
    expect(q(el, 'select[name="repeatUnit"]').getAttribute('aria-label')).toBeTruthy()
    el.remove()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js src/components/oyl-goal-composer.test.js src/components/oyl-vault-composer.test.js src/components/oyl-plan-composer.test.js`
Expected: the 4 new tests FAIL (`getAttribute('aria-label')` is `null`).

- [ ] **Step 3: Implement**

`oyl-finance-composer.js` — after `const amount = this._input('amount', 'number')` (with its `.min`/`.step`) add `amount.setAttribute('aria-label', 'Amount')`; after the `currency` select is built (after the option loop) add `currency.setAttribute('aria-label', 'Currency')`.

`oyl-goal-composer.js` — after `const target = this._input('target', 'number')` (with `.min`/`.step`) add `target.setAttribute('aria-label', 'Target')`.

`oyl-vault-composer.js` — after `const amount = this._input('amount', 'number')` add `amount.setAttribute('aria-label', 'Price')`; after the `currency` option loop add `currency.setAttribute('aria-label', 'Currency')`; after `const cadenceN = this._input('cadenceN', 'number')` (with `.value`/`.min`) add `cadenceN.setAttribute('aria-label', 'Every')`; after the `cadenceUnit` option loop add `cadenceUnit.setAttribute('aria-label', 'Cadence unit')`.

`oyl-plan-composer.js` — after `const repeatN = this._input('repeatN', 'number')` (with its setup) add `repeatN.setAttribute('aria-label', 'Repeat interval')`; after the `repeatUnit` option loop add `repeatUnit.setAttribute('aria-label', 'Repeat unit')`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/oyl-finance-composer.test.js src/components/oyl-goal-composer.test.js src/components/oyl-vault-composer.test.js src/components/oyl-plan-composer.test.js`
Expected: PASS (new + existing).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/components/oyl-finance-composer.js apps/vanilla-oyl/src/components/oyl-goal-composer.js apps/vanilla-oyl/src/components/oyl-vault-composer.js apps/vanilla-oyl/src/components/oyl-plan-composer.js apps/vanilla-oyl/src/components/oyl-finance-composer.test.js apps/vanilla-oyl/src/components/oyl-goal-composer.test.js apps/vanilla-oyl/src/components/oyl-vault-composer.test.js apps/vanilla-oyl/src/components/oyl-plan-composer.test.js
git commit -m "fix(vanilla-oyl): accessible names for composite-field controls (a11y)"
```

---

### Task 2: `inlineConfirm` focuses "No" on open

**Files:**
- Modify: `apps/vanilla-oyl/src/components/confirm.js`
- Test: `apps/vanilla-oyl/src/components/confirm.test.js` (new)

- [ ] **Step 1: Write the failing test**

`apps/vanilla-oyl/src/components/confirm.test.js`:
```js
import { describe, expect, it } from 'vitest'
import { inlineConfirm } from './confirm.js'

describe('inlineConfirm', () => {
  it('focuses the No button when it opens (keyboard continuity)', () => {
    const mount = document.createElement('span')
    document.body.append(mount)
    inlineConfirm({ mount, prompt: 'Delete?', lifecycle: new AbortController().signal, onYes: () => {}, restore: () => {} })
    expect(mount.querySelector('[data-act="confirm-no"]')).toBe(document.activeElement)
    mount.remove()
  })

  it('renders the prompt and both actions', () => {
    const mount = document.createElement('span')
    document.body.append(mount)
    inlineConfirm({ mount, prompt: 'Remove it?', lifecycle: new AbortController().signal, onYes: () => {}, restore: () => {} })
    expect(mount.querySelector('[data-act="confirm-yes"]')).toBeTruthy()
    expect(mount.querySelector('[data-act="confirm-no"]')).toBeTruthy()
    expect(mount.textContent).toContain('Remove it?')
    mount.remove()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/confirm.test.js`
Expected: the focus test FAILS (`document.activeElement` is the body, not the No button); the render test passes.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/components/confirm.js`, change the end of `inlineConfirm` from:
```js
  group.append(label, yes, no)
  mount.append(group)
}
```
to:
```js
  group.append(label, yes, no)
  mount.append(group)
  no.focus()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/components/confirm.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/vanilla-oyl/src/components/confirm.js apps/vanilla-oyl/src/components/confirm.test.js
git commit -m "fix(vanilla-oyl): inline confirm focuses No on open (keyboard continuity)"
```

---

### Task 3: Shared `:focus-visible` ring in `OylElement`

**Files:**
- Modify: `apps/vanilla-oyl/src/lib/reactive/oyl-element.js`
- Test: `apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js` (extend or create)

- [ ] **Step 1: Write the failing test**

If `apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js` exists, add the test below; otherwise create the file with this content:
```js
import { describe, expect, it } from 'vitest'
import { OylElement, baseStyles } from './oyl-element.js'

describe('OylElement base styles', () => {
  it('prepends the shared focus-visible stylesheet to every component', () => {
    class FocusProbe extends OylElement {}
    if (!customElements.get('oyl-focus-probe')) customElements.define('oyl-focus-probe', FocusProbe)
    const el = document.createElement('oyl-focus-probe')
    const sheets = /** @type {ShadowRoot} */ (el.shadowRoot).adoptedStyleSheets
    expect(sheets[0]).toBe(baseStyles)
  })
})
```
(If extending an existing test file, add only the `import { baseStyles }` and the new `it`/`describe` — don't duplicate existing imports.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/lib/reactive/oyl-element.test.js`
Expected: FAIL — `baseStyles` is not exported (import error) / not the first adopted sheet.

- [ ] **Step 3: Implement**

In `apps/vanilla-oyl/src/lib/reactive/oyl-element.js`, after the imports (before the class), add the exported base stylesheet:
```js
/** Shared focus ring so keyboard focus inside shadow DOM matches the design token (reset.css only reaches the light DOM). */
export const baseStyles = new CSSStyleSheet()
baseStyles.replaceSync(':host(:focus-visible), :focus-visible { outline: var(--focus-ring); outline-offset: 2px; }')
```
Then change the constructor's style-application block from:
```js
    const styles = /** @type {typeof OylElement} */ (this.constructor).styles
    if (styles.length && this.shadowRoot && 'adoptedStyleSheets' in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = styles
    }
```
to:
```js
    const styles = /** @type {typeof OylElement} */ (this.constructor).styles
    if (this.shadowRoot && 'adoptedStyleSheets' in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = [baseStyles, ...styles]
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run src/lib/reactive/oyl-element.test.js`
Expected: PASS.

- [ ] **Step 5: Full gate**

Run: `pnpm --filter @oyl/vanilla-oyl exec vitest run && pnpm --filter @oyl/vanilla-oyl typecheck`
Expected: all tests PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/vanilla-oyl/src/lib/reactive/oyl-element.js apps/vanilla-oyl/src/lib/reactive/oyl-element.test.js
git commit -m "feat(vanilla-oyl): shared focus-visible ring in shadow DOM via OylElement baseStyles"
```

---

## Final verification

- [ ] `pnpm --filter @oyl/vanilla-oyl exec vitest run` — all green.
- [ ] `pnpm --filter @oyl/vanilla-oyl typecheck` — clean.
- [ ] Real-Chrome spot check (controller, after all tasks): `pnpm vanilla build:lib`, http-server on 8041, seed, hard-reload. On `#/finance`: keyboard-Tab through the composer — amount + currency announce names (inspect `aria-label`) and each focused control shows the accent focus ring (inside shadow DOM). Click a row's **Delete** → focus lands on **No**; Tab/Enter cancels without a mouse. Spot-check the ring on a couple other screens (Vault rows, Goals).
