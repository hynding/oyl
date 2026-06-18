import type { Consumption } from './consumption.js'
import { NUTRIENT_METRICS, type NutritionAmounts, type Nutrients } from './nutrients.js'

/** Sum per-serving nutrients × servings across consumptions; omits fields none carry.
 *  Merges `additional` entries by slug, scaling by servings. */
export function sumNutrients(consumptions: readonly Consumption[]): Nutrients {
  const amounts: NutritionAmounts = {}
  const additionalBySlug = new Map<string, number>()

  for (const c of consumptions) {
    for (const [field] of NUTRIENT_METRICS) {
      const v = c.nutrients[field]
      if (v !== undefined) amounts[field] = (amounts[field] ?? 0) + v * c.servings
    }
    if (c.nutrients.additional !== undefined) {
      for (const entry of c.nutrients.additional) {
        additionalBySlug.set(entry.slug, (additionalBySlug.get(entry.slug) ?? 0) + entry.amount * c.servings)
      }
    }
  }

  const out: Nutrients = { ...amounts }
  if (additionalBySlug.size > 0) {
    out.additional = Array.from(additionalBySlug.entries()).map(([slug, amount]) => ({ slug, amount }))
  }

  return out
}
