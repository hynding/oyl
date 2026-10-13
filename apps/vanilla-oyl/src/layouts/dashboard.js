import { sheet } from '../components/sheet.js'

/**
 * Dashboard — a widget band above the page on every screen; top nav.
 * Visually ≈ classic until Plan B fills the band (deliberate, documented state).
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
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
