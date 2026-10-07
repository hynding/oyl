import { describe, expect, it, beforeEach } from 'vitest'
import { User, InMemoryRepository } from '../../index.js'
import { memoryStorage } from '../storage/memory-storage-fake.js'
import { createProfileStore, resolveTimezone } from './profile.js'

let storage = memoryStorage()
beforeEach(() => { storage = memoryStorage() })

/** Conformant in-memory repos for the profile store (server repos don't round-trip locally). */
function makeRepos(): any {
  return { users: new InMemoryRepository() }
}

describe('resolveTimezone', () => {
  it('prefers the profile timezone, falls back to the browser tz', () => {
    const u = new User({ displayName: 'A', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(resolveTimezone(u, 'UTC')).toBe('Asia/Tokyo')
    expect(resolveTimezone(null, 'America/New_York')).toBe('America/New_York')
  })
})

describe('createProfileStore', () => {
  it('load() is null when no user record exists', async () => {
    const repos = makeRepos()
    const store = createProfileStore(repos, storage)
    await store.load()
    expect(store.profile.get()).toBe(null)
  })

  it('save() creates a record, pins its id, and load() reads it back', async () => {
    const repos = makeRepos()
    const store = createProfileStore(repos, storage)
    await store.save({ displayName: 'Avery', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(store.profile.get()?.timezone).toBe('Asia/Tokyo')
    expect(storage.getItem('oyl/profile-id')).toBe(store.profile.get()?.id)

    const store2 = createProfileStore(repos, storage)
    await store2.load()
    expect(store2.profile.get()?.displayName).toBe('Avery')
  })

  it('save() merges a patch onto the existing record', async () => {
    const repos = makeRepos()
    const store = createProfileStore(repos, storage)
    await store.save({ displayName: 'Avery', timezone: 'UTC', defaultCurrency: 'USD' })
    await store.save({ weightKg: 80, units: 'metric' })
    expect(store.profile.get()?.weightKg).toBe(80)
    expect(store.profile.get()?.displayName).toBe('Avery') // preserved
  })
})
