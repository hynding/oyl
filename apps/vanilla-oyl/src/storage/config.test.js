import { describe, it, expect, beforeEach } from 'vitest'
import {
  getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode,
  normalizeBaseUrl, DEFAULT_API_BASE_URL,
  defaultApiBaseUrl, defaultStorageMode,
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

  it('round-trips storage mode, persisting the explicit choice', () => {
    setStorageMode(storage, 'remote')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe('remote')
    expect(getStorageMode(storage)).toBe('remote')
    setStorageMode(storage, 'local')
    expect(storage.getItem(STORAGE_MODE_KEY)).toBe('local')
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

describe('host-derived defaults', () => {
  it('uses the localhost dev backend on local hosts (or when host is unknown)', () => {
    expect(defaultApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL)
    expect(defaultApiBaseUrl('localhost')).toBe(DEFAULT_API_BASE_URL)
    expect(defaultApiBaseUrl('127.0.0.1')).toBe(DEFAULT_API_BASE_URL)
    expect(defaultStorageMode(undefined)).toBe('local')
    expect(defaultStorageMode('localhost')).toBe('local')
  })

  it('derives the api.* origin from an app.* production host, mode remote', () => {
    expect(defaultApiBaseUrl('app.example.com')).toBe('https://api.example.com/api')
    expect(defaultApiBaseUrl('app.oyl.dev')).toBe('https://api.oyl.dev/api')
    expect(defaultStorageMode('app.example.com')).toBe('remote')
  })

  it('falls back to same-origin /api for non-app.* production hosts', () => {
    expect(defaultApiBaseUrl('example.com')).toBe('https://example.com/api')
    expect(defaultStorageMode('example.com')).toBe('remote')
  })

  it('getters honor stored overrides but fall back to the host default', () => {
    const storage = fakeStorage()
    expect(getApiBaseUrl(storage, 'app.example.com')).toBe('https://api.example.com/api')
    expect(getStorageMode(storage, 'app.example.com')).toBe('remote')
    setApiBaseUrl(storage, 'http://x/api')
    setStorageMode(storage, 'local')
    expect(getApiBaseUrl(storage, 'app.example.com')).toBe('http://x/api')
    expect(getStorageMode(storage, 'app.example.com')).toBe('local')
  })
})
