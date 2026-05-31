// packages/all-of-oyl/modules/user/goal-milestone/user-goal-milestone-types.ts
import type { TDataId, TDataItem } from "../../data"
import type { TUserGoalData } from "../goal/user-goal-types"

export type TUserGoalMilestone = {
  user_goal?: TUserGoalData | TDataId
  title?: string
  note?: string
  target_date?: string
  completed_at?: string
  sort_order?: number
}

export type TUserGoalMilestoneData = TUserGoalMilestone & TDataItem
