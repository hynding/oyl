import { sumNutrients, type Consumption, type Nutrients, type NutritionAmounts } from '@oyl/all-of-oyl'
import { formatNutrients, formatClockTime } from '@oyl/all-of-oyl/format'

export type NutrientKey = keyof NutritionAmounts

/** The five nutrients the screens capture and total (key, form label). */
export const NUTRIENT_FIELDS: ReadonlyArray<readonly [NutrientKey, string]> = [
  ['calories', 'Calories'],
  ['protein', 'Protein (g)'],
  ['totalCarbohydrate', 'Carbs (g)'],
  ['totalFat', 'Fat (g)'],
  ['waterMl', 'Water (ml)'],
]

/** The totals tiles (key, unit caption). */
export const TILES: ReadonlyArray<readonly [NutrientKey, string]> = [
  ['calories', 'kcal'],
  ['protein', 'g protein'],
  ['totalCarbohydrate', 'g carbs'],
  ['totalFat', 'g fat'],
  ['waterMl', 'ml water'],
]

/** A tile's number: rounded, or an em dash when the day has none of it. */
export function tileValue(n: Nutrients, key: NutrientKey): string {
  const v = n[key]
  return typeof v === 'number' ? String(Math.round(v)) : '—'
}

/**
 * Row meta for a logged consumption: per-serving nutrients, a scaled calorie total when
 * servings > 1 (omitted without calories), then the clock time — vanilla's rule.
 */
export function consumptionMeta(c: Consumption): string {
  const perServing = formatNutrients(c.nutrients)
  const scaledCalories = sumNutrients([c]).calories
  const total = c.servings > 1 && scaledCalories !== undefined ? `${Math.round(scaledCalories)} kcal total` : ''
  return [perServing, total, formatClockTime(c.occurredAt)].filter((s) => s !== '').join(' · ')
}

/** Catalog name → note → "Meal", with "×N" when servings ≠ 1. */
export function mealLabel(c: Consumption, namesById: ReadonlyMap<string, string>): string {
  const base = (c.consumableId !== undefined ? namesById.get(c.consumableId) : undefined) ?? c.note ?? 'Meal'
  return c.servings === 1 ? base : `${base} ×${c.servings}`
}
