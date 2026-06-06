import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUserNutritionSettings } from './useUserNutritionSettings'

vi.mock('@/modules/data', () => ({
  useData: () => ({
    find: () => [{ id: 1, documentId: 's1', data: { targets: { calories: 2000, protein: 80 } } }],
    get: () => undefined, save: vi.fn(), update: vi.fn(), remove: vi.fn(), refresh: vi.fn(),
    syncState: { pendingCount: 0, online: true },
  }),
}))

describe('useUserNutritionSettings', () => {
  it('returns first record targets', () => {
    const { result } = renderHook(() => useUserNutritionSettings())
    expect(result.current.targets).toEqual({ calories: 2000, protein: 80 })
  })
})
