import { useMemo } from 'react'
import { useUserNutritionContext } from './user-nutrition-context'
import { derivePantryItems, type PantryEntry } from './useRecentNutritionItems'

export function useUserPantry(): PantryEntry[] {
  const { nutritions } = useUserNutritionContext()
  return useMemo(() => derivePantryItems(nutritions), [nutritions])
}
