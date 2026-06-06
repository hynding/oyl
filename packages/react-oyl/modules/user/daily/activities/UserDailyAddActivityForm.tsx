// packages/react-oyl/modules/user/daily/activities/UserDailyAddActivityForm.tsx
import { UserActivityForm } from '@/modules/user/activity'
import { useUserGoalContext } from '@/modules/user/goal'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyAddActivityForm({ onClose }: { onClose: () => void }) {
  const { addActivity } = useUserDailyOrchestrator()
  const { goals } = useUserGoalContext()
  return (
    <UserActivityForm
      goals={goals}
      onSubmit={async values => {
        await addActivity(values)
        onClose()
      }}
      onCancel={onClose}
      submitLabel="Add activity"
    />
  )
}
