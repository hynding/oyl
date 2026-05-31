// packages/react-oyl/modules/user/activity/user-activity-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserActivityData } from '@oyl/all-of-oyl/modules'

export type UserActivityContextValue = {
  activities: TUserActivityData[]
  addActivity: (input: Partial<TUserActivityData>) => Promise<void>
  updateActivity: (id: TDataId, patch: Partial<TUserActivityData>) => Promise<void>
  removeActivity: (id: TDataId) => Promise<void>

  // UI state
  showAddActivityForm: boolean
  setShowAddActivityForm: (v: boolean) => void
  settingsActivityId: TDataId | null
  setSettingsActivityId: (id: TDataId | null) => void
}

const defaultValue: UserActivityContextValue = {
  activities: [],
  addActivity: async () => {},
  updateActivity: async () => {},
  removeActivity: async () => {},
  showAddActivityForm: false,
  setShowAddActivityForm: () => {},
  settingsActivityId: null,
  setSettingsActivityId: () => {},
}

export const context = createContext<UserActivityContextValue>(defaultValue)
export const useUserActivityContext = () => useContext(context)
