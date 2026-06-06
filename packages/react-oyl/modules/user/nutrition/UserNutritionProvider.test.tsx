import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UserNutritionProvider } from './UserNutritionProvider'
import { useUserNutritionContext } from './user-nutrition-context'

const save = vi.fn().mockResolvedValue(undefined)
const update = vi.fn().mockResolvedValue(undefined)

vi.mock('@/modules/data', () => ({
  useData: () => ({
    find: () => [],
    get: () => undefined,
    save,
    update,
    remove: vi.fn(),
    refresh: vi.fn(),
    syncState: { pendingCount: 0, online: true },
  }),
}))

function Probe() {
  const ctx = useUserNutritionContext()
  return (
    <div>
      <button onClick={() => ctx.addNutrition({ servings: 1 })}>add</button>
      <button onClick={() => ctx.removeNutrition(42)}>remove</button>
    </div>
  )
}

describe('UserNutritionProvider', () => {
  it('addNutrition delegates to data.save', async () => {
    render(<UserNutritionProvider><Probe /></UserNutritionProvider>)
    await act(async () => { screen.getByText('add').click() })
    expect(save).toHaveBeenCalledWith({ servings: 1 })
  })

  it('removeNutrition soft-deletes via data.update', async () => {
    render(<UserNutritionProvider><Probe /></UserNutritionProvider>)
    await act(async () => { screen.getByText('remove').click() })
    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ deleted_at: expect.any(String) }))
  })
})
