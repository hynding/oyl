import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TDataId, TNutritionItemData, TUserNutritionData } from '@oyl/all-of-oyl/modules'
import UserNutritionsPage from './UserNutritionsPage'

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

const nutritionCtx = {
  nutritions,
  addNutrition: vi.fn(async (_input: Partial<TUserNutritionData>) => {}),
  updateNutrition: vi.fn(async (_id: TDataId, _patch: Partial<TUserNutritionData>) => {}),
  removeNutrition: vi.fn(async (_id: TDataId) => {}),
}

vi.mock('@/modules/user/nutrition', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/user/nutrition')>()
  return {
    ...actual,
    useUserNutritionContext: () => nutritionCtx,
    UserNutritionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

vi.mock('@/modules/user/profile/useUserProfile', () => ({
  useUserProfile: () => ({
    documentId: 'p-1', timezone: 'UTC', loading: false, error: null, setTimezone: vi.fn(),
  }),
}))

describe('UserNutritionsPage', () => {
  afterEach(() => {
    nutritionCtx.addNutrition.mockClear()
    nutritionCtx.updateNutrition.mockClear()
    nutritionCtx.removeNutrition.mockClear()
  })

  it('renders heading "My Nutrition" and pantry items derived from context', () => {
    render(<UserNutritionsPage />)
    expect(screen.getByRole('heading', { name: 'My Nutrition' })).toBeInTheDocument()
    expect(screen.getByText('Oatmeal')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
  })
})
