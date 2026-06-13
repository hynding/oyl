import { signal } from '../lib/reactive/signal.js'
import { SETTINGS_KEY } from '../storage/keys.js'
import { DEFAULT_SETTINGS, nextSettings } from '../theme/theme-manager.js'

/** @typedef {import('../theme/theme-manager.js').ThemeSettings} ThemeSettings */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void }} AppStorage */

/**
 * Read persisted theme settings, falling back to defaults for missing/corrupt data.
 * @param {AppStorage} storage
 * @returns {ThemeSettings}
 */
function readSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return nextSettings(DEFAULT_SETTINGS, JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * Theme state: a settings signal plus an update() that validates, persists, and emits.
 * @param {AppStorage} storage
 */
export function createThemeState(storage) {
  const settings = signal(readSettings(storage), (a, b) => a.theme === b.theme && a.mode === b.mode)
  return {
    settings,
    /** @param {Partial<ThemeSettings>} change */
    update(change) {
      const next = nextSettings(settings.get(), change)
      settings.set(next)
      storage.setItem(SETTINGS_KEY, JSON.stringify(next))
    },
    /** Re-read from storage (multi-tab sync). */
    refresh() {
      settings.set(readSettings(storage))
    },
  }
}
