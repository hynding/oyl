// packages/react-oyl/modules/user/goal-milestone/user-goal-milestone-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'

export type UserGoalMilestoneContextValue = {
  milestones: TUserGoalMilestoneData[]
  getMilestonesForGoal: (goalId: TDataId) => TUserGoalMilestoneData[]
  addMilestone: (input: Partial<TUserGoalMilestoneData>) => Promise<void>
  toggleMilestone: (id: TDataId) => Promise<void>
  removeMilestone: (id: TDataId) => Promise<void>
  reorderMilestones: (goalId: TDataId, ids: TDataId[]) => Promise<void>
}

const defaultValue: UserGoalMilestoneContextValue = {
  milestones: [],
  getMilestonesForGoal: () => [],
  addMilestone: async () => {},
  toggleMilestone: async () => {},
  removeMilestone: async () => {},
  reorderMilestones: async () => {},
}

export const context = createContext<UserGoalMilestoneContextValue>(defaultValue)
export const useUserGoalMilestoneContext = () => useContext(context)
