import React, { useCallback } from 'react'
import type { TDataId, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { useData } from '@/modules/data'
import { context } from './user-nutrition-context'

export function UserNutritionProvider({ children }: { children: React.ReactNode }) {
  const data = useData<TUserNutritionData>('user-nutritions')

  const addNutrition = useCallback(async (input: Partial<TUserNutritionData>) => {
    await data.save(input)
  }, [data])

  const updateNutrition = useCallback(async (id: TDataId, patch: Partial<TUserNutritionData>) => {
    await data.update(id, patch)
  }, [data])

  const removeNutrition = useCallback(async (id: TDataId) => {
    await data.update(id, { deleted_at: new Date().toISOString() } as Partial<TUserNutritionData>)
  }, [data])

  return (
    <context.Provider value={{ nutritions: data.find(), addNutrition, updateNutrition, removeNutrition }}>
      {children}
    </context.Provider>
  )
}

export default UserNutritionProvider
