import { sheet } from '../components/sheet.js'

/**
 * Wide — classic arrangement, roomier 960px frame for dense screens.
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
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
