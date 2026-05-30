import { useDailyProvider } from "./useUserDailyProvider"
import { Button } from '@oyl/storybook-oyl'
import DailySection from "./UserDailySection"

export default function DailyGoals() {
  const {
    goals,
    showGoalForm,
    setShowGoalForm,
    newGoal,
    // setNewGoal,
    addGoal,
    onChangeGoal,
    cancelGoalForm,
    handleSliderChange
  } = useDailyProvider()

  return (
    <DailySection title="Goals">
      <div className="space-y-3">
        {goals.map(goal => (
          <div key={goal.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900 dark:text-gray-100">{goal?.name ?? goal?.goal?.name ?? 'Goal'}</h3>
              <span className={`text-sm font-medium ${goal.completed ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {goal.progress}/{goal.target}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{goal.description}</p>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max={goal.target}
                value={goal.progress}
                onChange={(e) => handleSliderChange(goal.id, e.target.value)}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, ${goal.completed ? '#10b981' : '#4f46e5'} 0%, ${goal.completed ? '#10b981' : '#4f46e5'} ${(goal.progress / goal.target) * 100}%, #e5e7eb ${(goal.progress / goal.target) * 100}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>0</span>
                <span>{goal.target}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Goal Form */}
      {showGoalForm ? (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Add New Goal</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Title</label>
              <input
                type="text"
                value={newGoal.title}
                onChange={(e) => onChangeGoal('title', e.target.value)}
                placeholder="e.g., Daily Steps"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
              <input
                type="text"
                value={newGoal.description}
                onChange={(e) => onChangeGoal('description', e.target.value)}
                placeholder="e.g., Walk 10,000 steps today"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Value</label>
              <input
                type="number"
                value={newGoal.target}
                onChange={(e) => onChangeGoal('target', e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex space-x-2 pt-2">
              <button
                onClick={addGoal}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Add Goal
              </button>
              <button
                onClick={cancelGoalForm}
                className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setShowGoalForm(true)}
          fullWidth
        >
          Add Goal
        </Button>
      )}
    </DailySection>
  )
}