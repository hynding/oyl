import { describe, expect, it } from 'vitest'
import { ADMIN_ROUTES, adminRedirect, visibleNavItems } from './admin-routes.js'
import { NAV_ITEMS } from './nav-items.js'

describe('admin-only routes', () => {
  it('Status is the admin-only screen', () => {
    expect([...ADMIN_ROUTES]).toEqual(['status'])
  })

  it('non-admins get every nav item except Status; admins get all eight', () => {
    expect(visibleNavItems(false).map((i) => i.name)).toEqual(['journal', 'planner', 'nutrition', 'finance', 'goals', 'vault', 'insights'])
    expect(visibleNavItems(true)).toEqual(NAV_ITEMS)
  })

  it('a signed-in non-admin on an admin route is sent to /journal; admins, other routes and signed-out users are left alone', () => {
    expect(adminRedirect('status', { signedIn: true, admin: false })).toBe('/journal')
    expect(adminRedirect('status', { signedIn: true, admin: true })).toBeNull()
    expect(adminRedirect('journal', { signedIn: true, admin: false })).toBeNull()
    // Signed out, the login guard owns the redirect.
    expect(adminRedirect('status', { signedIn: false, admin: false })).toBeNull()
  })
})
