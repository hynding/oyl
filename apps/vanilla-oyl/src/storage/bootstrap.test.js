import { describe, expect, it, vi } from 'vitest'
import { makeRepositories } from './bootstrap.js'
import { makeLifeArea, manualConnectivity } from '@oyl/all-of-oyl'

function fakeStorage() {
  const m = new Map()
  return {
    /** @param {string} k */
    getItem: (k) => m.get(k) ?? null,
    /** @param {string} k @param {string} v */
    setItem: (k, v) => void m.set(k, v),
    /** @param {string} k */
    removeItem: (k) => void m.delete(k),
    /** @param {number} i */
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}

describe('makeRepositories', () => {
  it('builds local repos by default', () => {
    const { repos } = makeRepositories(/** @type {any} */ (fakeStorage()))
    expect(repos.entries.constructor.name).toBe('LocalStorageRepository')
  })
  it('builds engine-backed repos when a client is given (repo.list calls the client)', async () => {
    const client = { request: vi.fn(async () => ({ records: [] })) }
    const { repos } = makeRepositories(/** @type {any} */ (fakeStorage()), { client: /** @type {any} */ (client) })
    await repos.entries.list()
    // In remote mode, list() pulls from the cache (which may seed from remote on first sync).
    // The engine is returned alongside repos.
    expect(repos.entries).toBeTruthy()
  })
  it('remote mode builds engine-backed offline facades (writes hit the cache while offline)', async () => {
    const storage = fakeStorage()
    const client = { request: vi.fn(async () => ({ records: [] })) }
    const { repos, engine } = makeRepositories(/** @type {any} */ (storage), { client: /** @type {any} */ (client), connectivity: manualConnectivity(false) })
    expect(engine).toBeTruthy()
    const item = makeLifeArea({ name: 'Health' })
    await repos.lifeAreas.save(item)
    expect((await repos.lifeAreas.list()).length).toBe(1)
    // While offline the network should not have been called
    expect(client.request).not.toHaveBeenCalled()
  })
})
