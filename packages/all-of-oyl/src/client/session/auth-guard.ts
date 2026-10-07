import { resolveTimezone } from '../stores/profile.js'
import type { User } from '../../index.js'

/** Force the login page only in Remote mode with no session (never while on an auth page). */
export function shouldRedirectToLogin(mode: 'local' | 'remote', session: object | null, route: string): boolean {
  return mode === 'remote' && !session && route !== 'login' && route !== 'register'
}

/** After the first remote pull, whether the now-known profile tz differs from what screens were built with. */
export function tzNeedsReload(builtTz: string, profile: User | null, browserTz: string): boolean {
  return resolveTimezone(profile, browserTz) !== builtTz
}
