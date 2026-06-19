/** Drop keys whose value is strictly null (preserves 0/''/false). Strapi returns null for unset optional columns, which the domain codecs (parseEntryBase / Goal.fromJSON) reject. */
export function stripNulls(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (v !== null) out[k] = v
  return out
}
