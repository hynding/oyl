import type { TDataItem } from "../../data";

export type TNutritionItem = {
  name: string
  calories: number
  protein: number
  fat: number
  carbohydrates: number
}

export type TNutritionItemData = TNutritionItem & TDataItem
