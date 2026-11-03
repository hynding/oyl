import type { NavItem } from '@oyl/ui-oyl'
import { NAV_ITEMS } from './nav-items.js'

/** Screens only admins see (the backend's GET /access decides who is one). */
export const ADMIN_ROUTES: ReadonlySet<string> = new Set(['status'])

/** Where non-admins land instead (the first screen of the nav). */
export const NON_ADMIN_HOME = '/journal'

/** The nav for this user: admin-only screens are left out for everyone else. */
export function visibleNavItems(admin: boolean): readonly NavItem[] {
  return admin ? NAV_ITEMS : NAV_ITEMS.filter((i) => !ADMIN_ROUTES.has(i.name))
}

/**
 * The path a signed-in non-admin is sent to when they reach an admin-only route (a deep link,
 * the `/` → `/status` default, the post-login landing), or null to stay. Signed-out users are
 * left to the login guard.
 */
export function adminRedirect(route: string, { signedIn, admin }: { signedIn: boolean, admin: boolean }): string | null {
  return signedIn && !admin && ADMIN_ROUTES.has(route) ? NON_ADMIN_HOME : null
}
