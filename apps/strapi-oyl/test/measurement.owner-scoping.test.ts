import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape } from '@oyl/all-of-oyl'
import { Measurement } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `measurementA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `measurementB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

// Writes go via PUT /measurements/<recordId> — the backend upserts by the domain recordId.
const putMeasurement = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/measurements/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listMeasurements = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/measurements`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('measurement content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/measurements`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the measurement; A sees it, B does not', async () => {
    const recordId = crypto.randomUUID()
    const res = await putMeasurement(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'body.weight_kg',
      value: 82.5,
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listMeasurements(jwtA)
    const bList = await listMeasurements(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it("a second PUT by A upserts (idempotent — one row, latest wins)", async () => {
    const recordId = crypto.randomUUID()
    const first = await putMeasurement(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'body.weight_kg',
      value: 80.0,
    })
    expect(first.status).toBe(200)
    const second = await putMeasurement(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'body.weight_kg',
      value: 82.5,
    })
    expect(second.status).toBe(200)

    const aList = await listMeasurements(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // upsert reconciled to a single row
    expect((matches[0] as any).value).toBeCloseTo(82.5) // latest write wins
  })

  it("B's PUT to A's recordId is refused (404) and leaves A's row untouched", async () => {
    const recordId = crypto.randomUUID()
    const res = await putMeasurement(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'body.weight_kg',
      value: 75.0,
    })
    expect(res.status).toBe(200)

    // recordId is globally unique and owned by A; B's PUT must not reach across owners
    const bPut = await putMeasurement(jwtB, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'body.weight_kg',
      value: 999.0,
    })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/measurements/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { value: number } }
    expect(aRow.data.value).toBeCloseTo(75.0) // untouched by B
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putMeasurement(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      metric: 'mood.score',
      value: 7,
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/measurements/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // Row should still exist for A
    const aGet = await fetch(`${baseUrl}/measurements/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('metric + value round-trip via Measurement.fromJSON (strapiRowToShape)', async () => {
    // recordId must be a UUID — strapiRowToShape maps it to `id`, and Id.of() validates UUID format
    const recordId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const res = await putMeasurement(jwtA, recordId, {
      occurredAt,
      metric: 'body.weight_kg',
      value: 82.5,
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/measurements/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via Measurement.fromJSON — exactly how the app would read measurements
    const shape = strapiRowToShape(row, { kind: 'measurement' })
    const measurement = Measurement.fromJSON(shape)

    expect(measurement.metric).toBe('body.weight_kg')
    expect(measurement.value).toBe(82.5)
  })
})
