/** The localStorage namespace for OYL. Nothing outside this prefix is ever touched. */
export const PREFIX = 'oyl/'
export const SCHEMA_VERSION_KEY = 'oyl/schema-version'
export const SETTINGS_KEY = 'oyl/settings'
export const AUTH_KEY = 'oyl/auth'
export const API_BASE_URL_KEY = 'oyl/api-base-url'
export const STORAGE_MODE_KEY = 'oyl/storage-mode'

/** Full storage key for a collection. @param {string} collection @returns {string} */
export function dataKey(collection) {
  return `oyl/data/${collection}`
}

/** Whether a localStorage key belongs to OYL. @param {string} key @returns {boolean} */
export function isOylKey(key) {
  return key.startsWith(PREFIX)
}

export const CACHE_PREFIX = 'oyl/cache/'
/** Full localStorage key for a collection's offline cache. @param {string} collection @returns {string} */
export function cacheKey(collection) {
  return `${CACHE_PREFIX}${collection}`
}
/** Durable write-outbox key (online-first mutation queue). */
export const OUTBOX_KEY = 'oyl/write-outbox'
/** Single-key bounded read-cache prefix (online-first). */
export const READ_CACHE_KEY = 'oyl/read-cache'
export const PROFILE_ID_KEY = 'oyl/profile-id'
export const TZ_RELOADED_KEY = 'oyl/tz-reloaded'
