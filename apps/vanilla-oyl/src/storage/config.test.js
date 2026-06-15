import { describe, it, expect, beforeEach } from 'vitest'
import {
  getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode,
  normalizeBaseUrl, DEFAULT_API_BASE_URL,
} from './config.js'
import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

/** @returns {Storage} */
function fakeStorage() {
  /** @type {Map<string, string>} */
  const m = new Map()
  return /** @type {any} */ ({
    getItem: (/** @type {string} */ k) => (m.has(k) ? /** @type {string} */ (m.get(k)) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, String(v)) },
    removeItem: (/** @type {string} */ k) => { m.delete(k) },
  })
}

describe('config setters', () => {
  /** @type {Storage} */
  let storage
  beforeEach(() => { storage = fakeStorage() })

  it('round-trips storage mode and clears on local', () => {
    setStorageMode(storage, 'remote')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe('remote')
    expect(getStorageMode(storage)).toBe('remote')
    setStorageMode(storage, 'local')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe(null)
    expect(getStorageMode(storage)).toBe('local')
  })

  it('stores a normalized url and clears on empty', () => {
    setApiBaseUrl(storage, 'http://x/api/')
    expect(storage.getItem(API_BASE_URL_KEY)).toBe('http://x/api')
    expect(getApiBaseUrl(storage)).toBe('http://x/api')
    setApiBaseUrl(storage, '   ')
    expect(storage.getItem(API_BASE_URL_KEY)).toBe(null)
    expect(getApiBaseUrl(storage)).toBe(DEFAULT_API_BASE_URL)
  })

  it('normalizeBaseUrl trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://x/api//  ')).toBe('http://x/api')
    expect(normalizeBaseUrl('')).toBe('')
  })
})
