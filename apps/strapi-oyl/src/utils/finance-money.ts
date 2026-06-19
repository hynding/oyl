/**
 * Shared helpers for the `finance.money` Strapi component.
 * Used by transaction and budget controllers.
 *
 * NOTE: `biginteger` columns are returned by Strapi/Postgres as strings —
 * `sanitizeMoney` coerces `minor` to a JS number via `coerceNumeric`.
 */

import { coerceNumeric } from './coerce.js'

/** Shallow populate spec for a component field named `amount`. */
export const AMOUNT_POPULATE = { amount: true } as const

/** Shallow populate spec for a component field named `limit`. */
export const LIMIT_POPULATE = { limit: true } as const

/**
 * Coerce the `minor` field of a `finance.money` component from string to number.
 * Strapi returns `biginteger` columns as strings; domain decoders require a JS number.
 *
 * - If `row[field]` is a non-null object, returns a new row with the money component
 *   shallow-copied and `minor` coerced via `coerceNumeric`.
 * - If `row[field]` is null or absent, returns `row` unchanged (same reference).
 *
 * @param row   - the Strapi row object
 * @param field - which field holds the money component (e.g. 'amount', 'limit')
 */
export function sanitizeMoney(row: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = row[field]
  if (value == null || typeof value !== 'object') return row
  const money = value as Record<string, unknown>
  return { ...row, [field]: { ...money, minor: coerceNumeric(money['minor']) } }
}

/**
 * Sanitize a transaction row:
 * 1. Strips top-level null scalars so domain decoders receive `undefined` for absent
 *    optional fields (e.g. `note: null` → omitted). `parseEntryBase` throws on
 *    `note === null` because `typeof null !== 'string'`.
 * 2. Sanitizes the `amount` component via `sanitizeMoney` (coerces `minor` biginteger
 *    string → number).
 *
 * The `amount` component itself is never null-stripped (it's kept as-is if absent/null
 * so that `sanitizeMoney` can handle it).
 */
export function sanitizeTransactionRow(row: Record<string, unknown>): Record<string, unknown> {
  const withoutTopLevelNulls: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null && k !== 'amount') continue
    withoutTopLevelNulls[k] = v
  }
  return sanitizeMoney(withoutTopLevelNulls, 'amount')
}
