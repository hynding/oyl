import { describe, it, expect, beforeEach } from 'vitest'
import {
  getApiBaseUrl, getStorageMode, setApiBaseUrl, setStorageMode,
  normalizeBaseUrl, DEFAULT_API_BASE_URL,
  defaultApiBaseUrl, defaultStorageMode,
} from './config.js'
import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'
import type { EnumerableStorage } from '../ports.js'

function fakeStorage(): EnumerableStorage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
  } as any
}

describe('config setters', () => {
  let storage: EnumerableStorage
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
  })

  it('defaults to remote mode on local hosts (the app is online-first, account-required)', () => {
    expect(defaultStorageMode(undefined)).toBe('remote')
    expect(defaultStorageMode('localhost')).toBe('remote')
    expect(defaultStorageMode('127.0.0.1')).toBe('remote')
    expect(defaultStorageMode('[::1]')).toBe('remote')
  })

  it('still honors an explicit local-mode choice on a local host', () => {
    const storage = fakeStorage()
    setStorageMode(storage, 'local')
    expect(getStorageMode(storage, 'localhost')).toBe('local')
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

  it('a deploy-injected meta base wins over every hostname rule', () => {
    expect(defaultApiBaseUrl('example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    expect(defaultApiBaseUrl('app.example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    expect(defaultApiBaseUrl('localhost', 'https://api.example.test/api')).toBe('https://api.example.test/api')
  })

  it('normalizes the meta base (trailing slash, whitespace)', () => {
    expect(defaultApiBaseUrl('example.com', ' https://api.example.test/api/ ')).toBe('https://api.example.test/api')
  })

  it('an empty or whitespace-only meta base falls through to the hostname rules', () => {
    expect(defaultApiBaseUrl('example.com', '')).toBe('https://example.com/api')
    expect(defaultApiBaseUrl('example.com', '   ')).toBe('https://example.com/api')
    expect(defaultApiBaseUrl('localhost', undefined)).toBe(DEFAULT_API_BASE_URL)
  })

  it('a stored override still beats the meta base', () => {
    const storage = fakeStorage()
    expect(getApiBaseUrl(storage, 'example.com', 'https://api.example.test/api')).toBe('https://api.example.test/api')
    setApiBaseUrl(storage, 'http://x/api')
    expect(getApiBaseUrl(storage, 'example.com', 'https://api.example.test/api')).toBe('http://x/api')
  })
})
