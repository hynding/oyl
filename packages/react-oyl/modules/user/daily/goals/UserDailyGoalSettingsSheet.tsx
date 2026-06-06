// packages/react-oyl/modules/user/daily/goals/UserDailyGoalSettingsSheet.tsx
import { UserGoalSettingsSheet, useUserGoalContext } from '@/modules/user/goal'

export default function UserDailyGoalSettingsSheet() {
  const { goals, settingsGoalId, setSettingsGoalId, updateGoal, removeGoal } = useUserGoalContext()
  const goal = goals.find(g => g.id === settingsGoalId)

  if (!settingsGoalId || !goal || goal.id == null) return null
  const id = goal.id

  return (
    <UserGoalSettingsSheet
      goal={goal}
      goals={goals}
      onSave={patch => updateGoal(id, patch)}
      onDelete={() => removeGoal(id)}
      onClose={() => setSettingsGoalId(null)}
    />
  )
}
