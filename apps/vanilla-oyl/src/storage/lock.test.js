import { describe, it, expect, vi } from 'vitest'
import { createBrowserLock } from './lock.js'

describe('createBrowserLock', () => {
  it('uses navigator.locks.request when available (holds during fn)', async () => {
    /** @type {string[]} */
    const requested = []
    const win = { navigator: { locks: { request: (/** @type {string} */ name, /** @type {() => any} */ fn) => { requested.push(name); return Promise.resolve(fn()) } } } }
    const lock = createBrowserLock(/** @type {any} */ (win))
    const ran = vi.fn(async () => {})
    await lock.runExclusive('oyl-flush', ran)
    expect(requested).toEqual(['oyl-flush'])
    expect(ran).toHaveBeenCalledOnce()
  })

  it('falls back to running fn directly when navigator.locks is absent', async () => {
    const win = { navigator: {} }
    const lock = createBrowserLock(/** @type {any} */ (win))
    const ran = vi.fn(async () => {})
    await lock.runExclusive('oyl-flush', ran)
    expect(ran).toHaveBeenCalledOnce()
  })
})
