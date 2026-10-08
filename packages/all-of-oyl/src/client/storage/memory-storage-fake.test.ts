import { describe, expect, it } from 'vitest'
import { memoryStorage } from './memory-storage-fake.js'

describe('memoryStorage', () => {
  it('behaves like localStorage for get/set/remove/key/length/clear', () => {
    const s = memoryStorage({ a: '1' })
    expect(s.getItem('a')).toBe('1')
    expect(s.getItem('missing')).toBeNull()
    s.setItem('b', '2')
    expect(s.length).toBe(2)
    expect([s.key(0), s.key(1)]).toEqual(['a', 'b'])
    expect(s.key(9)).toBeNull()
    s.removeItem('a')
    expect(s.length).toBe(1)
    s.clear()
    expect(s.length).toBe(0)
  })
})
