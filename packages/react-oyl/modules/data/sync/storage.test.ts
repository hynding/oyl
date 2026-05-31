// packages/react-oyl/modules/data/sync/storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mirrorKey, queueKey, readMirror, writeMirror, readQueue, writeQueue, wipeUser } from './storage'

describe('storage keys', () => {
  it('mirrorKey namespaces by user and path', () => {
    expect(mirrorKey('user-42', 'user-activities')).toBe('oyl:user-42:user-activities')
  })

  it('queueKey namespaces by user', () => {
    expect(queueKey('user-42')).toBe('oyl:user-42:__sync_queue__')
  })
})

describe('mirror read/write', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty object when nothing stored', () => {
    expect(readMirror('user-1', 'user-activities')).toEqual({})
  })

  it('round-trips a mirror payload', () => {
    writeMirror('user-1', 'user-activities', { 7: { id: 7, name: 'walk' } })
    expect(readMirror('user-1', 'user-activities')).toEqual({ 7: { id: 7, name: 'walk' } })
  })
})

describe('queue read/write', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty array when nothing stored', () => {
    expect(readQueue('user-1')).toEqual([])
  })

  it('round-trips a queue', () => {
    const op = { id: 'op-1', op: 'create' as const, path: 'user-activity-logs', tempId: 'local-x', body: {}, createdAt: 1 }
    writeQueue('user-1', [op])
    expect(readQueue('user-1')).toEqual([op])
  })
})

describe('wipeUser', () => {
  beforeEach(() => localStorage.clear())

  it('removes only that user\'s keys', () => {
    writeMirror('user-1', 'user-activities', { 1: { id: 1 } })
    writeMirror('user-2', 'user-activities', { 2: { id: 2 } })
    writeQueue('user-1', [])
    wipeUser('user-1')
    expect(readMirror('user-1', 'user-activities')).toEqual({})
    expect(readMirror('user-2', 'user-activities')).toEqual({ 2: { id: 2 } })
  })
})
