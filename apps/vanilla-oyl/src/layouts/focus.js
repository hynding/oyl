import { sheet } from '../components/sheet.js'

/**
 * Focus — minimal chrome: transparent header, floating pill nav, roomy type.
 * The pill is host-level styling on the slotted oyl-nav (::slotted) because
 * focus and classic are attribute-identical on the nav (both `horizontal`).
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
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
