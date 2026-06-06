import { useMemo } from 'react'
import { useData } from '@/modules/data'

export type NutritionTargets = {
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
}

type Settings = { id: number; documentId: string; data?: { targets?: NutritionTargets } }

export function useUserNutritionSettings(): { targets: NutritionTargets | undefined } {
  const { find } = useData<Settings>('user-nutrition-settings')
  return useMemo(() => {
    const records = find()
    const first = records[0]
    return { targets: first?.data?.targets }
  }, [find])
}
