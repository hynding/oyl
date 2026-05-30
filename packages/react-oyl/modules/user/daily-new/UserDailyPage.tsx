import UserDailyHeader from './UserDailyHeader'
import UserDailyActivities from './activities'
import UserDailyProvider from './UserDailyProvider'

export default function UserDailyPage() {

  return (
    <UserDailyProvider>
      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 py-8">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <UserDailyHeader />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <UserDailyActivities />
            {/* <UserDailyGoalsSection />
            <UserDailyNutritionSection /> */}
          </div>
        </div>
      </div>
    </UserDailyProvider>
  )
}