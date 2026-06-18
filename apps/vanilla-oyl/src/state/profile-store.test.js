import { describe, expect, it, beforeEach } from 'vitest'
import { User } from '@oyl/all-of-oyl'
import { makeRepositories } from '../storage/bootstrap.js'
import { createProfileStore, resolveTimezone } from './profile-store.js'

beforeEach(() => localStorage.clear())

describe('resolveTimezone', () => {
  it('prefers the profile timezone, falls back to the browser tz', () => {
    const u = new User({ displayName: 'A', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(resolveTimezone(u, 'UTC')).toBe('Asia/Tokyo')
    expect(resolveTimezone(null, 'America/New_York')).toBe('America/New_York')
  })
})

describe('createProfileStore', () => {
  it('load() is null when no user record exists', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.load()
    expect(store.profile.get()).toBe(null)
  })

  it('save() creates a record, pins its id, and load() reads it back', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.save({ displayName: 'Avery', timezone: 'Asia/Tokyo', defaultCurrency: 'USD' })
    expect(store.profile.get()?.timezone).toBe('Asia/Tokyo')
    expect(localStorage.getItem('oyl/profile-id')).toBe(store.profile.get()?.id)

    const store2 = createProfileStore(repos, localStorage)
    await store2.load()
    expect(store2.profile.get()?.displayName).toBe('Avery')
  })

  it('save() merges a patch onto the existing record', async () => {
    const { repos } = makeRepositories(localStorage)
    const store = createProfileStore(repos, localStorage)
    await store.save({ displayName: 'Avery', timezone: 'UTC', defaultCurrency: 'USD' })
    await store.save({ weightKg: 80, units: 'metric' })
    expect(store.profile.get()?.weightKg).toBe(80)
    expect(store.profile.get()?.displayName).toBe('Avery') // preserved
  })
})
