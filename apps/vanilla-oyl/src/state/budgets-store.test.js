import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Budget, Money } from '@oyl/all-of-oyl'
import { createBudgetsStore } from './budgets-store.js'

/** @param {string} [cat] @returns {Budget} */
const budget = (cat = 'groceries') => new Budget({ category: cat, limit: Money.of(220000, 'USD', 2) })

describe('createBudgetsStore', () => {
  it('add persists and reflects in all(); remove deletes', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    const store = createBudgetsStore(repo)
    const saved = await store.add(budget())
    expect(store.all()).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await store.remove(saved.id)
    expect(store.all()).toHaveLength(0)
  })

  it('hydrate rebuilds from the repo', async () => {
    const repo = /** @type {any} */ (new InMemoryRepository())
    await repo.save(budget('dining'))
    const store = createBudgetsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all()).toHaveLength(1)
  })
})
