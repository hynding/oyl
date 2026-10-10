import { NAV_ITEMS } from './nav-items.js'

const SPECIAL: Record<string, string> = { profile: 'Profile', login: 'Sign in', register: 'Register' }

/** The document title for a route name: "<screen> · OYL" (nav labels + the auth/profile pages), "Not found · OYL" otherwise. */
export function titleFor(route: string): string {
  const label = NAV_ITEMS.find((i) => i.name === route)?.label ?? SPECIAL[route] ?? 'Not found'
  return `${label} · OYL`
}
