import { Section } from '@oyl/storybook-oyl'
import { 
  UserActivityItem,
  UserActivityForm,
  UserActivitySettings,
} from '@/modules/user/activity'
import { useUserDailyContext } from '../user-daily-context'

export default function UserDailyActivitesSection() {
  const { userDailyData: { activities } } = useUserDailyContext()
  return (
    <Section title="Activities">
      <div className="space-y-3">
        {activities.map(activity => (
          <UserActivityItem key={activity.id} activity={activity} />
        ))}
        <UserActivityForm />
        <UserActivitySettings />
      </div>
    </Section>
  )
}