import React, { useState } from 'react'
import { userDailyContext } from './user-daily-context'
import { useData } from '@/modules/data'
import type { TUserDailyData } from '@oyl/all-of-oyl/modules'

const { Provider } = userDailyContext
// Local-time date, not UTC: toISOString() rolls over to tomorrow for anyone
// west of UTC late in the evening, while user-dailies rows are keyed by the
// local date used in SyncBootstrap.todayLocalIsoDate().
const today = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const empty = (date: string): TUserDailyData => ({
  date, activities: [], goals: [], nutritions: [],
} as TUserDailyData)

export default function UserDailyProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const data = useData<TUserDailyData>('user-dailies')

  // No per-mount or per-date refresh: SyncBootstrap's aggregate already seeds
  // every user-dailies row on initial load, and the focus handler covers
  // background staleness. The mirror holds all dates, so changing selectedDate
  // is purely a local filter.
  const all = data.find()
  const userDailyData = all.find(d => d.date === selectedDate) ?? empty(selectedDate)

  return (
    <Provider value={{ selectedDate, setSelectedDate, userDailyData }}>
      {children}
    </Provider>
  )
}
