import { Section } from '@oyl/storybook-oyl'
import { UserActivityViewProvider } from '@/modules/user/activity'
import type { TUserActivityData } from '@oyl/all-of-oyl/modules'
import { useUserDailyContext } from '../user-daily-context'
import UserDailyActivitiesList from './UserDailyActivitiesList'
import UserDailyActivitiesForm from './UserDailyActivitiesForm'
// import UserDailyActivitiesSettings from './UserDailyActivitiesSettings'

const isHydrated = (a: TUserActivityData | number): a is TUserActivityData =>
  typeof a === 'object' && a !== null

export default function UserDailyActivities() {
  const { selectedDate, userDailyData: { activities } } = useUserDailyContext()
  const hydrated = activities.filter(isHydrated)
  return (
    <UserActivityViewProvider activities={hydrated} date={selectedDate}>
      <Section title="Activities">
        <UserDailyActivitiesList />
        <UserDailyActivitiesForm />
        {/* <UserDailyActivitiesSettings /> */}
      </Section>
    </UserActivityViewProvider>
  )
}
