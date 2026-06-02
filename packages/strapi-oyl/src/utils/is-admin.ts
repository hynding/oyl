// Considered an admin if the authenticated user's role type OR name matches
// any of the configured admin role identifiers. Falls back to a sensible default
// so callers don't have to think about it.

const DEFAULT_ADMIN_ROLES = ['admin', 'Administrator']

type MaybeUser =
  | {
      role?: { type?: string; name?: string } | null
    }
  | null
  | undefined

export function isAdmin(user: MaybeUser, adminRoles: string[] = DEFAULT_ADMIN_ROLES): boolean {
  const role = user?.role
  if (!role) return false
  if (role.type && adminRoles.includes(role.type)) return true
  if (role.name && adminRoles.includes(role.name)) return true
  return false
}
