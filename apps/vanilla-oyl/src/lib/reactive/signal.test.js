import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { effect } from './effect.js'

describe('signal', () => {
  it('holds and updates a value', () => {
    const count = signal(0)
    expect(count.get()).toBe(0)
    count.set(5)
    expect(count.get()).toBe(5)
  })

  it('notifies a tracking effect on change', async () => {
    const count = signal(0)
    /** @type {number[]} */
    const seen = []
    effect(() => seen.push(count.get()))
    count.set(1)
    await Promise.resolve()
    expect(seen).toEqual([0, 1])
  })

  it('suppresses notification when the value is Object.is-equal', async () => {
    const count = signal(0)
    const run = vi.fn(() => count.get())
    effect(run)
    count.set(0)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('honors a custom equality comparator', async () => {
    const point = signal({ x: 1 }, (a, b) => a.x === b.x)
    const run = vi.fn(() => point.get())
    effect(run)
    point.set({ x: 1 })
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })
})
