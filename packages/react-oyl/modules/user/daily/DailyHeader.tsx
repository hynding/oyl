import { useDailyProvider } from './DailyProvider'

export default function DailyHeader() {
  const {
    selectedDate,
    setSelectedDate,
  } = useDailyProvider()

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Daily Overview</h1>
          <p className="text-gray-600 mt-1">Track your activities, goals, and nutrition</p>
        </div>
        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  )
}