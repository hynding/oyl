import { signal, SETTINGS_KEY, readRawSettings } from '@oyl/all-of-oyl/client'

/**
 * Theme state: a TS port of vanilla's theme/theme-manager.js + theme/theme-catalog.js +
 * state/theme.js. Same `oyl/settings` blob and theme set, so a user switching apps keeps
 * their theme. The CSS lives in @oyl/ui-oyl/themes/<name>.css.
 */

export type Theme = 'classic' | 'forest' | 'sunrise' | 'ocean' | 'lavender' | 'ember' | 'ink' | 'paper'
export type Mode = 'system' | 'light' | 'dark'
export interface ThemeSettings { theme: Theme; mode: Mode }

export const THEMES: readonly Theme[] = ['classic', 'forest', 'sunrise', 'ocean', 'lavender', 'ember', 'ink', 'paper']
export const MODES: readonly Mode[] = ['system', 'light', 'dark']
export const DEFAULT_SETTINGS: ThemeSettings = { theme: 'classic', mode: 'system' }
export const MODE_LABELS: Record<Mode, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** The CSS `color-scheme` value for a mode. */
export function resolveColorScheme(mode: Mode): string {
  return mode === 'system' ? 'light dark' : mode
}

/** Apply a partial change, ignoring unknown values (keeps the current choice). Pure. */
export function nextSettings(current: ThemeSettings, change: Partial<ThemeSettings>): ThemeSettings {
  const theme = change.theme && THEMES.includes(change.theme) ? change.theme : current.theme
  const mode = change.mode && MODES.includes(change.mode) ? change.mode : current.mode
  return { theme, mode }
}

/** The DOM side of a theme: `html[data-theme]` + `color-scheme`. */
export interface ThemeDocument {
  documentElement: { dataset: { theme?: string }; style: { colorScheme: string } }
  defaultView?: { matchMedia?: (q: string) => { matches: boolean } } | null
  startViewTransition?: (cb: () => void) => unknown
}

export function applyTheme(doc: ThemeDocument, settings: ThemeSettings): void {
  doc.documentElement.dataset.theme = settings.theme
  doc.documentElement.style.colorScheme = resolveColorScheme(settings.mode)
}

/**
 * An applyTheme wrapper that cross-fades theme changes via the View Transitions API.
 * The first call (boot paint) is always instant, as are all calls under reduced motion
 * or without the API.
 */
export function createThemeApplier(
  doc: ThemeDocument,
  opts: { prefersReducedMotion?: () => boolean } = {},
): (settings: ThemeSettings) => void {
  const prefersReducedMotion =
    opts.prefersReducedMotion ?? (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  let first = true
  return (settings) => {
    const instant = first || prefersReducedMotion() || typeof doc.startViewTransition !== 'function'
    first = false
    if (instant) applyTheme(doc, settings)
    else doc.startViewTransition!(() => applyTheme(doc, settings))
  }
}

/** Display metadata for the picker; preview colors are copies of each theme's bg/surface/accent. */
export interface ThemeInfo { label: string; tagline: string; preview: { bg: string; surface: string; accent: string } }

export const THEME_CATALOG: Record<Theme, ThemeInfo> = {
  classic: { label: 'Classic', tagline: 'Neutral and steady', preview: { bg: 'light-dark(oklch(98% 0.004 90), oklch(18% 0.006 265))', surface: 'light-dark(oklch(100% 0 0), oklch(23% 0.008 265))', accent: 'light-dark(oklch(55% 0.16 255), oklch(72% 0.14 255))' } },
  forest: { label: 'Forest', tagline: 'Green and grounded', preview: { bg: 'light-dark(oklch(97% 0.02 145), oklch(17% 0.02 150))', surface: 'light-dark(oklch(99% 0.01 145), oklch(22% 0.025 150))', accent: 'light-dark(oklch(52% 0.13 150), oklch(70% 0.13 150))' } },
  sunrise: { label: 'Sunrise', tagline: 'Warm coral, soft corners', preview: { bg: 'light-dark(oklch(97.5% 0.014 80), oklch(18% 0.014 55))', surface: 'light-dark(oklch(99.5% 0.008 80), oklch(23% 0.016 55))', accent: 'light-dark(oklch(57% 0.16 40), oklch(70% 0.14 45))' } },
  ocean: { label: 'Ocean', tagline: 'Cool teal calm', preview: { bg: 'light-dark(oklch(97.5% 0.008 230), oklch(17% 0.015 235))', surface: 'light-dark(oklch(99.5% 0.004 230), oklch(22% 0.018 235))', accent: 'light-dark(oklch(51% 0.11 210), oklch(71% 0.11 205))' } },
  lavender: { label: 'Lavender', tagline: 'Quiet violet dusk', preview: { bg: 'light-dark(oklch(97.5% 0.01 300), oklch(18% 0.018 300))', surface: 'light-dark(oklch(99.5% 0.005 300), oklch(23% 0.02 300))', accent: 'light-dark(oklch(53% 0.15 300), oklch(73% 0.12 300))' } },
  ember: { label: 'Ember', tagline: 'Charcoal with a glow', preview: { bg: 'light-dark(oklch(97% 0.006 60), oklch(16% 0.008 45))', surface: 'light-dark(oklch(99% 0.004 60), oklch(21% 0.01 45))', accent: 'light-dark(oklch(55% 0.16 55), oklch(71% 0.15 55))' } },
  ink: { label: 'Ink', tagline: 'Monochrome, hard edges', preview: { bg: 'light-dark(oklch(98.5% 0 0), oklch(16% 0 0))', surface: 'light-dark(oklch(99.5% 0 0), oklch(21% 0 0))', accent: 'light-dark(oklch(25% 0 0), oklch(92% 0 0))' } },
  paper: { label: 'Paper', tagline: 'Serif, print warmth', preview: { bg: 'light-dark(oklch(96.5% 0.012 85), oklch(19% 0.01 75))', surface: 'light-dark(oklch(98.5% 0.008 85), oklch(23.5% 0.012 75))', accent: 'light-dark(oklch(50% 0.14 30), oklch(70% 0.12 35))' } },
}

type SettingsStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }

function readSettings(storage: SettingsStorage): ThemeSettings {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return nextSettings(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

/** Theme state: a settings signal plus update() that validates, persists, and emits. */
export function createThemeState(storage: SettingsStorage) {
  const settings = signal(readSettings(storage), (a, b) => a.theme === b.theme && a.mode === b.mode)
  return {
    settings,
    update(change: Partial<ThemeSettings>) {
      const next = nextSettings(settings.get(), change)
      settings.set(next)
      // Merge from RAW storage so keys other writers own (e.g. layout) survive.
      storage.setItem(SETTINGS_KEY, JSON.stringify({ ...readRawSettings(storage), ...next }))
    },
    /** Re-read from storage (multi-tab sync). */
    refresh() {
      settings.set(readSettings(storage))
    },
  }
}

export type ThemeState = ReturnType<typeof createThemeState>
