import React, { useEffect, useState } from 'react'
import { userDailyContext } from './user-daily-context'
import { useData } from '@/modules/data'
import type { TUserDailyData } from '@oyl/all-of-oyl/modules'
import useAuth from '@/modules/auth/useAuth'

const { Provider } = userDailyContext

const today = () => new Date().toISOString().split('T')[0]

const emptyDaily: TUserDailyData = {
  date: '',
  activities: [],
  goals: [],
  nutritions: []
}

export default function UserDailyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [selectedDate, setSelectedDate] = useState<string>(today())
  const {
    get: {
      trigger: fetchUserDaily,
      data: userDailyResponse
    },
  } = useData<{ data: TUserDailyData | TUserDailyData[] } | TUserDailyData, string>('user-dailies')

  useEffect(() => {
    if (user?.id && selectedDate && fetchUserDaily) {
      fetchUserDaily(selectedDate)
    }
  }, [user?.id, selectedDate, fetchUserDaily])

  const fallback: TUserDailyData = { ...emptyDaily, date: selectedDate }
  const unwrap = (r: typeof userDailyResponse): TUserDailyData => {
    if (!r) return fallback
    if ('data' in r && r.data !== undefined) {
      const d = r.data
      const daily = Array.isArray(d) ? d[0] : d
      return daily ?? fallback
    }
    return r as TUserDailyData
  }
  const userDailyData: TUserDailyData = {
    ...fallback,
    ...unwrap(userDailyResponse),
  }
  userDailyData.activities ??= []
  userDailyData.goals ??= []
  userDailyData.nutritions ??= []

  return (
    <Provider value={{
      selectedDate,
      setSelectedDate,
      userDailyData
    }}>
      {children}
    </Provider>
  )
}
