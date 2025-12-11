import type { TDataId, TDataItem } from "@/modules/data"
import type { TUser } from "@/modules/user"
import type { TNutritionItem } from "@/modules/nutrition"
import { TCalendarItem, TCalendarItemSettings } from "@/modules/calendar"

export type TUserNutrition = {
  user: TUser | TDataId
  nutrition_item: TNutritionItem | TDataId
  amount: number
}

export type TUserNutritionData = TUserNutrition & TDataItem

export type TUserNutritionSettings = TCalendarItemSettings & {
  nutrition: TUserNutritionData | TDataId
}