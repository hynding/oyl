import type { EnumerableStorage, StorageLike } from '../ports.js'
import { API_BASE_URL_KEY, STORAGE_MODE_KEY } from './keys.js'

/** Dev fallback used when the app is served from a local host. */
export const DEFAULT_API_BASE_URL = 'http://localhost:1340/api'

function isLocalHost(hostname?: string): boolean {
  return hostname == null || hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Default API base URL. Precedence: a deploy-injected `metaBase` (the `content` of
 * `<meta name="oyl-api-base">` in index.html, filled by scripts/dreamhost/publish-www.sh) wins
 * when non-empty; otherwise the app's own hostname decides: a local host uses the dev backend,
 * an `app.<domain>` host swaps the label for `api.` on the same https origin, and any other host
 * falls back to same-origin `/api`. Always overridable via Status → Connection.
 */
export function defaultApiBaseUrl(hostname?: string, metaBase?: string): string {
  const meta = normalizeBaseUrl(metaBase ?? '')
  if (meta) return meta
  if (isLocalHost(hostname)) return DEFAULT_API_BASE_URL
  const host = hostname as string
  const apiHost = host.startsWith('app.') ? 'api.' + host.slice(4) : host
  return `https://${apiHost}/api`
}

/**
 * Default storage mode — 'remote' on every host, including local ones. The app is online-first
 * and account-required, so a local host should talk to the dev backend at DEFAULT_API_BASE_URL
 * rather than sit in the dormant local-only path. 'local' remains selectable via
 * Status → Connection (it is the basis for the deferred private mode) and an explicit stored
 * choice still wins — see getStorageMode.
 */
export function defaultStorageMode(_hostname?: string): 'local' | 'remote' {
  return 'remote'
}

/** Backend base URL: stored override, else the host/meta default. */
export function getApiBaseUrl(storage: Pick<StorageLike, 'getItem'>, hostname?: string, metaBase?: string): string {
  return storage.getItem(API_BASE_URL_KEY) || defaultApiBaseUrl(hostname, metaBase)
}

/** Storage mode: explicit stored choice, else host-derived default. */
export function getStorageMode(storage: Pick<StorageLike, 'getItem'>, hostname?: string): 'local' | 'remote' {
  const stored = storage.getItem(STORAGE_MODE_KEY)
  if (stored === 'remote' || stored === 'local') return stored
  return defaultStorageMode(hostname)
}

/** Trim whitespace + strip trailing slashes; '' stays ''. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Persists the explicit choice so it survives the host-derived default. */
export function setStorageMode(storage: Pick<EnumerableStorage, 'setItem' | 'removeItem'>, mode: 'local' | 'remote'): void {
  storage.setItem(STORAGE_MODE_KEY, mode === 'remote' ? 'remote' : 'local')
}

/** Empty (after normalize) clears the key → getApiBaseUrl returns the host default. */
export function setApiBaseUrl(storage: Pick<EnumerableStorage, 'setItem' | 'removeItem'>, url: string): void {
  const v = normalizeBaseUrl(url)
  if (v) storage.setItem(API_BASE_URL_KEY, v)
  else storage.removeItem(API_BASE_URL_KEY)
}
