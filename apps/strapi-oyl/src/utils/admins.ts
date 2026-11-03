/**
 * Who is an admin: the backend's `OYL_ADMIN_EMAILS` allowlist (comma/space separated).
 * An entry is an exact address, or `@domain` for every address on exactly that domain.
 * Unset means nobody. camis-php-oyl's overlay
 * (`app/Support/OylAdmins.php`) mirrors it — change both together.
 */
export function parseAdminList(raw: string | null | undefined): string[] {
  return (raw ?? '').split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter((s) => s !== '')
}

export function isAdminEmail(email: string | null | undefined, raw: string | null | undefined): boolean {
  const address = (email ?? '').trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return false
  const domain = address.slice(at)
  return parseAdminList(raw).some((entry) => entry === address || (entry.startsWith('@') && entry.length > 1 && entry === domain))
}
