import { nutrientDef } from '../nutrition/nutrient-registry.js'

/** Percent Daily Value: rounded integer %; undefined when nutrient has no dailyValue. */
export function percentDailyValue(slug: string, amount: number): number | undefined {
  const def = nutrientDef(slug)
  if (!def?.dailyValue) return undefined
  return Math.round((amount / def.dailyValue) * 100)
}
