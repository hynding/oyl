export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'mcg' | 'ml'

export interface NutrientDef {
  slug: string
  label: string
  canonicalUnit: NutrientUnit
  dailyValue?: number
  mandatory: boolean
}

export const NUTRIENTS: readonly NutrientDef[] = [
  // FDA mandatory — label-panel order
  { slug: 'calories', label: 'Calories', canonicalUnit: 'kcal', mandatory: true },
  { slug: 'total-fat', label: 'Total Fat', canonicalUnit: 'g', dailyValue: 78, mandatory: true },
  { slug: 'saturated-fat', label: 'Saturated Fat', canonicalUnit: 'g', dailyValue: 20, mandatory: true },
  { slug: 'trans-fat', label: 'Trans Fat', canonicalUnit: 'g', mandatory: true },
  { slug: 'cholesterol', label: 'Cholesterol', canonicalUnit: 'mg', dailyValue: 300, mandatory: true },
  { slug: 'sodium', label: 'Sodium', canonicalUnit: 'mg', dailyValue: 2300, mandatory: true },
  { slug: 'total-carbohydrate', label: 'Total Carbohydrate', canonicalUnit: 'g', dailyValue: 275, mandatory: true },
  { slug: 'dietary-fiber', label: 'Dietary Fiber', canonicalUnit: 'g', dailyValue: 28, mandatory: true },
  { slug: 'total-sugars', label: 'Total Sugars', canonicalUnit: 'g', mandatory: true },
  { slug: 'added-sugars', label: 'Added Sugars', canonicalUnit: 'g', dailyValue: 50, mandatory: true },
  { slug: 'protein', label: 'Protein', canonicalUnit: 'g', dailyValue: 50, mandatory: true },
  { slug: 'vitamin-d', label: 'Vitamin D', canonicalUnit: 'mcg', dailyValue: 20, mandatory: true },
  { slug: 'calcium', label: 'Calcium', canonicalUnit: 'mg', dailyValue: 1300, mandatory: true },
  { slug: 'iron', label: 'Iron', canonicalUnit: 'mg', dailyValue: 18, mandatory: true },
  { slug: 'potassium', label: 'Potassium', canonicalUnit: 'mg', dailyValue: 4700, mandatory: true },
  // Voluntary
  { slug: 'monounsaturated-fat', label: 'Monounsaturated Fat', canonicalUnit: 'g', mandatory: false },
  { slug: 'polyunsaturated-fat', label: 'Polyunsaturated Fat', canonicalUnit: 'g', mandatory: false },
  { slug: 'vitamin-a', label: 'Vitamin A', canonicalUnit: 'mcg', dailyValue: 900, mandatory: false },
  { slug: 'vitamin-c', label: 'Vitamin C', canonicalUnit: 'mg', dailyValue: 90, mandatory: false },
  { slug: 'water', label: 'Water', canonicalUnit: 'ml', mandatory: false },
]

export function nutrientDef(slug: string): NutrientDef | undefined {
  return NUTRIENTS.find((n) => n.slug === slug)
}

/** The FDA mandatory nutrients in label-panel declaration order (NOT alphabetical). */
export function mandatoryNutrients(): readonly NutrientDef[] {
  return NUTRIENTS.filter((n) => n.mandatory)
}
