import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'

/** Backend base URL (overridable via localStorage). @param {{ getItem(k: string): string | null }} storage @returns {string} */
export function getApiBaseUrl(storage) {
  return storage.getItem(API_BASE_URL_KEY) || DEFAULT_API_BASE_URL
}

/** 'local' | 'remote' (default local). @param {{ getItem(k: string): string | null }} storage @returns {'local'|'remote'} */
export function getStorageMode(storage) {
  return storage.getItem(STORAGE_MODE_KEY) === 'remote' ? 'remote' : 'local'
}
