// packages/react-oyl/modules/user/goal/UserGoalProvider.tsx
import React, { useCallback, useState } from 'react'
import type { TDataId, TUserGoalData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-goal-context'

export default function UserGoalProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserGoalData>('user-goals')
  const [showAddGoalForm, setShowAddGoalForm] = useState(false)
  const [settingsGoalId, setSettingsGoalId] = useState<TDataId | null>(null)

  const getGoal = useCallback((id: TDataId) => data.get(id), [data])

  const addGoal = useCallback(async (input: Partial<TUserGoalData>) => {
    await data.save(input)
  }, [data])

  const updateGoal = useCallback(async (id: TDataId, patch: Partial<TUserGoalData>) => {
    await data.update(id, patch)
  }, [data])

  const removeGoal = useCallback(async (id: TDataId) => {
    await data.remove(id)
  }, [data])

  const setProgress = useCallback(async (id: TDataId, value: number) => {
    await data.update(id, { progress: value })
  }, [data])

  const markComplete = useCallback(async (id: TDataId) => {
    await data.update(id, {
      completed_at: new Date().toISOString(),
      current_status: 'completed',
    })
  }, [data])

  const appendNote = useCallback(async (id: TDataId, text: string) => {
    const existing = data.get(id)
    const combined = existing?.note ? `${existing.note}\n${text}` : text
    await data.update(id, { note: combined })
  }, [data])

  return (
    <context.Provider value={{
      goals: data.find(),
      getGoal,
      addGoal,
      updateGoal,
      removeGoal,
      setProgress,
      markComplete,
      appendNote,
      showAddGoalForm,
      setShowAddGoalForm,
      settingsGoalId,
      setSettingsGoalId,
    }}>
      {children}
    </context.Provider>
  )
}
