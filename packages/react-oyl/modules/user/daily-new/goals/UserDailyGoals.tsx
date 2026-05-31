// packages/react-oyl/modules/user/daily-new/goals/UserDailyGoals.tsx
import { useState } from 'react'
import { Section } from '@oyl/storybook-oyl'
import UserDailyGoalsList from './UserDailyGoalsList'
import UserDailyAddGoalForm from './UserDailyAddGoalForm'
import UserDailyAddMilestoneForm from './UserDailyAddMilestoneForm'
import UserDailyGoalSettingsSheet from './UserDailyGoalSettingsSheet'

export default function UserDailyGoals() {
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [showAddMilestone, setShowAddMilestone] = useState(false)

  return (
    <Section title="Goals">
      <UserDailyGoalsList />
      <div className="flex gap-2 mt-3">
        <button onClick={() => setShowAddGoal(s => !s)} className="px-3 py-1 text-sm rounded bg-indigo-600 text-white">
          {showAddGoal ? 'Hide' : 'Add goal'}
        </button>
        <button onClick={() => setShowAddMilestone(s => !s)} className="px-3 py-1 text-sm rounded bg-gray-200 dark:bg-gray-700">
          {showAddMilestone ? 'Hide' : 'Add milestone'}
        </button>
      </div>
      {showAddGoal && <div className="mt-3"><UserDailyAddGoalForm onClose={() => setShowAddGoal(false)} /></div>}
      {showAddMilestone && <div className="mt-3"><UserDailyAddMilestoneForm onClose={() => setShowAddMilestone(false)} /></div>}
      <UserDailyGoalSettingsSheet />
    </Section>
  )
}
