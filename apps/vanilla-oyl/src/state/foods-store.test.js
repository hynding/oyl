import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Food } from '@oyl/all-of-oyl'
import { createFoodsStore } from './foods-store.js'

describe('foods-store', () => {
  it('adds, lists, and removes foods reactively', async () => {
    const store = createFoodsStore(/** @type {any} */ (new InMemoryRepository()))
    const f = await store.add(new Food({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    expect(store.all().map((x) => x.name)).toEqual(['Oatmeal'])
    await store.remove(f.id)
    expect(store.all()).toEqual([])
  })
})
