import type { StorageLike } from '../ports.js'
import { SETTINGS_KEY } from './keys.js'

type ReadableStorage = Pick<StorageLike, 'getItem'>

/**
 * The RAW persisted settings blob — never normalized, so unknown keys survive.
 * Writers MUST merge onto this (not onto an in-memory signal, which holds a
 * normalized value that already dropped keys it doesn't know).
 */
export function readRawSettings(storage: ReadableStorage): Record<string, unknown> {
  try {
    const raw = storage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
