import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { computed } from './computed.js'
import { effect } from './effect.js'

describe('computed', () => {
  it('derives a value from signals', () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get())
    expect(sum.get()).toBe(5)
  })

  it('recomputes lazily and caches between source changes', () => {
    const a = signal(2)
    const fn = vi.fn(() => a.get() * 2)
    const double = computed(fn)
    expect(double.get()).toBe(4)
    expect(double.get()).toBe(4)
    expect(fn).toHaveBeenCalledTimes(1)
    a.set(5)
    expect(double.get()).toBe(10)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('drives a dependent effect when its sources change', async () => {
    const a = signal(1)
    const triple = computed(() => a.get() * 3)
    /** @type {number[]} */
    const seen = []
    effect(() => seen.push(triple.get()))
    a.set(2)
    await Promise.resolve()
    expect(seen).toEqual([3, 6])
  })
})
