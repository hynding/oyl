import { sheet } from '../components/sheet.js'

/**
 * Sidebar — left rail: vertical nav on top, widget rail below; wide page.
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
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
