// packages/all-of-oyl/modules/user/activity/user-activity-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TActivity } from "../../activity"
import type { TUserGoalData } from "../goal/user-goal-types"
import type { TSchedule } from "./schedule-types"

export type TUserActivity = {
  user?: TUser | TDataId
  activity?: TActivity | TDataId
  name?: string
  schedule?: TSchedule
  type?: 'habit' | 'task' | 'event' | 'metric'
  current_status?: 'active' | 'paused' | 'archived'
  user_goal?: TUserGoalData | TDataId
  target_value?: number
  target_unit?: string
  target_direction?: 'min' | 'max' | 'exact'
  schedule_target?: unknown
}

export type TUserActivityData = TUserActivity & TDataItem
