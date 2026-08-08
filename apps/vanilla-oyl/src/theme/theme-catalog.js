/** @typedef {import('./theme-manager.js').Theme} Theme */

/**
 * Display metadata for the theme picker.
 *
 * `preview` colors are verbatim copies of the theme's `--color-bg` / `--color-surface` /
 * `--color-accent` tokens (see styles/themes/<name>.css). They exist because document-level
 * theme stylesheets cannot reach into shadow roots, so swatches paint from these strings;
 * being `light-dark()` pairs they still track the resolved color-scheme live. Keep them in
 * sync when editing a theme file.
 *
 * @typedef {{ label: string, tagline: string, preview: { bg: string, surface: string, accent: string } }} ThemeInfo
 */

export const THEME_CATALOG = /** @type {Record<Theme, ThemeInfo>} */ ({
  classic: {
    label: 'Classic',
    tagline: 'Neutral and steady',
    preview: {
      bg: 'light-dark(oklch(98% 0.004 90), oklch(18% 0.006 265))',
      surface: 'light-dark(oklch(100% 0 0), oklch(23% 0.008 265))',
      accent: 'light-dark(oklch(55% 0.16 255), oklch(72% 0.14 255))',
    },
  },
  forest: {
    label: 'Forest',
    tagline: 'Green and grounded',
    preview: {
      bg: 'light-dark(oklch(97% 0.02 145), oklch(17% 0.02 150))',
      surface: 'light-dark(oklch(99% 0.01 145), oklch(22% 0.025 150))',
      accent: 'light-dark(oklch(52% 0.13 150), oklch(70% 0.13 150))',
    },
  },
  sunrise: {
    label: 'Sunrise',
    tagline: 'Warm coral, soft corners',
    preview: {
      bg: 'light-dark(oklch(97.5% 0.014 80), oklch(18% 0.014 55))',
      surface: 'light-dark(oklch(99.5% 0.008 80), oklch(23% 0.016 55))',
      accent: 'light-dark(oklch(57% 0.16 40), oklch(70% 0.14 45))',
    },
  },
  ocean: {
    label: 'Ocean',
    tagline: 'Cool teal calm',
    preview: {
      bg: 'light-dark(oklch(97.5% 0.008 230), oklch(17% 0.015 235))',
      surface: 'light-dark(oklch(99.5% 0.004 230), oklch(22% 0.018 235))',
      accent: 'light-dark(oklch(51% 0.11 210), oklch(71% 0.11 205))',
    },
  },
  lavender: {
    label: 'Lavender',
    tagline: 'Quiet violet dusk',
    preview: {
      bg: 'light-dark(oklch(97.5% 0.01 300), oklch(18% 0.018 300))',
      surface: 'light-dark(oklch(99.5% 0.005 300), oklch(23% 0.02 300))',
      accent: 'light-dark(oklch(53% 0.15 300), oklch(73% 0.12 300))',
    },
  },
  ember: {
    label: 'Ember',
    tagline: 'Charcoal with a glow',
    preview: {
      bg: 'light-dark(oklch(97% 0.006 60), oklch(16% 0.008 45))',
      surface: 'light-dark(oklch(99% 0.004 60), oklch(21% 0.01 45))',
      accent: 'light-dark(oklch(55% 0.16 55), oklch(71% 0.15 55))',
    },
  },
  ink: {
    label: 'Ink',
    tagline: 'Monochrome, hard edges',
    preview: {
      bg: 'light-dark(oklch(98.5% 0 0), oklch(16% 0 0))',
      surface: 'light-dark(oklch(99.5% 0 0), oklch(21% 0 0))',
      accent: 'light-dark(oklch(25% 0 0), oklch(92% 0 0))',
    },
  },
  paper: {
    label: 'Paper',
    tagline: 'Serif, print warmth',
    preview: {
      bg: 'light-dark(oklch(96.5% 0.012 85), oklch(19% 0.01 75))',
      surface: 'light-dark(oklch(98.5% 0.008 85), oklch(23.5% 0.012 75))',
      accent: 'light-dark(oklch(50% 0.14 30), oklch(70% 0.12 35))',
    },
  },
})
