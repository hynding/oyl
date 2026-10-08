import { describe, expect, it, vi } from 'vitest'
import { signal } from './signal.js'
import { effect } from './effect.js'

describe('effect', () => {
  it('runs synchronously on creation', () => {
    const run = vi.fn()
    effect(run)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('batches multiple writes in one tick into a single re-run', async () => {
    const a = signal(1)
    const b = signal(2)
    const run = vi.fn(() => a.get() + b.get())
    effect(run)
    a.set(10)
    b.set(20)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('stops re-running after dispose() and drops its subscriptions', async () => {
    const count = signal(0)
    const run = vi.fn(() => count.get())
    const dispose = effect(run)
    dispose()
    count.set(1)
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('re-tracks dependencies each run (dynamic dependency sets)', async () => {
    const toggle = signal(true)
    const a = signal('a')
    const b = signal('b')
    const seen: string[] = []
    effect(() => seen.push(toggle.get() ? a.get() : b.get()))
    toggle.set(false)
    await Promise.resolve()
    a.set('a2')
    await Promise.resolve()
    expect(seen).toEqual(['a', 'b'])
  })

  it('detects a cycle (effect writing a signal it reads)', async () => {
    const n = signal(0)
    expect(() => {
      effect(() => {
        n.set(n.get() + 1)
      })
    }).toThrow(/cycle/i)
  })

  it('aborts a non-settling update loop with console.error instead of hanging', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const a = signal(0)
      const b = signal(0)
      // Two effects ping-pong: each writes the signal the other reads, so the batch never settles.
      const stop1 = effect(() => { b.set(a.get() + 1) })
      const stop2 = effect(() => { a.set(b.get() + 1) })
      await new Promise((r) => setTimeout(r, 0))
      expect(error).toHaveBeenCalledWith(expect.stringContaining('aborting update loop'))
      stop1(); stop2()
    } finally {
      error.mockRestore()
    }
  })
})
