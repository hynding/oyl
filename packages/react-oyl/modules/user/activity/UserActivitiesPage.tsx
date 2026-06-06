import PageShell from '@/modules/app/PageShell'
import {
  UserActivitiesList,
  UserActivityProvider,
  UserActivityRow,
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
  const { activities, setSettingsActivityId } = useUserActivityContext()
  useUserGoalContext() // mounted so form/sheet have goals available

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
    </PageShell>
  )
}
