import { describe, expect, it } from 'vitest'
import { PREFIX, SCHEMA_VERSION_KEY, SETTINGS_KEY, dataKey, isOylKey } from './keys.js'

describe('storage keys', () => {
  it('namespaces every key under oyl/', () => {
    expect(SCHEMA_VERSION_KEY).toBe('oyl/schema-version')
    expect(SETTINGS_KEY).toBe('oyl/settings')
    expect(dataKey('entries')).toBe('oyl/data/entries')
    expect(PREFIX).toBe('oyl/')
  })

  it('recognizes its own keys and rejects foreign ones', () => {
    expect(isOylKey('oyl/data/entries')).toBe(true)
    expect(isOylKey('oyl/settings')).toBe(true)
    expect(isOylKey('some-other-app')).toBe(false)
  })
})
