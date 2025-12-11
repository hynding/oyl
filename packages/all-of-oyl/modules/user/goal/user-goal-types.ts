import type { TDataId, TDataItem } from "@/modules/data"
import type { TUser } from "@/modules/user"
import type { TGoalData } from "@/modules/goal"
import { TCalendarItemSettings } from "@/modules/calendar"

export type TUserGoal = {
  name?: string
  user?: TUser | TDataId
  goal?: TGoalData | TDataId
  progress?: number
  description?: string
  target?: number
  completed?: boolean
}

export type TUserGoalData = TUserGoal & TDataItem

export type TUserGoalSettings = TCalendarItemSettings & {
  goal: TUserGoalData | TDataId
}