import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TGoalData } from "../../goal"
import type { TCalendarItemSettings } from "../../calendar"

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
