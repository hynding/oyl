import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TNutritionItemData } from "../../nutrition"
import type { TCalendarItemSettings } from "../../calendar"

export type TUserNutrition = {
  user: TUser | TDataId
  nutrition_item: TNutritionItemData | TDataId
  name: string
  date: string
  servings: number
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  deleted_at?: string | null
  data?: Record<string, unknown>
}

export type TUserNutritionData = TUserNutrition & TDataItem

export type TUserNutritionSettings = TCalendarItemSettings & {
  nutrition: TUserNutritionData | TDataId
}
