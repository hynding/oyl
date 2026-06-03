import { useMemo } from 'react'
import type { TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import { useUserNutritionContext } from './user-nutrition-context'

export function dedupRecentItemsFrom(logs: TUserNutritionData[], limit: number): TNutritionItemData[] {
  const seen = new Map<string, { item: TNutritionItemData; date: string }>()
  for (const log of logs) {
    const item = log.nutrition_item
    if (!item || typeof item !== 'object' || !('documentId' in item) || !item.documentId) continue
    const existing = seen.get(item.documentId)
    if (!existing || existing.date < log.date) {
      seen.set(item.documentId, { item: item as TNutritionItemData, date: log.date })
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(e => e.item)
}

export function useRecentNutritionItems(limit = 8): TNutritionItemData[] {
  const { nutritions } = useUserNutritionContext()
  return useMemo(() => dedupRecentItemsFrom(nutritions, limit), [nutritions, limit])
}
