// packages/react-oyl/modules/user/daily-new/UserDailyHeader.tsx
import { useUserDailyContext } from './user-daily-context'
import UserDailySyncIndicator from './UserDailySyncIndicator'

export default function UserDailyHeader() {
  const { selectedDate, setSelectedDate } = useUserDailyContext()
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Daily Overview</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Track your activities, goals, and nutrition</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <UserDailySyncIndicator />
        </div>
      </div>
    </div>
  )
}
