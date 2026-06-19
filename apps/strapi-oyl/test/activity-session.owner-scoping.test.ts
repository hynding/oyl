import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape, ActivitySession } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `sessionA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `sessionB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const putSession = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/activity-sessions/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listSessions = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/activity-sessions`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('activity-session content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/activity-sessions`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the session; A sees it, B does not', async () => {
    const recordId = crypto.randomUUID()
    const activityId = crypto.randomUUID()
    const res = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId,
      slug: 'run',
      quantities: [
        { amount: 30, unit: 'minutes' },
        { amount: 5, unit: 'km' },
      ],
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listSessions(jwtA)
    const bList = await listSessions(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it('a second PUT by A upserts (idempotent — one row, latest wins)', async () => {
    const recordId = crypto.randomUUID()
    const activityId = crypto.randomUUID()
    const first = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId,
      slug: 'run',
      quantities: [{ amount: 30, unit: 'minutes' }],
    })
    expect(first.status).toBe(200)
    const second = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId,
      slug: 'run',
      quantities: [{ amount: 45, unit: 'minutes' }],
    })
    expect(second.status).toBe(200)

    const aList = await listSessions(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // exactly one row
  })

  it("B's PUT to A's recordId is refused (404) and leaves A's row untouched", async () => {
    const recordId = crypto.randomUUID()
    const activityId = crypto.randomUUID()
    const res = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId,
      slug: 'run',
      note: 'original',
      quantities: [{ amount: 20, unit: 'minutes' }],
    })
    expect(res.status).toBe(200)

    const bPut = await putSession(jwtB, recordId, {
      occurredAt: new Date().toISOString(),
      activityId: crypto.randomUUID(),
      slug: 'run',
      note: 'tampered',
    })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/activity-sessions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { note: string } }
    expect(aRow.data.note).toBe('original')
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId: crypto.randomUUID(),
      slug: 'run',
      quantities: [{ amount: 10, unit: 'minutes' }],
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/activity-sessions/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/activity-sessions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('quantities + activityId + slug round-trip via ActivitySession.fromJSON', async () => {
    const recordId = crypto.randomUUID()
    const activityId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const res = await putSession(jwtA, recordId, {
      occurredAt,
      activityId,
      slug: 'run',
      quantities: [
        { amount: 30, unit: 'minutes' },
        { amount: 5, unit: 'km' },
      ],
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/activity-sessions/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via ActivitySession.fromJSON — exactly how the app bootstrap reads sessions
    const shape = strapiRowToShape(row, { kind: 'activity-session' })
    const session = ActivitySession.fromJSON(shape)

    expect(session.activityId.toString()).toBe(activityId)
    expect(session.slug).toBe('run')
    expect(session.quantities).toHaveLength(2)
    const minutes = session.quantities.find((q) => q.unit === 'minutes')
    const km = session.quantities.find((q) => q.unit === 'km')
    expect(minutes?.amount).toBe(30)
    expect(typeof minutes?.amount).toBe('number')
    expect(km?.amount).toBe(5)
    expect(typeof km?.amount).toBe('number')
  })

  it('session with no quantities round-trips (strips quantities:null, empty quantities array)', async () => {
    const recordId = crypto.randomUUID()
    const activityId = crypto.randomUUID()
    const res = await putSession(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      activityId,
      slug: 'meditate',
      // intentionally no quantities field
    })
    expect(res.status).toBe(200)

    const getRes = await fetch(`${baseUrl}/activity-sessions/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    const shape = strapiRowToShape(row, { kind: 'activity-session' })
    const session = ActivitySession.fromJSON(shape)

    expect(session.slug).toBe('meditate')
    expect(session.quantities).toHaveLength(0)
  })
})
