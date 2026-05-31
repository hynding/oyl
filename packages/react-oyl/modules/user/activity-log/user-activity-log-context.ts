// packages/react-oyl/modules/user/activity-log/user-activity-log-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserActivityLogData } from '@oyl/all-of-oyl/modules'

export type UserActivityLogContextValue = {
  logs: TUserActivityLogData[]
  getLogsForActivity: (activityId: TDataId, date: string) => TUserActivityLogData[]
  addLog: (input: Partial<TUserActivityLogData>) => Promise<void>
  updateLog: (id: TDataId, patch: Partial<TUserActivityLogData>) => Promise<void>
  removeLog: (id: TDataId) => Promise<void>
  editingLogId: TDataId | null
  setEditingLogId: (id: TDataId | null) => void
}

const defaultValue: UserActivityLogContextValue = {
  logs: [],
  getLogsForActivity: () => [],
  addLog: async () => {},
  updateLog: async () => {},
  removeLog: async () => {},
  editingLogId: null,
  setEditingLogId: () => {},
}

export const context = createContext<UserActivityLogContextValue>(defaultValue)
export const useUserActivityLogContext = () => useContext(context)
