// packages/react-oyl/modules/user/goal/user-goal-context.ts
import { createContext, useContext } from 'react'
import type { TDataId, TUserGoalData } from '@oyl/all-of-oyl/modules'

export type UserGoalContextValue = {
  goals: TUserGoalData[]
  getGoal: (id: TDataId) => TUserGoalData | undefined
  addGoal: (input: Partial<TUserGoalData>) => Promise<void>
  updateGoal: (id: TDataId, patch: Partial<TUserGoalData>) => Promise<void>
  removeGoal: (id: TDataId) => Promise<void>

  // Semantic helpers
  setProgress: (id: TDataId, value: number) => Promise<void>
  markComplete: (id: TDataId) => Promise<void>
  appendNote: (id: TDataId, text: string) => Promise<void>

  // UI state
  showAddGoalForm: boolean
  setShowAddGoalForm: (v: boolean) => void
  settingsGoalId: TDataId | null
  setSettingsGoalId: (id: TDataId | null) => void
}

const defaultValue: UserGoalContextValue = {
  goals: [],
  getGoal: () => undefined,
  addGoal: async () => {},
  updateGoal: async () => {},
  removeGoal: async () => {},
  setProgress: async () => {},
  markComplete: async () => {},
  appendNote: async () => {},
  showAddGoalForm: false,
  setShowAddGoalForm: () => {},
  settingsGoalId: null,
  setSettingsGoalId: () => {},
}

export const context = createContext<UserGoalContextValue>(defaultValue)
export const useUserGoalContext = () => useContext(context)
