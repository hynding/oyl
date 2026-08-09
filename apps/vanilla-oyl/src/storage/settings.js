import { SETTINGS_KEY } from './keys.js'

/** @typedef {{ getItem(k: string): string | null }} ReadableStorage */

/**
 * The RAW persisted settings blob — never normalized, so unknown keys survive.
 * Writers MUST merge onto this (not onto an in-memory signal, which holds a
 * normalized value that already dropped keys it doesn't know).
 * @param {ReadableStorage} storage
 * @returns {Record<string, unknown>}
 */
export function readRawSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {}
  } catch {
    return {}
  }
}
