// packages/react-oyl/modules/user/daily/activities/UserDailyActivitySettingsSheet.tsx
import { UserActivitySettingsSheet, useUserActivityContext } from '@/modules/user/activity'
import { useUserGoalContext } from '@/modules/user/goal'

export default function UserDailyActivitySettingsSheet() {
  const { activities, settingsActivityId, setSettingsActivityId, updateActivity, removeActivity } =
    useUserActivityContext()
  const { goals } = useUserGoalContext()
  const activity = activities.find(a => a.id === settingsActivityId)

  if (!settingsActivityId || !activity || activity.id == null) return null

  const id = activity.id
  return (
    <UserActivitySettingsSheet
      activity={activity}
      goals={goals}
      onSave={patch => updateActivity(id, patch)}
      onDelete={() => removeActivity(id)}
      onClose={() => setSettingsActivityId(null)}
    />
  )
}
