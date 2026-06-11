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
  findAggregate: vi.fn(async (date: string) => ({ date, paths: {} })),
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
    expect(e.state().lastSyncedAtByPath['user-activities']).toBeDefined()
  })

  it('refresh(maxAgeMs) short-circuits when the path is already fresh', async () => {
    const remote = mockRemote()
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 1 }])
    const e = new SyncEngine(remote)
    e.setUser('u1')
    await e.refresh('user-activities')
    expect(remote.findAll).toHaveBeenCalledTimes(1)
    await e.refresh('user-activities', { maxAgeMs: 60_000 })
    expect(remote.findAll).toHaveBeenCalledTimes(1) // skipped
  })

  it('seed() writes mirror without hitting remote', () => {
    const remote = mockRemote()
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.seed('user-activities', [{ id: 1, name: 'seeded' } as { id: number }])
    expect(e.readAll('user-activities')).toHaveLength(1)
    expect(remote.findAll).not.toHaveBeenCalled()
    expect(e.state().lastSyncedAtByPath['user-activities']).toBeDefined()
  })

  it('refreshAggregate() seeds every path from one call', async () => {
    const remote = mockRemote()
    ;(remote.findAggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      date: '2026-06-08',
      paths: {
        'user-activities': [{ id: 10, name: 'a' }],
        'user-goals': [{ id: 20, name: 'g' }],
      },
    })
    const e = new SyncEngine(remote)
    e.setUser('u1')
    await e.refreshAggregate('2026-06-08')
    expect(remote.findAll).not.toHaveBeenCalled()
    expect(e.readAll('user-activities')).toHaveLength(1)
    expect(e.readAll('user-goals')).toHaveLength(1)
  })

  it('refresh() dedupes concurrent calls into a single remote request', async () => {
    const remote = mockRemote()
    let resolveFetch!: (rows: { id: number }[]) => void
    ;(remote.findAll as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((res) => { resolveFetch = res as never }),
    )
    const e = new SyncEngine(remote)
    e.setUser('u1')
    // Fire two concurrent refreshes — StrictMode's double-mount shape.
    const p1 = e.refresh('user-activities')
    const p2 = e.refresh('user-activities')
    resolveFetch([{ id: 1 }])
    await Promise.all([p1, p2])
    expect(remote.findAll).toHaveBeenCalledTimes(1)
  })

  it('refreshAggregate() dedupes concurrent calls for the same date', async () => {
    const remote = mockRemote()
    let resolveAgg!: (payload: { date: string; paths: Record<string, unknown[]> }) => void
    ;(remote.findAggregate as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((res) => { resolveAgg = res as never }),
    )
    const e = new SyncEngine(remote)
    e.setUser('u1')
    const p1 = e.refreshAggregate('2026-06-08')
    const p2 = e.refreshAggregate('2026-06-08')
    resolveAgg({ date: '2026-06-08', paths: {} })
    await Promise.all([p1, p2])
    expect(remote.findAggregate).toHaveBeenCalledTimes(1)
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

  it('drain failure populates state().lastError', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'walk' })
    expect(e.state().lastError).toMatchObject({
      op: 'create',
      path: 'user-activities',
      message: 'boom',
    })
  })

  it('drain success clears a previous lastError', async () => {
    const remote = mockRemote()
    ;(remote.create as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 1, name: 'ok' })
    const e = new SyncEngine(remote)
    e.setUser('u1')
    e.setOnline(true)
    await e.save('user-activities', { name: 'fails' })
    expect(e.state().lastError).toBeDefined()
    await e.save('user-activities', { name: 'works' })
    expect(e.state().lastError).toBeUndefined()
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
