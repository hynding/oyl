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

export type PantryEntry = {
  item: TNutritionItemData
  lastLoggedAt: string
  logCount: number
}

export function derivePantryItems(logs: TUserNutritionData[]): PantryEntry[] {
  const groups = new Map<string, { item: TNutritionItemData; lastLoggedAt: string; logCount: number }>()
  for (const log of logs) {
    if (log.deleted_at) continue
    const item = log.nutrition_item
    if (!item || typeof item !== 'object' || !('documentId' in item) || !item.documentId) continue
    const docId = item.documentId
    const existing = groups.get(docId)
    if (!existing) {
      groups.set(docId, { item: item as TNutritionItemData, lastLoggedAt: log.date, logCount: 1 })
    } else {
      existing.logCount += 1
      if (existing.lastLoggedAt < log.date) {
        existing.lastLoggedAt = log.date
        existing.item = item as TNutritionItemData
      }
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt))
}

export function useRecentNutritionItems(limit = 8): TNutritionItemData[] {
  const { nutritions } = useUserNutritionContext()
  return useMemo(() => dedupRecentItemsFrom(nutritions, limit), [nutritions, limit])
}
