// packages/react-oyl/modules/user/daily/goals/UserDailyAddMilestoneForm.tsx
import { UserGoalMilestoneForm } from '@/modules/user/goal-milestone'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddMilestoneForm({ onClose }: { onClose: () => void }) {
  const { goalRows, addMilestone } = useUserDailyOrchestrator()
  const goals = goalRows.map(r => r.goal)

  return (
    <UserGoalMilestoneForm
      goals={goals}
      onCancel={onClose}
      onSubmit={async values => {
        await addMilestone(values)
        onClose()
      }}
    />
  )
}
