// packages/react-oyl/modules/data/sync/SyncEngine.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncEngine } from './SyncEngine'
import type { RemoteClient } from '../useDataRemote'

const mockRemote = (): RemoteClient => ({
  findAll: vi.fn(async () => []),
  findOne: vi.fn(async () => undefined),
  create: vi.fn(async (_p, b) => ({ id: 999, ...(b as object) }) as never),
  update: vi.fn(async (_p, id, b) => ({ id, ...(b as object) }) as never),
  remove: vi.fn(async () => {}),
})

describe('SyncEngine — read/write/subscribe', () => {
  beforeEach(() => localStorage.clear())

  it('starts with empty mirror and emits no events', () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    expect(e.readAll('user-activities')).toEqual([])
  })

  it('save() inserts a tempId row into the mirror and notifies subscribers', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    const cb = vi.fn()
    e.subscribe('user-activities', cb)
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.readAll('user-activities')).toHaveLength(1)
    expect(e.readAll<{ id: unknown }>('user-activities')[0].id).toMatch(/^local-/)
    expect(cb).toHaveBeenCalled()
  })

  it('save() enqueues a create op', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.state().pendingCount).toBe(1)
  })

  it('remove() removes from mirror and enqueues delete', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    // seed a non-pending row
    const remote = mockRemote()
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 5, name: 'x' }])
    const e2 = new SyncEngine(remote)
    e2.setUser('u1')
    await e2.refresh('user-activities')
    expect(e2.readAll('user-activities')).toHaveLength(1)
    await e2.remove('user-activities', 5, { skipDrain: true })
    expect(e2.readAll('user-activities')).toHaveLength(0)
    expect(e2.state().pendingCount).toBe(1)
  })

  it('wipe() clears the namespaced mirror and queue', async () => {
    const e = new SyncEngine(mockRemote())
    e.setUser('u1')
    await e.save('user-activities', { name: 'walk' }, { skipDrain: true })
    expect(e.readAll('user-activities')).toHaveLength(1)
    e.wipe()
    expect(e.readAll('user-activities')).toHaveLength(0)
    expect(e.state().pendingCount).toBe(0)
  })

  it('refresh() pulls remote and writes mirror', async () => {
    const remote = mockRemote()
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    const e = new SyncEngine(remote)
    e.setUser('u1')
    await e.refresh('user-activities')
    expect(e.readAll('user-activities')).toHaveLength(2)
    expect(e.state().lastSyncedAt).toBeDefined()
  })
})

describe('SyncEngine — drain', () => {
  beforeEach(() => localStorage.clear())

  it('drain promotes tempId to server id on create', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 42, name: 'walk' })
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'walk' })
    expect(e.readAll<{ id: unknown }>('user-activities')[0].id).toBe(42)
    expect(e.state().pendingCount).toBe(0)
  })

  it('drain rolls back create on failure', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'walk' })
    expect(e.readAll('user-activities')).toHaveLength(0)
    expect(e.state().pendingCount).toBe(0)
  })

  it('drains the queue when transitioning offline → online', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'srv-1', name: 'created' })
    const engine = new SyncEngine(remote)
    engine.setUser('u1')
    engine.setOnline(false)               // start offline so save() doesn't drain
    await engine.save('user-activities', { name: 'created' })
    expect(remote.create).not.toHaveBeenCalled()
    expect(engine.state().pendingCount).toBe(1)

    engine.setOnline(true)                // transition triggers drain
    await vi.waitFor(() => expect(engine.state().pendingCount).toBe(0))
    expect(remote.create).toHaveBeenCalledOnce()
  })
})
