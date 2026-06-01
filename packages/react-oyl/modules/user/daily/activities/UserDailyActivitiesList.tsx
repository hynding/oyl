// packages/react-oyl/modules/user/daily/activities/UserDailyActivitiesList.tsx
import UserDailyActivityRow from './UserDailyActivityRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyActivitiesList() {
  const { activityRows } = useUserDailyOrchestrator()
  if (activityRows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No activities scheduled for this date.</p>
  }
  return (
    <div className="space-y-3">
      {activityRows.map(row => <UserDailyActivityRow key={row.activity.id} row={row} />)}
    </div>
  )
}
