/**
 * Shared coercion helpers used by multiple Strapi util modules.
 */

/**
 * Coerce a value that might be a numeric string (Postgres returns some column types as strings)
 * to a JS number. Leaves genuine numbers as-is (including 0). Non-numeric strings pass through.
 */
export function coerceNumeric(v: unknown): unknown {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return v
}
