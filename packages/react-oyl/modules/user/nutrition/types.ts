import type { TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'

export type NutritionRow = {
  log: TUserNutritionData
  item: TNutritionItemData | null
}

export type DailyTotals = {
  calories: number; protein: number; carbs: number; fat: number
  targets: { calories?: number; protein?: number; carbs?: number; fat?: number }
  progress: { calories?: number; protein?: number; carbs?: number; fat?: number }
}
