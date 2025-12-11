import type { TDataId, TDataItem } from "@/modules/data";

export type TNutritionItem = {
  name: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}

export type TNutritionItemData = TNutritionItem & TDataItem
