import { describe, expect, it } from 'vitest'
import { createNoticeState } from './notice.js'

describe('createNoticeState', () => {
  it('show sets and clear resets the notice signal', () => {
    const n = createNoticeState()
    expect(n.notice.get()).toBeNull()
    n.show('boom'); expect(n.notice.get()).toBe('boom')
    n.clear(); expect(n.notice.get()).toBeNull()
  })
})
