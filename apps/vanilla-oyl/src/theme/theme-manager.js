/** @typedef {'classic' | 'forest' | 'sunrise' | 'ocean' | 'lavender' | 'ember' | 'ink' | 'paper'} Theme */
/** @typedef {'system' | 'light' | 'dark'} Mode */
/** @typedef {{ theme: Theme, mode: Mode }} ThemeSettings */

export const THEMES = /** @type {Theme[]} */ ([
  'classic',
  'forest',
  'sunrise',
  'ocean',
  'lavender',
  'ember',
  'ink',
  'paper',
])
export const MODES = /** @type {Mode[]} */ (['system', 'light', 'dark'])

export const DEFAULT_SETTINGS = /** @type {ThemeSettings} */ ({ theme: 'classic', mode: 'system' })

/** The CSS `color-scheme` value for a mode. @param {Mode} mode @returns {string} */
export function resolveColorScheme(mode) {
  return mode === 'system' ? 'light dark' : mode
}

/**
 * Apply a partial change to settings, validating against known values (unknown values
 * are ignored, keeping the current choice). Pure — no DOM, no storage.
 * @param {ThemeSettings} current
 * @param {Partial<ThemeSettings>} change
 * @returns {ThemeSettings}
 */
export function nextSettings(current, change) {
  const theme = change.theme && THEMES.includes(change.theme) ? change.theme : current.theme
  const mode = change.mode && MODES.includes(change.mode) ? change.mode : current.mode
  return { theme, mode }
}

/**
 * Apply settings to the document root (the DOM side; keep separate from the pure core).
 * @param {Document} doc
 * @param {ThemeSettings} settings
 */
export function applyTheme(doc, settings) {
  doc.documentElement.dataset.theme = settings.theme
  doc.documentElement.style.colorScheme = resolveColorScheme(settings.mode)
}

/**
 * An applyTheme wrapper that cross-fades theme changes via the View Transitions API.
 * The first call (boot paint) is always instant, as are all calls when the user
 * prefers reduced motion or the browser lacks the API.
 * @param {Document} doc
 * @param {{ prefersReducedMotion?: () => boolean }} [opts]
 * @returns {(settings: ThemeSettings) => void}
 */
export function createThemeApplier(doc, opts = {}) {
  const prefersReducedMotion =
    opts.prefersReducedMotion ??
    (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  // startViewTransition is not in every TS DOM lib yet; feature-detect through a local view.
  const viewDoc = /** @type {{ startViewTransition?: (cb: () => void) => unknown }} */ (
    /** @type {unknown} */ (doc)
  )
  let first = true
  return (settings) => {
    const instant = first || prefersReducedMotion() || typeof viewDoc.startViewTransition !== 'function'
    first = false
    if (instant) applyTheme(doc, settings)
    else /** @type {(cb: () => void) => unknown} */ (viewDoc.startViewTransition).call(doc, () => applyTheme(doc, settings))
  }
}
