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

// Writes go via PUT /notes/<recordId> — the backend upserts by the domain recordId.
const putNote = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/notes/${recordId}`, {
    method: 'PUT',
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

  it('PUT to a new recordId creates the note (upsert); A sees it, B does not', async () => {
    const recordId = `note-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await putNote(jwtA, recordId, {
      text: 'My private note',
      tags: ['journal'],
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listNotes(jwtA)
    const bList = await listNotes(jwtB)

    const aHasIt = aList.some((r: any) => r.recordId === recordId)
    const bHasIt = bList.some((r: any) => r.recordId === recordId)

    expect(aHasIt).toBe(true)
    expect(bHasIt).toBe(false)
  })

  it('a second PUT to the same recordId updates in place — one row, no duplicate (idempotent upsert)', async () => {
    const recordId = `note-upsert-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const first = await putNote(jwtA, recordId, { text: 'v1', occurredAt: new Date().toISOString() })
    expect(first.status).toBe(200)
    const second = await putNote(jwtA, recordId, { text: 'v2', occurredAt: new Date().toISOString() })
    expect(second.status).toBe(200)

    const aList = await listNotes(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // upsert reconciled to a single row
    expect((matches[0] as any).text).toBe('v2') // latest write wins
  })

  it('user B cannot read user A note by recordId', async () => {
    const recordId = `note-id-test-${Date.now()}`
    const res = await putNote(jwtA, recordId, {
      text: 'Another private note',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)

    const bGet = await fetch(`${baseUrl}/notes/${recordId}`, { headers: h(jwtB) })
    expect(bGet.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/notes/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('a cross-user PUT to A\'s recordId is refused (404) and never touches A\'s row', async () => {
    const recordId = `note-upd-test-${Date.now()}`
    const res = await putNote(jwtA, recordId, {
      text: 'Note to protect from update',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)

    // recordId is globally unique and owned by A; B's PUT must not reach across owners
    // nor create a colliding row → 404.
    const bPut = await putNote(jwtB, recordId, { text: 'tampered', occurredAt: new Date().toISOString() })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/notes/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { text: string } }
    expect(aRow.data.text).toBe('Note to protect from update') // untouched by B
  })

  it('user B cannot delete user A note by recordId (404, idempotent)', async () => {
    const recordId = `note-del-test-${Date.now()}`
    const res = await putNote(jwtA, recordId, {
      text: 'Note to protect',
      occurredAt: new Date().toISOString(),
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/notes/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // Note should still exist for A
    const aGet = await fetch(`${baseUrl}/notes/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })
})
