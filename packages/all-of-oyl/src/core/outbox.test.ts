import { describe, it, expect, beforeEach } from 'vitest'
import { createOutbox } from './outbox.js'
import type { StorageLike } from './local-storage-repository.js'
import { Id } from './id.js'

function mem(): StorageLike { let v: string | null = null; return { getItem: () => v, setItem: (_k, val) => { v = val } } }
const at = () => new Date('2026-06-15T00:00:00Z')
const A = '11111111-1111-4111-8111-111111111111' as unknown as Id
const B = '22222222-2222-4222-8222-222222222222' as unknown as Id

describe('createOutbox', () => {
  let storage: StorageLike
  beforeEach(() => { storage = mem() })

  it('enqueues, counts, and lists FIFO', () => {
    const o = createOutbox(storage, 'oyl/outbox', at)
    o.enqueue('entries', 'save', A)
    o.enqueue('plans', 'save', B)
    expect(o.size()).toBe(2)
    expect(o.list().map((e) => e.collection)).toEqual(['entries', 'plans'])
  })

  it('coalesces per (collection,id): save+save → one, save+delete → delete, each a new seq', () => {
    const o = createOutbox(storage, 'k', at)
    const s1 = o.enqueue('entries', 'save', A)
    const s2 = o.enqueue('entries', 'save', A)
    expect(o.size()).toBe(1)
    expect(s2.seq).toBeGreaterThan(s1.seq)
    const d = o.enqueue('entries', 'delete', A)
    expect(o.size()).toBe(1)
    expect(o.list()[0]!.op).toBe('delete')
    expect(d.seq).toBeGreaterThan(s2.seq)
  })

  it('has() reports pending; removeIfSeq drops only on a matching seq', () => {
    const o = createOutbox(storage, 'k', at)
    const e = o.enqueue('entries', 'save', A)
    expect(o.has('entries', A)).toBe(true)
    o.removeIfSeq('entries', A, e.seq - 1)
    expect(o.has('entries', A)).toBe(true)
    o.removeIfSeq('entries', A, e.seq)
    expect(o.has('entries', A)).toBe(false)
  })

  it('survives reload and keeps seq monotonic', () => {
    const o1 = createOutbox(storage, 'k', at)
    const e1 = o1.enqueue('entries', 'save', A)
    const o2 = createOutbox(storage, 'k', at)
    expect(o2.has('entries', A)).toBe(true)
    const e2 = o2.enqueue('plans', 'save', B)
    expect(e2.seq).toBeGreaterThan(e1.seq)
  })

  it('markFailed / clearFailed / discardFailed', () => {
    const o = createOutbox(storage, 'k', at)
    o.enqueue('entries', 'save', A)
    o.enqueue('plans', 'save', B)
    o.markFailed('entries', A, 'boom')
    const failed = o.list().find((e) => e.id === String(A))
    expect(failed?.failedAt).toBeTruthy()
    expect(failed?.error).toBe('boom')
    expect(o.list().length).toBe(2) // failed entries still listed
    o.clearFailed()
    expect(o.list().find((e) => e.id === String(A))?.failedAt).toBeUndefined()
    o.markFailed('entries', A, 'again')
    o.discardFailed()
    expect(o.list().length).toBe(1)
    expect(o.list()[0]!.collection).toBe('plans')
  })
})
