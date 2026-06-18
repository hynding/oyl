import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Consumable } from '@oyl/all-of-oyl'
import { createConsumablesStore } from './consumables-store.js'

describe('consumables-store', () => {
  it('adds, lists, and removes consumables reactively', async () => {
    const store = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    const c = await store.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    expect(store.all().map((x) => x.name)).toEqual(['Oatmeal'])
    await store.remove(c.id)
    expect(store.all()).toEqual([])
  })
})
