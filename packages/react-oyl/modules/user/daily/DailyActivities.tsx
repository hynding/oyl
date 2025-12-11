import { useDailyProvider } from './useDailyProvider'
import DailySection from './DailySection'
import DailySectionForm from './DailySectionForm'
import DailySectionSettingsForm from './DailySectionSettingsForm'
import DailySectionSettingsModal from './DailySectionSettingsModal'

export default function DailyActivities() {
  const {
    activities,
    toggleActivity,
    showActivityForm,
    activityForm,
    onChangeActivity,
    addActivity,
    cancelActivityForm,
    setShowActivityForm,
    showActivitySettings,
    setShowActivitySettings,
    // selectedActivityForSettings,
    activitySettings,
    onChangeActivitySettings,
    saveActivitySettings,
    cancelActivitySettings
  } = useDailyProvider()

  return (
    <DailySection title="Activities">
      <div className="space-y-3">
        {activities.map(activity => (
          <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3 flex-1">
              <input
                type="checkbox"
                checked={activity.completed}
                onChange={() => toggleActivity(activity.id)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <div>
                <p className={`font-medium ${activity.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {activity?.name ?? activity?.activity?.name ?? 'Activity'}
                </p>
                <p className="text-sm text-gray-500">{activity.duration} min • {activity.time}</p>
              </div>
            </div>
            <button
              onClick={() => setShowActivitySettings(activity.id)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <DailySectionForm
        title="Add New Activity"
        show={showActivityForm}
        toggleShow={() => setShowActivityForm(true)}
        textShowForm="Add Activity"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Name</label>
            <input
              type="text"
              value={activityForm.name}
              onChange={(e) => onChangeActivity('name', e.target.value)}
              placeholder="e.g., Morning Run"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input
                type="number"
                value={activityForm.duration}
                onChange={(e) => onChangeActivity('duration', Number(e.target.value))}
                placeholder="30"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={activityForm.time}
                onChange={(e) => onChangeActivity('time', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex space-x-2 pt-2">
            <button
              onClick={addActivity}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              Add Activity
            </button>
            <button
              onClick={cancelActivityForm}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </DailySectionForm>

      {/* Activity Settings Modal */}
      <DailySectionSettingsModal
        title='Activity Settings'
        open={!!showActivitySettings}
        onClose={cancelActivitySettings}
      >
        <DailySectionSettingsForm
          settings={activitySettings}
          onSave={saveActivitySettings}
          onCancel={cancelActivitySettings}
          onChangeSetting={onChangeActivitySettings}
        >
        </DailySectionSettingsForm>
      </DailySectionSettingsModal>
    </DailySection>
  )
}