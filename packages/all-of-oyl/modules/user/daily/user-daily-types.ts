import type { TDataId, TDataItem } from "@/modules/data"
import type { 
  TUserActivityData,
  TUserGoalData,
  TUserNutritionData
} from "@/modules/user"

export type TUserDaily = {
  date: string
  activities: TUserActivityData[] | TDataId[]
  goals: TUserGoalData[] | TDataId[]
  nutritions: TUserNutritionData[] | TDataId[]
}

export type TUserDailyData = TUserDaily & TDataItem