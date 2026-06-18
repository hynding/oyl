import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `noteA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `noteB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const createNote = (jwt: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/notes`, {
    method: 'POST',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listNotes = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/notes`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('note content-type — owner scoping (booted)', () => {
  beforeEach(async () => {
    // Truncate via app if needed; tests use unique recordIds so isolation is per-user
  })

  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/notes`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('user A creates a note; user B list does NOT include it; user A list does', async () => {
    const recordId = `note-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createNote(jwtA, {
      recordId,
      text: 'My private note',
      tags: ['journal'],
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { data: { id: number } }
    expect(created.data.id).toBeTypeOf('number')

    const aList = await listNotes(jwtA)
    const bList = await listNotes(jwtB)

    const aHasIt = aList.some((r: any) => r.recordId === recordId)
    const bHasIt = bList.some((r: any) => r.recordId === recordId)

    expect(aHasIt).toBe(true)
    expect(bHasIt).toBe(false)
  })

  it('user B cannot read user A note by id', async () => {
    const res = await createNote(jwtA, {
      recordId: `note-id-test-${Date.now()}`,
      text: 'Another private note',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: number } }
    const noteId = data.id

    const bGet = await fetch(`${baseUrl}/notes/${noteId}`, { headers: h(jwtB) })
    expect(bGet.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/notes/${noteId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('user B cannot update user A note', async () => {
    const res = await createNote(jwtA, {
      recordId: `note-upd-test-${Date.now()}`,
      text: 'Note to protect from update',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: number } }
    const noteId = data.id

    const bPut = await fetch(`${baseUrl}/notes/${noteId}`, {
      method: 'PUT',
      headers: h(jwtB),
      body: JSON.stringify({ data: { text: 'tampered', occurredAt: new Date().toISOString() } }),
    })
    expect(bPut.status).toBe(404)

    // Note should still be readable by A (unchanged)
    const aGet = await fetch(`${baseUrl}/notes/${noteId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('user B cannot delete user A note', async () => {
    const res = await createNote(jwtA, {
      recordId: `note-del-test-${Date.now()}`,
      text: 'Note to protect',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: number } }
    const noteId = data.id

    const bDel = await fetch(`${baseUrl}/notes/${noteId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // Note should still exist for A
    const aGet = await fetch(`${baseUrl}/notes/${noteId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })
})
