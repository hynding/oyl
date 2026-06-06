// packages/react-oyl/modules/user/daily/goals/UserDailyGoalRow.tsx
import { UserGoalRow } from '@/modules/user/goal'
import type { GoalRow } from '../useUserDailyOrchestrator'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

type Props = { row: GoalRow }

export default function UserDailyGoalRow({ row }: Props) {
  const { setProgress, markGoalComplete, appendGoalNote, toggleMilestone, openGoalSettings } =
    useUserDailyOrchestrator()
  const { goal, milestones, progressPct, isComplete } = row
  if (goal.id == null) return null
  const id = goal.id

  return (
    <UserGoalRow
      goal={goal}
      milestones={milestones}
      progressPct={progressPct}
      isComplete={isComplete}
      onSetProgress={value => setProgress(id, value)}
      onMarkComplete={() => markGoalComplete(id)}
      onToggleMilestone={toggleMilestone}
      onAppendNote={text => appendGoalNote(id, text)}
      onOpenSettings={openGoalSettings}
    />
  )
}
