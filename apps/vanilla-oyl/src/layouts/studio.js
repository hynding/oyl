import { sheet } from '../components/sheet.js'

/**
 * Studio — floating panels on a tinted canvas: an inset glass dock on the left,
 * a highlights band, and the page as an elevated card. Every other layout butts
 * its regions edge to edge and separates them with hairlines; this one separates
 * them with air, so the shell reads as depth rather than as a set of frames.
 *
 * The canvas tint and every glass surface are mixed from the ACTIVE theme's
 * tokens, so all six themes and both modes stay coherent with no second palette.
 * Glass degrades to solid fill under prefers-reduced-transparency, and the entry
 * reveal (which establishes the panels' depth order when the layout is applied)
 * only exists under prefers-reduced-motion: no-preference.
 *
 * LAYOUT MODULE RULES (apply to every file in src/layouts/):
 * - Never set `container-type` on :host — it would trap the slotted nav's
 *   position:fixed mobile bottom bar inside the shell.
 * - EVERY rule must live inside `@media (min-width: 641px)`. Below 641px only
 *   the shell's baseSheet applies (the proven mobile bottom-tab arrangement).
 *   The catalog test enforces this structurally, nested at-rules included.
 * @type {import('./layout-catalog.js').LayoutDescriptor}
 */
export const studio = Object.freeze({
  id: 'studio',
  label: 'Studio',
  description: 'Floating dock and panels on a tinted canvas',
  navMode: /** @type {const} */ ('side'),
  widgets: /** @type {const} */ ('band'),
  pageWidth: /** @type {const} */ ('wide'),
  styles: sheet(`
    @media (min-width: 641px) {
      :host {
        grid-template-columns: 15rem minmax(0, 1fr) auto;
        grid-template-rows: auto auto minmax(0, 1fr);
        grid-template-areas:
          "nav title toolbar"
          "nav widgets widgets"
          "nav page page";
        gap: var(--space-4);
        padding: var(--space-4);
        background:
          radial-gradient(60rem 32rem at 10% -12%, color-mix(in oklch, var(--color-accent) 16%, transparent), transparent 68%),
          radial-gradient(44rem 26rem at 104% 4%, color-mix(in oklch, var(--color-accent) 9%, transparent), transparent 62%),
          var(--color-bg);
      }

      /* One radius for every panel; the air between them carries the hierarchy. */
      .nav-dock, .title, .toolbar, .page {
        border: 1px solid color-mix(in oklch, var(--color-border) 80%, transparent);
        border-radius: var(--radius-2);
        background: color-mix(in oklch, var(--color-surface) 72%, transparent);
        backdrop-filter: blur(14px);
        box-shadow: 0 10px 30px color-mix(in oklch, var(--color-text) 9%, transparent);
      }

      /* align-self: start keeps the dock at its own height instead of stretching
         down the whole grid, which is what makes it read as a panel rather than
         as a column; sticky then carries it along a long page. */
      .nav-dock {
        position: sticky; inset-block-start: var(--space-4); align-self: start;
        max-block-size: calc(100dvh - var(--space-8));
        overflow-y: auto;
        padding: var(--space-4) var(--space-3);
      }

      /* The header docks as two pills so page content slides under the glass
         instead of scrolling away from the primary actions. The title hugs its
         own width; a full-span title bar would just be an empty rail. */
      .title, .toolbar {
        position: sticky; inset-block-start: var(--space-4); z-index: 5;
        padding-block: var(--space-3);
        padding-inline: var(--space-4);
      }
      .title { justify-self: start; }

      /* The deck's own cards are the band; a container around them would only
         add a second frame to something already framed. */
      .widgets { padding-inline: var(--space-1); }

      .page {
        max-inline-size: 960px; margin-inline: auto;
        padding: var(--space-6) var(--space-6) 4rem;
      }

      @media (prefers-reduced-transparency: reduce) {
        .nav-dock, .title, .toolbar, .page {
          background: var(--color-surface);
          backdrop-filter: none;
        }
      }

      @media (prefers-reduced-motion: no-preference) {
        @keyframes oyl-studio-rise {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        /* Dock, then band, then page: the stagger states the depth order once,
           when the layout is applied, and then gets out of the way. */
        .nav-dock, .widgets, .page {
          animation: oyl-studio-rise 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .widgets { animation-delay: 60ms; }
        .page { animation-delay: 110ms; }
      }
    }
  `),
})
