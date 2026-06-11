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
        // logged_at stores the local wall-clock time with a Z suffix because
        // the readers (UserActivityRow display, sameDay bucketing) string-slice
        // the value rather than parsing it. Using toISOString().slice for the
        // time-of-day would inject UTC hours and show e.g. "03:00" for an 8pm
        // PT log.
        const now = new Date()
        const hh = String(now.getHours()).padStart(2, '0')
        const mm = String(now.getMinutes()).padStart(2, '0')
        const ss = String(now.getSeconds()).padStart(2, '0')
        await addLog({
          ...values,
          logged_at: `${selectedDate}T${hh}:${mm}:${ss}Z`,
        })
        onClose()
      }}
    />
  )
}
