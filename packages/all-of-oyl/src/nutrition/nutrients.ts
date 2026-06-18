import { DomainError } from '../core/domain-error.js'
import { type NutrientUnit, mandatoryNutrients, nutrientDef } from './nutrient-registry.js'

export interface ServingSize {
  amount: number
  unit: NutrientUnit | string
  household?: string
}

/** The numeric amount fields of NutritionFacts, all optional, in canonical units. */
export interface NutritionAmounts {
  calories?: number
  totalFat?: number
  saturatedFat?: number
  transFat?: number
  cholesterol?: number
  sodium?: number
  totalCarbohydrate?: number
  dietaryFiber?: number
  totalSugars?: number
  addedSugars?: number
  protein?: number
  vitaminD?: number
  calcium?: number
  iron?: number
  potassium?: number
  waterMl?: number
}

/** Full FDA Nutrition Facts value object. All amount fields are optional and in canonical units. */
export interface NutritionFacts extends NutritionAmounts {
  servingSize?: ServingSize
  additional?: Array<{ slug: string; amount: number }>
}

/** Alias so existing consumers (Consumable, Consumption) continue to compile during the expansion. */
export type Nutrients = NutritionFacts

/** Maps registry mandatory nutrient slugs to NutritionAmounts camelCase field names. */
const SLUG_TO_FIELD: ReadonlyMap<string, keyof NutritionAmounts> = new Map([
  ['calories', 'calories'],
  ['total-fat', 'totalFat'],
  ['saturated-fat', 'saturatedFat'],
  ['trans-fat', 'transFat'],
  ['cholesterol', 'cholesterol'],
  ['sodium', 'sodium'],
  ['total-carbohydrate', 'totalCarbohydrate'],
  ['dietary-fiber', 'dietaryFiber'],
  ['total-sugars', 'totalSugars'],
  ['added-sugars', 'addedSugars'],
  ['protein', 'protein'],
  ['vitamin-d', 'vitaminD'],
  ['calcium', 'calcium'],
  ['iron', 'iron'],
  ['potassium', 'potassium'],
])

/**
 * Field → metric key mapping. Driven by registry mandatory nutrients + waterMl.
 * Keyed on NutritionAmounts so indexing always yields number | undefined.
 * MetricKey segments must be [a-z0-9_]+ so hyphens in slugs are replaced with underscores.
 */
export const NUTRIENT_METRICS: ReadonlyArray<readonly [keyof NutritionAmounts, string]> = [
  // Registry mandatory nutrients in label-panel order:
  ...mandatoryNutrients()
    .map((def): readonly [keyof NutritionAmounts, string] | null => {
      const field = SLUG_TO_FIELD.get(def.slug)
      if (field === undefined) return null
      const metricSuffix = def.slug.replace(/-/g, '_')
      return [field, `nutrition.${metricSuffix}`] as const
    })
    .filter((x): x is readonly [keyof NutritionAmounts, string] => x !== null),
  // waterMl handled separately (water is optional in registry):
  ['waterMl', 'nutrition.water_ml'],
]

export function assertNutritionFacts(f: NutritionFacts): NutritionFacts {
  // Validate mandatory amount fields (all numeric)
  for (const [field] of NUTRIENT_METRICS) {
    const v = f[field]
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
      throw new DomainError('INVALID_QUANTITY', `nutrient ${field} must be a non-negative finite number, got ${v}`)
    }
  }
  // Validate servingSize
  if (f.servingSize !== undefined) {
    if (!Number.isFinite(f.servingSize.amount) || f.servingSize.amount <= 0) {
      throw new DomainError('INVALID_QUANTITY', `servingSize.amount must be a positive finite number, got ${f.servingSize.amount}`)
    }
  }
  // Validate additional entries
  if (f.additional !== undefined) {
    for (const entry of f.additional) {
      if (nutrientDef(entry.slug) === undefined) {
        throw new DomainError('INVALID_SLUG', `additional nutrient slug "${entry.slug}" not found in registry`)
      }
      if (!Number.isFinite(entry.amount) || entry.amount < 0) {
        throw new DomainError('INVALID_QUANTITY', `additional nutrient "${entry.slug}" amount must be a non-negative finite number, got ${entry.amount}`)
      }
    }
  }
  return f
}

/** Backwards-compat alias. */
export const assertNutrients: (n: Nutrients) => Nutrients = assertNutritionFacts

export function nutritionFactsToJSON(f: NutritionFacts): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // Mandatory amount fields (all numeric):
  for (const [field] of NUTRIENT_METRICS) {
    const v = f[field]
    if (v !== undefined) out[field] = v
  }
  // Serving size:
  if (f.servingSize !== undefined) {
    const ss: Record<string, unknown> = { amount: f.servingSize.amount, unit: f.servingSize.unit }
    if (f.servingSize.household !== undefined) ss['household'] = f.servingSize.household
    out['servingSize'] = ss
  }
  // Additional:
  if (f.additional !== undefined && f.additional.length > 0) {
    out['additional'] = f.additional.map((e) => ({ slug: e.slug, amount: e.amount }))
  }
  return out
}

/** Backwards-compat alias. */
export const nutrientsToJSON: (n: Nutrients) => Record<string, unknown> = nutritionFactsToJSON

export function nutritionFactsFromJSON(shape: unknown): NutritionFacts {
  if (typeof shape !== 'object' || shape === null) {
    throw new DomainError('MALFORMED_JSON', 'not a NutritionFacts shape')
  }
  const s = shape as Record<string, unknown>
  const out: NutritionFacts = {}

  // Mandatory amount fields (all numeric):
  for (const [field] of NUTRIENT_METRICS) {
    const v = s[field]
    if (v === undefined) continue
    if (typeof v !== 'number') throw new DomainError('MALFORMED_JSON', `nutrient ${field} must be a number`)
    out[field] = v
  }

  // Serving size:
  if (s['servingSize'] !== undefined) {
    const ss = s['servingSize']
    if (typeof ss !== 'object' || ss === null) {
      throw new DomainError('MALFORMED_JSON', 'servingSize must be an object')
    }
    const ssObj = ss as Record<string, unknown>
    if (typeof ssObj['amount'] !== 'number' || typeof ssObj['unit'] !== 'string') {
      throw new DomainError('MALFORMED_JSON', 'servingSize must have numeric amount and string unit')
    }
    out.servingSize = {
      amount: ssObj['amount'],
      unit: ssObj['unit'],
      ...(typeof ssObj['household'] === 'string' ? { household: ssObj['household'] } : {}),
    }
  }

  // Additional:
  if (s['additional'] !== undefined) {
    if (!Array.isArray(s['additional'])) {
      throw new DomainError('MALFORMED_JSON', 'additional must be an array')
    }
    out.additional = (s['additional'] as unknown[]).map((item, i) => {
      if (typeof item !== 'object' || item === null) {
        throw new DomainError('MALFORMED_JSON', `additional[${i}] must be an object`)
      }
      const entry = item as Record<string, unknown>
      if (typeof entry['slug'] !== 'string' || typeof entry['amount'] !== 'number') {
        throw new DomainError('MALFORMED_JSON', `additional[${i}] must have string slug and numeric amount`)
      }
      return { slug: entry['slug'], amount: entry['amount'] }
    })
  }

  return assertNutritionFacts(out)
}

/** Backwards-compat alias. */
export const nutrientsFromJSON: (n: unknown) => Nutrients = nutritionFactsFromJSON
