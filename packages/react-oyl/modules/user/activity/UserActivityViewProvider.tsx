import React, { useEffect, useState } from 'react'
import { context } from './user-activity-context'
import { useUserActivityState } from './useUserActivityState'
import type { TUserActivityData } from '@oyl/all-of-oyl/modules'

const { Provider } = context

type Props = {
  children: React.ReactNode
  activities: TUserActivityData[]
  date: string
}

const noop = () => {}

export default function UserActivityViewProvider({ children, activities: incoming, date }: Props) {
  const [activities, setActivities] = useState<TUserActivityData[]>(incoming)

  useEffect(() => {
    setActivities(incoming)
  }, [incoming])

  const state = useUserActivityState({ activities, setActivities })

  return (
    <Provider value={{
      startDate: date,
      setStartDate: noop,
      endDate: date,
      setEndDate: noop,
      ...state,
    }}>
      {children}
    </Provider>
  )
}
