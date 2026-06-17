import type { Consumption } from './consumption.js'
import { NUTRIENT_METRICS, type Nutrients } from './food.js'

/** Sum per-serving nutrients × servings across consumptions; omits fields none carry. */
export function sumNutrients(consumptions: readonly Consumption[]): Nutrients {
  const out: Nutrients = {}
  for (const c of consumptions) {
    for (const [field] of NUTRIENT_METRICS) {
      const v = c.nutrients[field]
      if (v !== undefined) out[field] = (out[field] ?? 0) + v * c.servings
    }
  }
  return out
}
