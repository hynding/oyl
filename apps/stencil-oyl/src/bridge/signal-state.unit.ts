import { describe, expect, it } from 'vitest'
import { signal } from '@oyl/all-of-oyl/client'
import { bindSignal } from './signal-state.js'

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('bindSignal', () => {
  it('applies the current value immediately and again on change', async () => {
    const s = signal('a')
    const seen: string[] = []
    const stop = bindSignal(s, (v) => seen.push(v))
    expect(seen).toEqual(['a'])
    s.set('b')
    await tick()
    expect(seen).toEqual(['a', 'b'])
    stop()
  })

  it('stops applying after dispose', async () => {
    const s = signal(1)
    const seen: number[] = []
    const stop = bindSignal(s, (v) => seen.push(v))
    stop()
    s.set(2)
    await tick()
    expect(seen).toEqual([1])
  })
})
