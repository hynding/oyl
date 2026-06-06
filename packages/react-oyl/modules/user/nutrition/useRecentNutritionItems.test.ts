import { describe, expect, it } from 'vitest'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { dedupRecentItemsFrom } from './useRecentNutritionItems'

function mk(itemId: string, date: string): TUserNutritionData {
  return {
    id: Number(itemId.slice(-1)),
    documentId: `log-${itemId}`,
    date,
    servings: 1,
    name: `Item ${itemId}`,
    nutrition_item: { documentId: itemId, id: 1, name: `Item ${itemId}`, serving_unit: 'g', source: 'user' } as TNutritionItemData,
    user: 1,
  } as TUserNutritionData
}

describe('dedupRecentItemsFrom', () => {
  it('dedups by nutrition_item.documentId, most-recent first, respects limit', () => {
    const logs = [
      mk('a', '2026-06-01T08:00:00.000Z'),
      mk('b', '2026-06-02T08:00:00.000Z'),
      mk('a', '2026-06-03T08:00:00.000Z'),
      mk('c', '2026-05-30T08:00:00.000Z'),
    ]
    const result = dedupRecentItemsFrom(logs, 5)
    expect(result.map(i => i.documentId)).toEqual(['a', 'b', 'c'])
  })

  it('ignores logs whose nutrition_item is null', () => {
    const broken = { ...mk('a', '2026-06-03T08:00:00.000Z'), nutrition_item: null as unknown as TNutritionItemData }
    expect(dedupRecentItemsFrom([broken], 5)).toEqual([])
  })
})
