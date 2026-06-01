// packages/react-oyl/modules/user/daily/UserDailyPage.tsx
import UserDailyHeader from './UserDailyHeader'
import { UserDailyActivities } from './activities'
import { UserDailyGoals } from './goals'
import UserDailyDataProviders from './UserDailyDataProviders'

export default function UserDailyPage() {
  return (
    <UserDailyDataProviders>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <UserDailyHeader />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <UserDailyActivities />
            <UserDailyGoals />
          </div>
        </div>
      </div>
    </UserDailyDataProviders>
  )
}
