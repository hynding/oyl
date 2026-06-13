/** The localStorage namespace for OYL. Nothing outside this prefix is ever touched. */
export const PREFIX = 'oyl/'
export const SCHEMA_VERSION_KEY = 'oyl/schema-version'
export const SETTINGS_KEY = 'oyl/settings'

/** Full storage key for a collection. @param {string} collection @returns {string} */
export function dataKey(collection) {
  return `oyl/data/${collection}`
}

/** Whether a localStorage key belongs to OYL. @param {string} key @returns {boolean} */
export function isOylKey(key) {
  return key.startsWith(PREFIX)
}
