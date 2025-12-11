import type { TDataId, TDataItem } from "@/modules/data"
import type { TUser } from "@/modules/user"
import type { TActivity } from "@/modules/activity"
import { TCalendarItemSettings } from "@/modules/calendar"

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