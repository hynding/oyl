import { describe, expect, it } from 'vitest'
import { createWriteOutbox } from './write-outbox.js'

function mem() { const m = new Map<string,string>(); return { getItem:(k:string)=>m.get(k)??null, setItem:(k:string,v:string)=>{m.set(k,v)}, removeItem:(k:string)=>{m.delete(k)} } as any }
const fixedNow = () => new Date('2026-06-18T00:00:00Z')

describe('createWriteOutbox', () => {
  it('enqueues, persists across instances, preserves FIFO, and acks', () => {
    const s = mem(); let n = 0; const id = () => `m${++n}`
    const ob = createWriteOutbox(s, 'oyl/outbox', fixedNow, id)
    ob.enqueue({ entity: 'note', op: 'save', payload: { id: 'a' }, baseUpdatedAt: null })
    ob.enqueue({ entity: 'note', op: 'delete', payload: { id: 'b' }, baseUpdatedAt: '2026-01-01' })
    expect(ob.size()).toBe(2)
    const reloaded = createWriteOutbox(s, 'oyl/outbox', fixedNow, id) // durable
    expect(reloaded.peekAll().map((m) => m.payload)).toEqual([{ id: 'a' }, { id: 'b' }])
    reloaded.ack(reloaded.peekAll()[0].id)
    expect(reloaded.peekAll().map((m) => (m.payload as any).id)).toEqual(['b'])
  })

  it('invokes onEnqueue after each enqueue (same-tab flush trigger), once per enqueue', () => {
    const s = mem(); let n = 0; const id = () => `m${++n}`
    let calls = 0
    const ob = createWriteOutbox(s, 'oyl/outbox', fixedNow, id, () => { calls += 1 })
    ob.enqueue({ entity: 'note', op: 'save', payload: { id: 'a' }, baseUpdatedAt: null })
    expect(calls).toBe(1)
    ob.enqueue({ entity: 'note', op: 'save', payload: { id: 'b' }, baseUpdatedAt: null })
    expect(calls).toBe(2)
  })
})
