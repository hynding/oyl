import React, { useCallback, useEffect, useState } from 'react'
import { useNavigation } from '@/lib/navigation'
import { context } from './user-activity-context'
import { useUserActivityState } from './useUserActivityState'
import type { TUserActivityData } from '@oyl/all-of-oyl/modules'
import useAuth from '@/modules/auth/useAuth'
import { useData } from '@/modules/data'

const { Provider } = context

export default function UserActivityProvider({ children, items }: { children: React.ReactNode, items?: TUserActivityData[] }) {
  const { isAuthenticated, user } = useAuth()
  const router = useNavigation()
  const {
    find: {
      trigger: fetchUserActivities,
      data: userActivitiesData,
    },
  } = useData<TUserActivityData, string>('user-activities')

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [activities, setActivities] = useState<TUserActivityData[]>(items || [])

  const state = useUserActivityState({ activities, setActivities })

  const fetchSelectedDate = useCallback(() => {
    if (user?.id && startDate && fetchUserActivities) {
      fetchUserActivities(startDate)
    }
  }, [user?.id, startDate, fetchUserActivities])

  useEffect(() => {
    if (userActivitiesData) {
      setActivities(userActivitiesData.activities || [])
    }
  }, [userActivitiesData])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSelectedDate()
    }
  }, [isAuthenticated, fetchSelectedDate])

  useEffect(() => {
    if (router && !isAuthenticated) {
      router.to('/login')
    }
  }, [isAuthenticated, router])

  return (
    <Provider value={{
      startDate,
      setStartDate,
      endDate,
      setEndDate,
      ...state,
    }}>
      {children}
    </Provider>
  )
}
