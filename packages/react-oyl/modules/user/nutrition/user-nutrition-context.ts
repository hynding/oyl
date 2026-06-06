import { createContext, useContext } from 'react'
import type { TDataId, TUserNutritionData } from '@oyl/all-of-oyl/modules'

export type UserNutritionContextValue = {
  nutritions: TUserNutritionData[]
  addNutrition: (input: Partial<TUserNutritionData>) => Promise<void>
  updateNutrition: (id: TDataId, patch: Partial<TUserNutritionData>) => Promise<void>
  removeNutrition: (id: TDataId) => Promise<void>
}

const defaultValue: UserNutritionContextValue = {
  nutritions: [],
  addNutrition: async () => {},
  updateNutrition: async () => {},
  removeNutrition: async () => {},
}

export const context = createContext<UserNutritionContextValue>(defaultValue)
export const useUserNutritionContext = () => useContext(context)
