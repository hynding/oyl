// packages/react-oyl/modules/user/daily/goals/UserDailyAddGoalForm.tsx
import { UserGoalForm } from '@/modules/user/goal'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddGoalForm({ onClose }: { onClose: () => void }) {
  const { addGoal } = useUserDailyOrchestrator()
  return (
    <UserGoalForm
      onSubmit={async values => {
        await addGoal(values)
        onClose()
      }}
      onCancel={onClose}
      submitLabel="Add goal"
    />
  )
}
