import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Consumable } from '../../index.js'
import { createConsumablesStore } from './consumables.js'

describe('consumables-store', () => {
  it('adds and lists consumables reactively', async () => {
    const store = createConsumablesStore((new InMemoryRepository() as any))
    await store.add(new Consumable({ name: 'Oatmeal', facts: { calories: 150 } }))
    expect(store.all().map((x) => x.name)).toEqual(['Oatmeal'])
  })
})
