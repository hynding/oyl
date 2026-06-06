import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TUserNutritionData, TNutritionItemData } from '@oyl/all-of-oyl/modules'
import { useUserPantry } from './useUserPantry'

const nutritions: TUserNutritionData[] = [
  {
    id: 1, documentId: 'log-1', date: '2026-06-02T08:00:00.000Z', servings: 1, name: 'Oatmeal', user: 1,
    nutrition_item: { documentId: 'i-oat', id: 1, name: 'Oatmeal', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
  {
    id: 2, documentId: 'log-2', date: '2026-06-04T08:00:00.000Z', servings: 1, name: 'Banana', user: 1,
    nutrition_item: { documentId: 'i-ban', id: 2, name: 'Banana', serving_unit: 'g', source: 'user' } as TNutritionItemData,
  } as TUserNutritionData,
]

vi.mock('./user-nutrition-context', () => ({
  useUserNutritionContext: () => ({
    nutritions,
    addNutrition: vi.fn(),
    updateNutrition: vi.fn(),
    removeNutrition: vi.fn(),
  }),
}))

describe('useUserPantry', () => {
  it('returns pantry entries sorted by most-recent first', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>
    const { result } = renderHook(() => useUserPantry(), { wrapper })
    expect(result.current.map(e => e.item.documentId)).toEqual(['i-ban', 'i-oat'])
    expect(result.current[0].logCount).toBe(1)
    expect(result.current[1].logCount).toBe(1)
  })
})
