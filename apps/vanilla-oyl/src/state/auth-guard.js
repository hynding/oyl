import { resolveTimezone } from './profile-store.js'

/** Force the login page only in Remote mode with no session (never while on an auth page). @param {'local'|'remote'} mode @param {object|null} session @param {string} route @returns {boolean} */
export function shouldRedirectToLogin(mode, session, route) {
  return mode === 'remote' && !session && route !== 'login' && route !== 'register'
}

/** After the first remote pull, whether the now-known profile tz differs from what screens were built with. @param {string} builtTz @param {import('@oyl/all-of-oyl').User|null} profile @param {string} browserTz @returns {boolean} */
export function tzNeedsReload(builtTz, profile, browserTz) {
  return resolveTimezone(profile, browserTz) !== builtTz
}
