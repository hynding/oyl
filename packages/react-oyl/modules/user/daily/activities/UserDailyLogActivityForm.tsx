// packages/react-oyl/modules/user/daily/activities/UserDailyLogActivityForm.tsx
import { UserActivityLogForm } from '@/modules/user/activity-log'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyLogActivityForm({ onClose }: { onClose: () => void }) {
  const { activityRows, addLog, selectedDate } = useUserDailyOrchestrator()
  const activities = activityRows.map(r => r.activity)

  return (
    <UserActivityLogForm
      activities={activities}
      onCancel={onClose}
      onSubmit={async values => {
        await addLog({
          ...values,
          logged_at: `${selectedDate}T${new Date().toISOString().slice(11, 19)}Z`,
        })
        onClose()
      }}
    />
  )
}
