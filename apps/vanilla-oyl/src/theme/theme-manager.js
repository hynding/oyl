/** @typedef {'classic' | 'forest'} Theme */
/** @typedef {'system' | 'light' | 'dark'} Mode */
/** @typedef {{ theme: Theme, mode: Mode }} ThemeSettings */

export const THEMES = /** @type {Theme[]} */ (['classic', 'forest'])
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
