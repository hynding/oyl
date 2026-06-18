import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Consumable } from '@oyl/all-of-oyl'
import { createConsumablesStore } from './consumables-store.js'

describe('consumables-store', () => {
  it('adds and lists consumables reactively', async () => {
    const store = createConsumablesStore(/** @type {any} */ (new InMemoryRepository()))
    await store.add(new Consumable({ name: 'Oatmeal', nutrients: { calories: 150 } }))
    expect(store.all().map((x) => x.name)).toEqual(['Oatmeal'])
  })
})
