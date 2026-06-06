// packages/react-oyl/modules/user/daily/goals/UserDailyGoalsList.tsx
import { UserGoalsList } from '@/modules/user/goal'
import UserDailyGoalRow from './UserDailyGoalRow'
import { useUserDailyOrchestrator } from '../useUserDailyOrchestrator'

export default function UserDailyGoalsList() {
  const { goalRows } = useUserDailyOrchestrator()
  return (
    <UserGoalsList
      items={goalRows}
      emptyMessage="No goals for this date."
      renderItem={row => <UserDailyGoalRow key={row.goal.id} row={row} />}
    />
  )
}
