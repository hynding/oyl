// packages/react-oyl/modules/user/activity-log/UserActivityLogProvider.tsx
import React, { useCallback, useState } from 'react'
import type { TDataId, TUserActivityLogData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-activity-log-context'

const extractId = (rel: unknown): TDataId | undefined => {
  if (rel == null) return undefined
  if (typeof rel === 'object' && 'id' in (rel as object)) return (rel as { id: TDataId }).id
  return rel as TDataId
}

const sameDay = (iso: string | undefined, date: string): boolean => {
  if (!iso) return false
  return iso.slice(0, 10) === date
}

export default function UserActivityLogProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserActivityLogData>('user-activity-logs')
  const [editingLogId, setEditingLogId] = useState<TDataId | null>(null)

  const getLogsForActivity = useCallback((activityId: TDataId, date: string) =>
    data.find().filter(l =>
      extractId(l.user_activity) === activityId && sameDay(l.logged_at, date)
    ),
    [data]
  )

  const addLog = useCallback((input: Partial<TUserActivityLogData>) => data.save(input), [data])
  const updateLog = useCallback((id: TDataId, patch: Partial<TUserActivityLogData>) => data.update(id, patch), [data])
  const removeLog = useCallback((id: TDataId) => data.remove(id), [data])

  return (
    <context.Provider value={{
      logs: data.find(),
      getLogsForActivity,
      addLog,
      updateLog,
      removeLog,
      editingLogId,
      setEditingLogId,
    }}>
      {children}
    </context.Provider>
  )
}
