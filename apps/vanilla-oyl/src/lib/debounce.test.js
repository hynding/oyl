import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce.js'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('coalesces rapid calls into one trailing invocation', () => {
    const fn = vi.fn()
    const d = debounce(fn, 150)
    d(); d(); d()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('runs again after the window resets', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d(); vi.advanceTimersByTime(100)
    d(); vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
