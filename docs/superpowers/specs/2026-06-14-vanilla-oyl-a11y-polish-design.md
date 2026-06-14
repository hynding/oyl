# Vanilla-OYL Cross-Cutting A11y & Polish Pass — Design

**Status:** approved (scope: all three — accessible names, confirm focus, shared focus ring)
**Date:** 2026-06-14
**App:** `apps/vanilla-oyl` (`@oyl/vanilla-oyl`)
**Context:** The app is feature-complete (Journal/Planner/Vault/Goals/Insights/Finance + Status) and already a11y-conscious — reduced-motion guard (`reset.css`), route-change heading focus (`oyl-router`), `aria-current` nav links, `role="group"` inline confirms, a `--focus-ring` token. This pass closes the three concrete gaps the audit found; it is **not** a redesign.

---

## What this is

Three low-risk, clearly-correct fixes that span the component layer:

1. **Accessible names for composite-field controls.** `_labeled(name, text, control)` only assigns the `id` (so `<label htmlFor>` associates) when `control` is an `<input>`/`<select>`. The money/target/cadence/repeat fields pass a **wrapper `<div>`** (`priceWrap`/`targetWrap`/`cadenceWrap`/`repeatRow`), so the label associates with nothing and the inner controls get no accessible name — a screen reader announces the primary amount input as "edit, blank" and the currency/unit selects as bare "combo box". Fix: add `aria-label` directly to each inner control.
2. **Inline confirm keeps keyboard focus.** `inlineConfirm` replaces the trigger button with "[prompt] [Yes] [No]"; the trigger is removed so focus falls to `<body>`, stranding a keyboard user mid-action. Fix: focus the **"No"** button (safe default) when the confirm opens — one change in `confirm.js`, app-wide.
3. **Focus ring inside shadow DOM.** The `reset.css` `:focus-visible` ring lives in the light DOM and does not pierce shadow roots, so keyboard focus inside components falls back to the browser default ring — inconsistent with the design token. Fix: `OylElement` prepends a shared base stylesheet carrying the same `:focus-visible` rule to every component (one edit, since `OylElement` sets `adoptedStyleSheets`).

### Out of scope

- Visual redesign, new components, color/contrast retokening, route/nav changes.
- Reworking `_labeled` itself (the `aria-label` fix is targeted and lower-risk than changing label association semantics everywhere).
- Focus return after a row is deleted (the row vanishes; where focus should land is caller-specific — deferred; the live region already announces "Deleted").

---

## Architecture

### 1. Accessible names on composite-field controls

Add `aria-label` to the inner controls that live inside a wrapper `<div>` (so the orphaned `<label>` no longer leaves them nameless). The visible label text stays (purely visual); `aria-label` supplies the AT name with no double-announce (the `<label htmlFor>` currently associates with nothing).

| File | Control | `aria-label` |
|---|---|---|
| `oyl-finance-composer.js` | `amount` input | `Amount` |
| `oyl-finance-composer.js` | `currency` select | `Currency` |
| `oyl-goal-composer.js` | `target` input | `Target` |
| `oyl-vault-composer.js` | `amount` input | `Price` |
| `oyl-vault-composer.js` | `currency` select | `Currency` |
| `oyl-vault-composer.js` | `cadenceN` input | `Every` |
| `oyl-vault-composer.js` | `cadenceUnit` select | `Cadence unit` |
| `oyl-plan-composer.js` | `repeatN` input | `Repeat interval` |
| `oyl-plan-composer.js` | `repeatUnit` select | `Repeat unit` |

No change needed elsewhere: directly-`_labeled` `<input>`/`<select>` controls already get an `id` (proper association); standalone selects already carry `aria-label` (`oyl-vault` Horizon, `oyl-insights` Period); `oyl-theme-toggle._labeled` *wraps* the control in the `<label>` (implicit association); the inline-confirm group has `role="group"` + `aria-label`.

### 2. `inlineConfirm` focuses "No" on open

In `src/components/confirm.js`, after `mount.append(group)`, focus the No button:
```js
  group.append(label, yes, no)
  mount.append(group)
  no.focus()
```
"No" (not "Yes") is the safe default for a destructive/state-changing two-step — an accidental Enter cancels rather than commits. Every consumer (entry/plan/budget/contact/account/subscription rows, vault items) inherits this.

### 3. Shared `:focus-visible` ring in `OylElement`

In `src/lib/reactive/oyl-element.js`, define and export a module-level base stylesheet and prepend it to every component's adopted sheets:
```js
export const baseStyles = new CSSStyleSheet()
baseStyles.replaceSync(':host(:focus-visible), :focus-visible { outline: var(--focus-ring); outline-offset: 2px; }')
```
In the constructor, replace the current block:
```js
    const styles = /** @type {typeof OylElement} */ (this.constructor).styles
    if (this.shadowRoot && 'adoptedStyleSheets' in this.shadowRoot) {
      this.shadowRoot.adoptedStyleSheets = [baseStyles, ...styles]
    }
```
(Drop the `styles.length` guard so the ring applies even to a component with no own styles.) `--focus-ring` is an inherited custom property defined on `:root` in `tokens.css`, so it resolves inside shadow roots. The rule mirrors `reset.css` exactly, so light-DOM and shadow-DOM focus look identical.

---

## Error handling / risk

- Adding `aria-label` is additive; no behavior change. `inlineConfirm` `no.focus()` is safe (the button exists and is in the DOM). The base stylesheet only adds a `:focus-visible` outline rule — no component sets `outline: none`, so there is no conflict.
- `CSSStyleSheet` + `replaceSync` + `adoptedStyleSheets` are already used by the `sheet()` helper and work under happy-dom.

## Testing (Vitest + happy-dom)

- **Per-composer aria-label tests** (extend `oyl-finance-composer.test.js`, `oyl-goal-composer.test.js`, `oyl-vault-composer.test.js`, `oyl-plan-composer.test.js`): assert each listed inner control has a non-empty `aria-label` (e.g. `expect(q(el, 'select[name="currency"]').getAttribute('aria-label')).toBeTruthy()`). Controls exist in the shadow DOM regardless of segment visibility, so no segment switching is needed.
- **`confirm.test.js`** (new): mount `inlineConfirm` on a `<span>` in `document.body` and assert `mount.querySelector('[data-act="confirm-no"]') === document.activeElement`.
- **`oyl-element.test.js`** (extend/create): define a trivial `OylElement` subclass, create it, and assert `el.shadowRoot.adoptedStyleSheets[0] === baseStyles` (robust — no `cssRules` dependency). A representative defined component (e.g. `oyl-vault-item`) likewise has `baseStyles` as its first adopted sheet.

## File structure

```
apps/vanilla-oyl/src/
  components/oyl-finance-composer.js   (modify: aria-label amount + currency)
  components/oyl-goal-composer.js      (modify: aria-label target)
  components/oyl-vault-composer.js     (modify: aria-label amount, currency, cadenceN, cadenceUnit)
  components/oyl-plan-composer.js      (modify: aria-label repeatN, repeatUnit)
  components/confirm.js                (modify: focus No on open)
  lib/reactive/oyl-element.js          (modify: export baseStyles + prepend to adoptedStyleSheets)
  + extend the four composer tests; new confirm.test.js; extend/create oyl-element.test.js
```
No new components, stores, routes, or data/main changes.

## Acceptance

`pnpm vanilla test` green + `pnpm vanilla typecheck` clean, then a real-Chrome spot check:
- Tab through the Finance composer — the amount input and currency select announce names (inspect: each has `aria-label`), and every focused control shows the accent `--focus-ring` outline (inside shadow DOM, not just the browser default).
- Click a row's **Delete** — focus lands on the **No** button (Tab/Enter works without mouse); Esc/clicking No restores the row.
- Keyboard-only: every interactive control on each screen shows a visible focus ring consistent with the design token.
