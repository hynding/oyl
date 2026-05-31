// packages/react-oyl/modules/user/activity/UserActivityProvider.tsx
import React, { useCallback } from 'react'
import type { TDataId, TUserActivityData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-activity-context'
import { useUserActivityState } from './useUserActivityState'

export default function UserActivityProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserActivityData>('user-activities')
  const uiState = useUserActivityState()

  const addActivity = useCallback(async (input: Partial<TUserActivityData>) => {
    await data.save(input)
  }, [data])

  const updateActivity = useCallback(async (id: TDataId, patch: Partial<TUserActivityData>) => {
    await data.update(id, patch)
  }, [data])

  const removeActivity = useCallback(async (id: TDataId) => {
    await data.remove(id)
  }, [data])

  return (
    <context.Provider value={{
      activities: data.find(),
      addActivity,
      updateActivity,
      removeActivity,
      ...uiState,
    }}>
      {children}
    </context.Provider>
  )
}
