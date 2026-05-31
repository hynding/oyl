// packages/all-of-oyl/modules/user/goal/user-goal-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUser } from "../user-types"
import type { TGoalData } from "../../goal"

export type TUserGoal = {
  user?: TUser | TDataId
  goal?: TGoalData | TDataId
  name?: string
  progress?: number
  target?: number
  category?: string
  current_status?: 'active' | 'paused' | 'completed' | 'archived'
  priority?: 'low' | 'medium' | 'high'
  target_date?: string
  completed_at?: string
  note?: string
  parent_user_goal?: TUserGoalData | TDataId
}

export type TUserGoalData = TUserGoal & TDataItem
