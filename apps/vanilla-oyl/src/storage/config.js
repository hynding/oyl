import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

export const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'

/** Backend base URL (overridable via localStorage). @param {{ getItem(k: string): string | null }} storage @returns {string} */
export function getApiBaseUrl(storage) {
  return storage.getItem(API_BASE_URL_KEY) || DEFAULT_API_BASE_URL
}

/** 'local' | 'remote' (default local). @param {{ getItem(k: string): string | null }} storage @returns {'local'|'remote'} */
export function getStorageMode(storage) {
  return storage.getItem(STORAGE_MODE_KEY) === 'remote' ? 'remote' : 'local'
}

/** Trim whitespace + strip trailing slashes; '' stays ''. @param {string} url @returns {string} */
export function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '')
}

/** @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {'local'|'remote'} mode */
export function setStorageMode(storage, mode) {
  if (mode === 'remote') storage.setItem(STORAGE_MODE_KEY, 'remote')
  else storage.removeItem(STORAGE_MODE_KEY)
}

/** Empty (after normalize) clears the key → getApiBaseUrl returns the default. @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {string} url */
export function setApiBaseUrl(storage, url) {
  const v = normalizeBaseUrl(url)
  if (v) storage.setItem(API_BASE_URL_KEY, v)
  else storage.removeItem(API_BASE_URL_KEY)
}
