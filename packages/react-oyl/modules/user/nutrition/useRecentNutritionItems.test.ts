import { describe, expect, it } from 'vitest'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { dedupRecentItemsFrom, derivePantryItems } from './useRecentNutritionItems'

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

describe('derivePantryItems', () => {
  it('returns empty array for empty logs', () => {
    expect(derivePantryItems([])).toEqual([])
  })

  it('aggregates logCount and lastLoggedAt per item across multiple logs', () => {
    const logs = [
      mk('a', '2026-06-01T08:00:00.000Z'),
      mk('a', '2026-06-03T08:00:00.000Z'),
      mk('a', '2026-06-02T08:00:00.000Z'),
      mk('b', '2026-06-04T08:00:00.000Z'),
    ]
    const result = derivePantryItems(logs)
    expect(result).toHaveLength(2)
    const a = result.find(e => e.item.documentId === 'a')!
    const b = result.find(e => e.item.documentId === 'b')!
    expect(a.logCount).toBe(3)
    expect(a.lastLoggedAt).toBe('2026-06-03T08:00:00.000Z')
    expect(b.logCount).toBe(1)
    expect(b.lastLoggedAt).toBe('2026-06-04T08:00:00.000Z')
  })

  it('sorts entries by lastLoggedAt descending', () => {
    const logs = [
      mk('older', '2026-05-01T08:00:00.000Z'),
      mk('newest', '2026-06-10T08:00:00.000Z'),
      mk('middle', '2026-06-01T08:00:00.000Z'),
    ]
    const result = derivePantryItems(logs)
    expect(result.map(e => e.item.documentId)).toEqual(['newest', 'middle', 'older'])
  })

  it('filters out soft-deleted logs', () => {
    const live = mk('a', '2026-06-02T08:00:00.000Z')
    const deleted = { ...mk('a', '2026-06-03T08:00:00.000Z'), deleted_at: '2026-06-03T09:00:00.000Z' } as TUserNutritionData
    const result = derivePantryItems([live, deleted])
    expect(result).toHaveLength(1)
    expect(result[0].logCount).toBe(1)
    expect(result[0].lastLoggedAt).toBe('2026-06-02T08:00:00.000Z')
  })

  it('filters out logs with missing or malformed nutrition_item', () => {
    const ok = mk('a', '2026-06-03T08:00:00.000Z')
    const nullItem = { ...mk('b', '2026-06-04T08:00:00.000Z'), nutrition_item: null as unknown as TNutritionItemData }
    const noDocId = { ...mk('c', '2026-06-05T08:00:00.000Z'), nutrition_item: { id: 99, name: 'no docId' } as unknown as TNutritionItemData }
    const result = derivePantryItems([ok, nullItem, noDocId])
    expect(result).toHaveLength(1)
    expect(result[0].item.documentId).toBe('a')
  })
})
