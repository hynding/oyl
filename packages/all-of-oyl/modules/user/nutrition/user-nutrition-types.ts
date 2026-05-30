import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TNutritionItem } from "../../nutrition"
import type { TCalendarItemSettings } from "../../calendar"

export type TUserNutrition = {
  user: TUser | TDataId
  nutrition_item: TNutritionItem | TDataId
  amount: number
}

export type TUserNutritionData = TUserNutrition & TDataItem

export type TUserNutritionSettings = TCalendarItemSettings & {
  nutrition: TUserNutritionData | TDataId
}
