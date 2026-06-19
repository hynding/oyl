/**
 * Shared helpers for the `nutrition.nutrition-facts` Strapi component.
 * Used by consumable, consumable-product, and consumption controllers.
 */

/** Populate spec for strapi.documents() calls so facts (+ nested servingSize/additional) are returned. */
export const FACTS_POPULATE = { facts: { populate: { servingSize: true, additional: true } } } as const

/**
 * Coerce a value that might be a numeric string (Postgres returns decimal columns as strings)
 * to a JS number. Leaves genuine numbers as-is (including 0). Non-numeric strings pass through.
 */
function coerceNumeric(v: unknown): unknown {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return v
}

/**
 * Strip null values from a facts component object so domain decoders
 * (nutritionFactsFromJSON) receive `undefined` for absent fields rather than `null`.
 * Strapi stores unset decimal component columns as NULL and returns them.
 *
 * Also coerces numeric-decimal values from string to number: Strapi's SQLite returns
 * `decimal` columns as JS numbers, but Postgres (compose/production) can return them
 * as strings. The domain `nutritionFactsFromJSON` requires `typeof v === 'number'`
 * and would throw `MALFORMED_JSON` on a string.
 *
 * Coercion applies to amount fields only (not unit/slug strings):
 *   - top-level amount fields (calories, totalFat, … waterMl)
 *   - servingSize.amount
 *   - each additional[].amount
 */
export function sanitizeFacts(row: Record<string, unknown>): Record<string, unknown> {
  if (row['facts'] == null) return row
  const rawFacts = row['facts'] as Record<string, unknown>
  const cleanFacts: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rawFacts)) {
    if (v === null) continue
    if (k === 'servingSize' && typeof v === 'object') {
      // servingSize component: strip nulls and coerce amount from nested object
      const ss = v as Record<string, unknown>
      const cleanSs: Record<string, unknown> = {}
      for (const [sk, sv] of Object.entries(ss)) {
        if (sv === null) continue
        // Only coerce the numeric amount field; unit/household are genuine strings
        cleanSs[sk] = sk === 'amount' ? coerceNumeric(sv) : sv
      }
      cleanFacts[k] = cleanSs
    } else if (k === 'additional' && Array.isArray(v)) {
      // additional: strip nulls and coerce amount from each item; slug is a genuine string
      cleanFacts[k] = (v as Array<Record<string, unknown>>).map((item) => {
        const clean: Record<string, unknown> = {}
        for (const [ik, iv] of Object.entries(item)) {
          if (iv === null) continue
          clean[ik] = ik === 'amount' ? coerceNumeric(iv) : iv
        }
        return clean
      })
    } else {
      // Top-level amount fields (calories, totalFat, protein, etc.) — coerce numeric strings
      cleanFacts[k] = coerceNumeric(v)
    }
  }
  return { ...row, facts: cleanFacts }
}

/**
 * Like `sanitizeFacts`, but for `consumable-product` rows: also coerces the top-level
 * `servingsPerContainer` decimal (Postgres can return it as a string, and
 * `ConsumableProduct.fromJSON` would drop a non-number). Leaves null/undefined as-is
 * (the domain codec treats them as absent).
 */
export function sanitizeProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const r = sanitizeFacts(row)
  const spc = r['servingsPerContainer']
  if (spc === undefined || spc === null) return r
  return { ...r, servingsPerContainer: coerceNumeric(spc) }
}
