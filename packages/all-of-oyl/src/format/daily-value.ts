import { nutrientDef } from '../nutrition/nutrient-registry.js'

/** Percent Daily Value: rounded integer %; undefined when nutrient has no dailyValue. */
export function percentDailyValue(slug: string, amount: number): number | undefined {
  const def = nutrientDef(slug)
  // == null matches absent/null DV but not a real 0 g/mg value
  if (def?.dailyValue == null) return undefined
  return Math.round((amount / def.dailyValue) * 100)
}
