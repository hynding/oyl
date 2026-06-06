// packages/react-oyl/modules/user/daily/activities/UserDailyActivitiesList.tsx
import { UserActivitiesList } from '@/modules/user/activity'
import UserDailyActivityRow from './UserDailyActivityRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyActivitiesList() {
  const { activityRows } = useUserDailyOrchestrator()
  return (
    <UserActivitiesList
      items={activityRows}
      emptyMessage="No activities scheduled for this date."
      renderItem={row => <UserDailyActivityRow key={row.activity.id} row={row} />}
    />
  )
}
