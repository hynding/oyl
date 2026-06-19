import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape } from '@oyl/all-of-oyl'
import { Consumption } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `consumptionA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `consumptionB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const putConsumption = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/consumptions/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listConsumptions = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/consumptions`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

const sampleNutrients = {
  calories: 350,
  protein: 12,
  totalFat: 10,
  servingSize: { amount: 100, unit: 'g' },
  additional: [{ slug: 'vitamin-c', amount: 6 }],
}

const sampleLoggedAmount = { amount: 250, unit: 'g' }

describe('consumption content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/consumptions`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the consumption; A sees it, B does not', async () => {
    const recordId = `cons-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await putConsumption(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 1.5,
      consumableId: 'cons-id-abc',
      loggedAmount: sampleLoggedAmount,
      nutrients: sampleNutrients,
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listConsumptions(jwtA)
    const bList = await listConsumptions(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it('a second PUT by A upserts (idempotent — one row, latest wins)', async () => {
    const recordId = `cons-upsert-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const first = await putConsumption(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 1,
      nutrients: sampleNutrients,
    })
    expect(first.status).toBe(200)
    const second = await putConsumption(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 2,
      nutrients: sampleNutrients,
    })
    expect(second.status).toBe(200)

    const aList = await listConsumptions(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // exactly one row
    expect((matches[0] as any).servings).toBeCloseTo(2)
  })

  it("B's PUT to A's recordId is refused (404) and leaves A's row untouched", async () => {
    const recordId = `cons-xown-${Date.now()}`
    const res = await putConsumption(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 1,
      nutrients: sampleNutrients,
      note: 'original',
    })
    expect(res.status).toBe(200)

    const bPut = await putConsumption(jwtB, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 99,
      nutrients: sampleNutrients,
      note: 'tampered',
    })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/consumptions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { note: string } }
    expect(aRow.data.note).toBe('original')
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = `cons-del-${Date.now()}`
    const res = await putConsumption(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      servings: 1,
      nutrients: sampleNutrients,
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/consumptions/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/consumptions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('nutrients snapshot + servings + loggedAmount round-trip via Consumption.fromJSON', async () => {
    // recordId must be a UUID — strapiRowToShape maps it to `id`, and Id.of() validates UUID format
    const recordId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const consumableId = crypto.randomUUID()
    const res = await putConsumption(jwtA, recordId, {
      occurredAt,
      servings: 2.5,
      consumableId,
      loggedAmount: { amount: 250, unit: 'g' },
      nutrients: {
        calories: 400,
        protein: 20,
        totalFat: 15,
        totalCarbohydrate: 30,
        servingSize: { amount: 100, unit: 'g', household: '1 cup' },
        additional: [
          { slug: 'vitamin-c', amount: 6 },
          { slug: 'iron', amount: 2 },
        ],
      },
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/consumptions/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via Consumption.fromJSON — exactly how the app bootstrap reads consumptions
    const shape = strapiRowToShape(row, { kind: 'consumption' })
    const consumption = Consumption.fromJSON(shape)

    expect(consumption.servings).toBe(2.5)
    expect(consumption.consumableId?.toString()).toBe(consumableId)
    expect(consumption.loggedAmount).toEqual({ amount: 250, unit: 'g' })
    expect(consumption.nutrients.calories).toBe(400)
    expect(consumption.nutrients.protein).toBe(20)
    expect(consumption.nutrients.totalFat).toBe(15)
    expect(consumption.nutrients.totalCarbohydrate).toBe(30)
    expect(consumption.nutrients.servingSize?.amount).toBe(100)
    expect(consumption.nutrients.servingSize?.unit).toBe('g')
    const additional = consumption.nutrients.additional ?? []
    expect(additional).toHaveLength(2)
    expect(additional.find((a) => a.slug === 'vitamin-c')?.amount).toBe(6)
    expect(additional.find((a) => a.slug === 'iron')?.amount).toBe(2)
  })
})
