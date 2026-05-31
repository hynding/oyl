import React, { useEffect, useState } from 'react'
import { userDailyContext } from './user-daily-context'
import { useData } from '@/modules/data'
import type { TUserDailyData } from '@oyl/all-of-oyl/modules'

const { Provider } = userDailyContext
const today = () => new Date().toISOString().split('T')[0]
const empty = (date: string): TUserDailyData => ({
  date, activities: [], goals: [], nutritions: [],
} as TUserDailyData)

export default function UserDailyProvider({ children }: { children: React.ReactNode }) {
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const data = useData<TUserDailyData>('user-dailies')

  useEffect(() => { data.refresh() }, [selectedDate, data])

  const all = data.find()
  const userDailyData = all.find(d => d.date === selectedDate) ?? empty(selectedDate)

  return (
    <Provider value={{ selectedDate, setSelectedDate, userDailyData }}>
      {children}
    </Provider>
  )
}
