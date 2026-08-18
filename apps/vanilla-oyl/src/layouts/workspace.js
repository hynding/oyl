import { sheet } from '../components/sheet.js'

/**
 * Workspace — the three-column productivity frame: a full-height nav rail on the
 * left, the page in the middle, and the highlights deck docked as a right-hand
 * aside. Rail and aside both stick while the page scrolls, because both are
 * glanceable context rather than content you read top to bottom.
 *
 * Below ~1100px three columns starve the page, so the aside rejoins the rail
 * (sidebar's arrangement). That fallback is a NESTED @media, which keeps every
 * top-level rule inside the desktop scope the catalog test enforces.
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally.
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const workspace = Object.freeze({
  id: 'workspace',
  label: 'Workspace',
  description: 'Side navigation, centered page, highlights aside',
  navMode: /** @type {const} */ ('side'),
  widgets: /** @type {const} */ ('rail'),
  pageWidth: /** @type {const} */ ('wide'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: 14rem minmax(0, 1fr) minmax(18rem, auto);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          "nav title toolbar"
          "nav page widgets";
      }
      .title, .toolbar { padding-block: var(--space-3); }
      .nav-dock {
        background: var(--color-surface);
        border-inline-end: 1px solid var(--color-border);
        padding: var(--space-4) var(--space-3);
      }
      .widgets {
        border-inline-start: 1px solid var(--color-border);
        background: color-mix(in oklch, var(--color-surface) 60%, transparent);
        padding: var(--space-4) var(--space-3);
      }
      /* The dock stretches so its divider runs the full height; the slotted
         element inside it is what actually sticks. */
      ::slotted([slot="nav"]), ::slotted([slot="widgets"]) {
        position: sticky;
        inset-block-start: var(--space-4);
      }
      .page {
        max-inline-size: 960px; margin-inline: auto;
        padding-inline: var(--space-6);
      }

      @media (max-width: 1099px) {
        :host {
          grid-template-columns: 14rem minmax(0, 1fr) auto;
          grid-template-rows: auto minmax(0, 1fr) auto;
          grid-template-areas:
            "nav title toolbar"
            "nav page page"
            "widgets page page";
        }
        .widgets {
          border-inline-start: none;
          border-inline-end: 1px solid var(--color-border);
        }
        ::slotted([slot="widgets"]) { position: static; }
      }
    }
  `),
})
