import type { TDataId, TDataItem } from "../../data"
import type { TUserActivityData } from "../activity/user-activity-types"
import type { TUserGoalData } from "../goal/user-goal-types"
import type { TUserNutritionData } from "../nutrition/user-nutrition-types"

export type TUserDaily = {
  date: string
  activities: TUserActivityData[] | TDataId[]
  goals: TUserGoalData[] | TDataId[]
  nutritions: TUserNutritionData[] | TDataId[]
}

export type TUserDailyData = TUserDaily & TDataItem
