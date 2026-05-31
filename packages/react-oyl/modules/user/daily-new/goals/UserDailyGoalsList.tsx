// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoalsList.tsx
import UserDailyGoalRow from './UserDailyGoalRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyGoalsList() {
  const { goalRows } = useUserDailyOrchestrator()
  if (goalRows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No goals for this date.</p>
  }
  return (
    <div className="space-y-3">
      {goalRows.map(row => <UserDailyGoalRow key={row.goal.id} row={row} />)}
    </div>
  )
}
