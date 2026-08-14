import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

/** Dev fallback used when the app is served from a local host. */
export const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'

/** @param {string} [hostname] @returns {boolean} */
function isLocalHost(hostname) {
  return hostname == null || hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Default API base URL for the app's own hostname. On a local host (or when unknown) this is
 * the dev backend. In production the app is served from `app.<domain>` and the API from
 * `api.<domain>` (see log/PI_SERVER_SETUP.md), so swap a leading `app.` label for `api.` on the
 * same https origin; any other production host falls back to same-origin `/api`. Always
 * overridable via Status → Connection.
 * @param {string} [hostname] @returns {string}
 */
export function defaultApiBaseUrl(hostname) {
  if (isLocalHost(hostname)) return DEFAULT_API_BASE_URL
  const host = /** @type {string} */ (hostname)
  const apiHost = host.startsWith('app.') ? 'api.' + host.slice(4) : host
  return `https://${apiHost}/api`
}

/**
 * Default storage mode — 'remote' on every host, including local ones. The app is online-first
 * and account-required, so a local host should talk to the dev backend at DEFAULT_API_BASE_URL
 * rather than sit in the dormant local-only path. 'local' remains selectable via
 * Status → Connection (it is the basis for the deferred private mode) and an explicit stored
 * choice still wins — see getStorageMode.
 * @param {string} [_hostname] @returns {'local'|'remote'}
 */
export function defaultStorageMode(_hostname) {
  return 'remote'
}

/** Backend base URL: stored override, else host-derived default. @param {{ getItem(k: string): string | null }} storage @param {string} [hostname] @returns {string} */
export function getApiBaseUrl(storage, hostname) {
  return storage.getItem(API_BASE_URL_KEY) || defaultApiBaseUrl(hostname)
}

/** Storage mode: explicit stored choice, else host-derived default. @param {{ getItem(k: string): string | null }} storage @param {string} [hostname] @returns {'local'|'remote'} */
export function getStorageMode(storage, hostname) {
  const stored = storage.getItem(STORAGE_MODE_KEY)
  if (stored === 'remote' || stored === 'local') return stored
  return defaultStorageMode(hostname)
}

/** Trim whitespace + strip trailing slashes; '' stays ''. @param {string} url @returns {string} */
export function normalizeBaseUrl(url) {
  return url.trim().replace(/\/+$/, '')
}

/** Persists the explicit choice so it survives the host-derived default. @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {'local'|'remote'} mode */
export function setStorageMode(storage, mode) {
  storage.setItem(STORAGE_MODE_KEY, mode === 'remote' ? 'remote' : 'local')
}

/** Empty (after normalize) clears the key → getApiBaseUrl returns the host default. @param {{ setItem(k: string, v: string): void, removeItem(k: string): void }} storage @param {string} url */
export function setApiBaseUrl(storage, url) {
  const v = normalizeBaseUrl(url)
  if (v) storage.setItem(API_BASE_URL_KEY, v)
  else storage.removeItem(API_BASE_URL_KEY)
}
