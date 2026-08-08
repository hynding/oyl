# Theme Collection + Picker UX (vanilla-oyl)

Date: 2026-08-07
Status: implemented (this spec also scaffolds deferred follow-ups; see "Deferred features")

## Goal

Grow the theme system from 2 themes (classic, forest) to 8, and replace the two plain
`<select>` controls with an engaging, accessible theme picker. Preserve the existing
token architecture (redesign-preserve): per-theme CSS files gated on `:root[data-theme]`,
dual-mode via `light-dark()`, all colors in `oklch()`.

## UX research inputs

- Swatch-preview pickers beat dropdowns for theme selection: all options visible at once,
  each option shows its actual colors before you commit
  ([Max Bock, Color Theme Switcher](https://mxb.dev/blog/color-theme-switcher/),
  [Vercel Geist theme switcher](https://vercel.com/geist/theme-switcher)).
- Radio semantics are the right model for a small fixed set of mutually exclusive choices
  ([Aleksandr Hovhannisyan, The Perfect Theme Switch](https://www.aleksandrhovhannisyan.com/blog/the-perfect-theme-switch/)).
- The View Transitions API's default cross-fade is the sweet spot for theme changes; flip
  instantly when the API is missing or the user prefers reduced motion, and avoid
  over-customizing the transition
  ([Ian Duffy, theme switcher with View Transitions](https://iankduffy.com/articles/creating-a-theme-switcher-using-view-transition),
  [Piccalilli, practical view transitions](https://piccalil.li/blog/some-practical-examples-of-view-transitions-to-elevate-your-ui/)).

Decisions taken from that research:

1. Popover picker in the toolbar: a trigger button showing the current theme's three color
   chips + name; opens a panel with one swatch card per theme (radiogroup) and a segmented
   System/Light/Dark mode control.
2. Selection applies instantly and the panel stays open, so browsing themes is a live
   preview loop. Arrow keys move and select (standard radio behavior), which makes
   keyboard browsing a preview loop too.
3. Theme switches cross-fade via `document.startViewTransition`; boot paint, reduced
   motion, and unsupported browsers apply instantly (`createThemeApplier`).

## Token contract change: `--color-on-accent`

Components previously hard-coded `color: white` on accent-filled controls. That breaks any
theme whose accent polarity inverts (ink's dark-mode accent is near-white) and was already
contrast-weak on 70%-lightness dark accents. Every theme now defines `--color-on-accent`
(the text color used on accent-filled surfaces), and components use
`var(--color-on-accent, white)`, keeping the white fallback for third-party or missed rules.

Classic and forest keep `white` in both modes to preserve their existing look exactly.
The six new themes use a dark on-accent in dark mode (light accents carry dark text),
which meets WCAG AA where white would not.

## The collection

Palette families deliberately occupy distinct hue territories so no two themes read alike.
All themes keep the same lightness bands as classic (bg 96.5-98.5% light / 16-19% dark,
text 20-27% / 92-95%), so AA contrast holds across the set. Because the cascade declares
`@layer reset, tokens, themes, layout`, theme files may also override structural tokens.

| Theme | Accent hue | Neutrals | Structural personality |
|---|---|---|---|
| classic | blue 255 | cool gray | (unchanged) |
| forest | green 150 | green-tinted | (unchanged) |
| sunrise | coral 40 | warm 55-80 | rounder corners (`--radius-1: .5rem`, `--radius-2: 1rem`) |
| ocean | teal 205-210 | cool 230-235 | - |
| lavender | violet 300 | violet-tinted | - |
| ember | burnt orange 55 | warm charcoal (deepest dark bg, 16%) | - |
| ink | achromatic (chroma 0) | pure grayscale | hard corners (`--radius-*: 0`); functional states keep muted chroma |
| paper | print red 30 | warm paper 75-85 | serif `--font-sans` (genuinely editorial, so serif is the point) |

## Architecture

- `styles/themes/<name>.css`: one file per theme, same 12-token contract.
- `src/theme/theme-manager.js`: `THEMES` registry (validation, typedefs),
  `createThemeApplier` (view-transition wrapper around `applyTheme`).
- `src/theme/theme-catalog.js`: display metadata (label, tagline, preview colors).
  Preview colors are verbatim copies of each theme's bg/surface/accent tokens as
  `light-dark()` strings: document stylesheets cannot reach shadow roots, so swatches
  paint from these strings and still track the live `color-scheme`. The catalog test
  enforces catalog/THEMES parity.
- `src/components/oyl-theme-toggle.js`: the picker (same tag + `themeState` contract as
  before, so main.js wiring is unchanged apart from the applier).
- `index.html`: one `<link>` per theme; the anti-FOUC script is theme-agnostic.

## Deferred features (documented + scaffolded, not built)

1. **Account-synced theme preference.** Today settings live in `localStorage`
   (`oyl/settings`) only. To follow the user across devices, add a `themeSettings` field
   to the profile record (`state/profile-store.js`), hydrate it on boot after sign-in, and
   write-through from `createThemeState.update`. Scaffold in place: `nextSettings`
   validates unknown values defensively, so a server payload can be applied as a plain
   `Partial<ThemeSettings>`; storage stays the offline fallback (same pattern as the
   effective-timezone seam).
2. **Auto theme scheduling** (e.g. paper by day, ember by night, or mode flips at local
   sunset). Extend `ThemeSettings` with an optional `schedule` object; `nextSettings`
   already ignores unknown keys on old clients. Evaluation belongs next to the applier in
   main.js (a timer effect writing `themeState.update`), keeping theme-manager pure.
3. **Custom theme builder** (user picks an accent, we derive a full oklch ramp). The
   catalog's `ThemeInfo` shape is the seam: a `custom` entry whose preview and tokens are
   generated (`--color-*` set inline on `:root` instead of a stylesheet). Derivation rule
   worth keeping: neutrals inherit the accent hue at chroma 0.006-0.02, lightness bands as
   above.
4. **Lazy theme CSS loading.** Eight tiny stylesheets are fine today; if the collection
   grows, load only the active theme's `<link>` at boot and inject others on first
   selection (the picker needs no stylesheet for previews thanks to the catalog).
5. **Classic/forest dark-mode on-accent contrast.** Their dark accents (70-72% lightness)
   with white text sit below AA. Fixing means `--color-on-accent: light-dark(white, oklch(20% ...))`
   in those two files; deferred because it visibly changes the two legacy themes.

## Testing

- Unit: theme-manager (registry, applier transitions/instant paths), theme-catalog
  (parity + light-dark preview format), oyl-theme-toggle (trigger/panel state, radio
  semantics, live apply without closing, mode segmented control, Escape, multi-tab
  reflection).
- e2e (`apps/e2e-oyl/tests/theme.spec.ts`): persistence across reload incl. anti-FOUC,
  8 options rendered, live browsing keeps the panel open, Escape closes, mode persistence,
  all under the console/network hygiene fixture on desktop + mobile.
