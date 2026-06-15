import { describe, expect, it, vi } from 'vitest'
import { makeRepositories } from './bootstrap.js'

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
    const repos = makeRepositories(/** @type {any} */ (fakeStorage()))
    expect(repos.entries.constructor.name).toBe('LocalStorageRepository')
  })
  it('builds http repos when a client is given (repo.list calls the client)', async () => {
    const client = { request: vi.fn(async () => ({ records: [] })) }
    const repos = makeRepositories(/** @type {any} */ (fakeStorage()), { client: /** @type {any} */ (client) })
    await repos.entries.list()
    expect(client.request).toHaveBeenCalledWith('GET', '/entries')
  })
})
