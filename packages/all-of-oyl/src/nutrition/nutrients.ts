import { DomainError } from '../core/domain-error.js'

/** Per-serving nutrient values. Only present fields are emitted as metrics. */
export type Nutrients = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  waterMl?: number
}

/** Field → metric key. The one place the mapping lives. */
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof Nutrients, string]> = [
  ['calories', 'nutrition.calories'],
  ['protein', 'nutrition.protein'],
  ['carbs', 'nutrition.carbs'],
  ['fat', 'nutrition.fat'],
  ['waterMl', 'nutrition.water_ml'],
]

export function assertNutrients(n: Nutrients): Nutrients {
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      throw new DomainError('INVALID_QUANTITY', `nutrient ${field} must be a non-negative finite number, got ${v}`)
    }
  }
  return n
}

export function nutrientsToJSON(n: Nutrients): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = n[field]
    if (v !== undefined) out[field] = v
  }
  return out
}

export function nutrientsFromJSON(shape: unknown): Nutrients {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not a Nutrients shape')
  }
  const s = shape as Record<string, unknown>
  const out: Nutrients = {}
  for (const [field] of NUTRIENT_METRICS) {
    const v = s[field]
    if (v === undefined) continue
    if (typeof v !== 'number') throw new DomainError('MALFORMED_JSON', `nutrient ${field} must be a number`)
    out[field] = v
  }
  return assertNutrients(out)
}
