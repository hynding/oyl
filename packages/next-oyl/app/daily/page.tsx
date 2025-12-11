'use client'

import { useSearchParams } from 'next/navigation'
import DailyProvider from './DailyProvider'
import DailyHeader from './DailyHeader'
import DailyActivities from './DailyActivities'
import DailyGoals from './DailyGoals'
import DailyNutrition from './DailyNutrition'

export default function DailyPage() {
  const searchParams = useSearchParams()
  console.log('DailyPage searchParams:', searchParams)

  return (
    <DailyProvider>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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