// packages/react-oyl/modules/user/goal-milestone/UserGoalMilestoneProvider.tsx
import React, { useCallback } from 'react'
import type { TDataId, TUserGoalMilestoneData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-goal-milestone-context'

const extractId = (rel: unknown): TDataId | undefined => {
  if (rel == null) return undefined
  if (typeof rel === 'object' && 'id' in (rel as object)) return (rel as { id: TDataId }).id
  return rel as TDataId
}

export default function UserGoalMilestoneProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserGoalMilestoneData>('user-goal-milestones')

  const getMilestonesForGoal = useCallback((goalId: TDataId) =>
    data.find()
      .filter(m => extractId(m.user_goal) === goalId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data]
  )

  const addMilestone = useCallback((input: Partial<TUserGoalMilestoneData>) => data.save(input), [data])
  const removeMilestone = useCallback((id: TDataId) => data.remove(id), [data])

  const toggleMilestone = useCallback(async (id: TDataId) => {
    const existing = data.get(id)
    if (!existing) return
    return data.update(id, {
      completed_at: existing.completed_at ? null as unknown as undefined : new Date().toISOString(),
    })
  }, [data])

  const reorderMilestones = useCallback(async (_goalId: TDataId, ids: TDataId[]) => {
    await Promise.all(ids.map((id, idx) => data.update(id, { sort_order: idx })))
  }, [data])

  return (
    <context.Provider value={{
      milestones: data.find(),
      getMilestonesForGoal,
      addMilestone,
      toggleMilestone,
      removeMilestone,
      reorderMilestones,
    }}>
      {children}
    </context.Provider>
  )
}
