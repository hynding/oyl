// packages/all-of-oyl/modules/user/activity-log/user-activity-log-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TUserActivityData } from "../activity/user-activity-types"

type TTagData = TDataItem & { name?: string }

export type TUserActivityLog = {
  user?: TUser | TDataId
  user_activity?: TUserActivityData | TDataId
  logged_at?: string
  value?: number
  unit?: string
  note?: string
  mood?: number
  tags?: TTagData[] | TDataId[]
}

export type TUserActivityLogData = TUserActivityLog & TDataItem
