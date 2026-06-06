import PageShell from '@/modules/app/PageShell'
import {
  UserActivitiesList,
  UserActivityForm,
  UserActivityProvider,
  UserActivityRow,
  UserActivitySettingsSheet,
  useUserActivityContext,
} from '@/modules/user/activity'
import { UserGoalProvider, useUserGoalContext } from '@/modules/user/goal'

export default function UserActivitiesPage() {
  return (
    <UserActivityProvider>
      <UserGoalProvider>
        <UserActivitiesPageBody />
      </UserGoalProvider>
    </UserActivityProvider>
  )
}

export function UserActivitiesPageBody() {
  const {
    activities,
    addActivity,
    updateActivity,
    removeActivity,
    settingsActivityId,
    setSettingsActivityId,
    showAddActivityForm,
    setShowAddActivityForm,
  } = useUserActivityContext()
  const { goals } = useUserGoalContext()
  const editingActivity = activities.find(a => a.id === settingsActivityId) ?? null
  const editingId = editingActivity?.id

  return (
    <PageShell title="My Activities">
      <UserActivitiesList
        items={activities}
        emptyMessage="No activities yet."
        renderItem={a => (
          <UserActivityRow
            key={a.id}
            activity={a}
            onOpenSettings={setSettingsActivityId}
          />
        )}
      />
      <button
        onClick={() => setShowAddActivityForm(!showAddActivityForm)}
        className="px-3 py-1 text-sm rounded bg-indigo-600 text-white"
      >
        {showAddActivityForm ? 'Cancel' : 'Add activity'}
      </button>
      {showAddActivityForm && (
        <UserActivityForm
          goals={goals}
          onSubmit={async values => {
            await addActivity(values)
            setShowAddActivityForm(false)
          }}
          onCancel={() => setShowAddActivityForm(false)}
        />
      )}
      {editingActivity && editingId != null && (
        <UserActivitySettingsSheet
          activity={editingActivity}
          goals={goals}
          onSave={patch => updateActivity(editingId, patch)}
          onDelete={() => removeActivity(editingId)}
          onClose={() => setSettingsActivityId(null)}
        />
      )}
    </PageShell>
  )
}
