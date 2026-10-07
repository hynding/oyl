import { describe, expect, it } from 'vitest'
import { InMemoryRepository, Account } from '../../index.js'
import { createAccountsStore } from './accounts.js'

describe('createAccountsStore', () => {
  it('add persists and appears in all()', async () => {
    const store = createAccountsStore((new InMemoryRepository() as any))
    const saved = await store.add(new Account({ name: 'Checking', currency: 'USD' }))
    expect(saved.name).toBe('Checking')
    expect(store.all().map((a) => a.name)).toEqual(['Checking'])
  })

  it('remove deletes by id', async () => {
    const store = createAccountsStore((new InMemoryRepository() as any))
    const a = await store.add(new Account({ name: 'Visa', currency: 'USD' }))
    await store.remove(a.id)
    expect(store.all()).toHaveLength(0)
  })

  it('hydrate rebuilds from the repository', async () => {
    const repo = (new InMemoryRepository() as any)
    await repo.save(new Account({ name: 'Savings', currency: 'EUR' }))
    const store = createAccountsStore(repo)
    expect(store.all()).toHaveLength(0)
    await store.hydrate()
    expect(store.all().map((a) => a.name)).toEqual(['Savings'])
  })
})
