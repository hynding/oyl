import { useDailyProvider } from "./DailyProvider"

export default function DailyGoals() {
  const {
    goals,
    showGoalForm,
    setShowGoalForm,
    newGoal,
    setNewGoal,
    addGoal,
    onChangeGoal,
    cancelGoalForm,
    handleSliderChange
  } = useDailyProvider()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Goals</h2>
      <div className="space-y-4">
        {goals.map(goal => (
          <div key={goal.id} className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-900">{goal?.name ?? goal?.goal?.name ?? 'Goal'}</h3>
              <span className={`text-sm font-medium ${goal.completed ? 'text-green-600' : 'text-gray-500'}`}>
                {goal.progress}/{goal.target}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-3">{goal.description}</p>
            <div className="space-y-2">
              <input
                type="range"
                min="0"
                max={goal.target}
                value={goal.progress}
                onChange={(e) => handleSliderChange(goal.id, e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, ${goal.completed ? '#10b981' : '#4f46e5'} 0%, ${goal.completed ? '#10b981' : '#4f46e5'} ${(goal.progress / goal.target) * 100}%, #e5e7eb ${(goal.progress / goal.target) * 100}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-500">
                <span>0</span>
                <span>{goal.target}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Goal Form */}
      {showGoalForm ? (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-medium text-gray-900 mb-3">Add New Goal</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Goal Title</label>
              <input
                type="text"
                value={newGoal.title}
                onChange={(e) => onChangeGoal('title', e.target.value)}
                placeholder="e.g., Daily Steps"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={newGoal.description}
                onChange={(e) => onChangeGoal('description', e.target.value)}
                placeholder="e.g., Walk 10,000 steps today"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
              <input
                type="number"
                value={newGoal.target}
                onChange={(e) => onChangeGoal('target', e.target.value)}
                placeholder="10000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowGoalForm(true)}
          className="w-full mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Goal
        </button>
      )}
    </div>
  )
}