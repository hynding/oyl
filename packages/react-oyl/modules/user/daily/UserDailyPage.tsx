import DailyProvider from './UserDailyProvider'
import DailyHeader from './UserDailyHeader'
import DailyActivities from './UserDailyActivities'
import DailyGoals from './UserDailyGoals'
import DailyNutrition from './UserDailyNutrition'

export default function DailyPage() {

  return (
    <DailyProvider>
      <div className="min-h-screen w-full bg-gray-50 py-8">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <DailyHeader />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <DailyActivities />
            <DailyGoals />
            <DailyNutrition />
          </div>
        </div>
      </div>
    </DailyProvider>
  )
}