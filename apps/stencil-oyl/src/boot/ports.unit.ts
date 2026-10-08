import { describe, expect, it } from 'vitest'
import { browserDataPorts } from './ports.js'

describe('browserDataPorts', () => {
  it('mints outbox ids with crypto.randomUUID when available', () => {
    expect(browserDataPorts({ crypto: { randomUUID: () => 'uuid-1' } }).newId()).toBe('uuid-1')
  })
  it('falls back to the m-<time>-<rand> id without Web Crypto', () => {
    expect(browserDataPorts({}).newId()).toMatch(/^m-\d+-[a-z0-9]+$/)
  })
  it('reads navigator.storage.estimate, defaulting missing fields to 0', async () => {
    const ports = browserDataPorts({ navigator: { storage: { estimate: async () => ({ usage: 12 }) } } })
    expect(await ports.estimateStorage()).toEqual({ usage: 12, quota: 0 })
  })
  it('estimates null without the Storage API and reports the build marker', async () => {
    expect(await browserDataPorts({}).estimateStorage()).toBeNull()
    expect(browserDataPorts({}).build).toBe('dev')
    expect(browserDataPorts({ __OYL_LIB_BUILD__: 'abc' }).build).toBe('abc')
  })
})
