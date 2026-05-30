import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TActivity } from "../../activity"
import type { TCalendarItemSettings } from "../../calendar"

export type TUserActivity = {
  user?: TUser
  activity?: TActivity
  name?: string
  description?: string
  progress?: number
  target?: number
  duration?: number
  completed?: boolean
  timestamp?: string
  time?: string
}

export type TUserActivityData = TUserActivity & TDataItem

export type TUserActivitySettings = TCalendarItemSettings & {
  activity: TUserActivityData | TDataId
}
