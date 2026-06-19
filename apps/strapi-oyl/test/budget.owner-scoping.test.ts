import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape, Budget } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `budgetA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `budgetB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const putBudget = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/budgets/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listBudgets = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/budgets`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('budget content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/budgets`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the budget; A sees it, B does not', async () => {
    const recordId = crypto.randomUUID()
    const res = await putBudget(jwtA, recordId, {
      name: 'Food money',
      category: 'groceries',
      limit: { minor: 100000, currency: 'USD', exponent: 2 },
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listBudgets(jwtA)
    const bList = await listBudgets(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it('a second PUT by A upserts (idempotent — one row, latest wins)', async () => {
    const recordId = crypto.randomUUID()
    const first = await putBudget(jwtA, recordId, {
      name: 'Food money',
      category: 'groceries',
      limit: { minor: 100000, currency: 'USD', exponent: 2 },
    })
    expect(first.status).toBe(200)
    const second = await putBudget(jwtA, recordId, {
      name: 'Food money v2',
      category: 'groceries',
      limit: { minor: 200000, currency: 'USD', exponent: 2 },
    })
    expect(second.status).toBe(200)

    const aList = await listBudgets(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // exactly one row
    expect((matches[0] as any).limit?.minor).toBe(200000)
  })

  it("B's PUT to A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putBudget(jwtA, recordId, {
      name: 'Food money',
      category: 'groceries',
      limit: { minor: 100000, currency: 'USD', exponent: 2 },
    })
    expect(res.status).toBe(200)

    const bPut = await putBudget(jwtB, recordId, {
      name: 'tampered',
      category: 'groceries',
      limit: { minor: 9999, currency: 'USD', exponent: 2 },
    })
    expect(bPut.status).toBe(404)

    // A's row is untouched
    const aGet = await fetch(`${baseUrl}/budgets/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { name: string } }
    expect(aRow.data.name).toBe('Food money')
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putBudget(jwtA, recordId, {
      name: 'Food money',
      category: 'groceries',
      limit: { minor: 100000, currency: 'USD', exponent: 2 },
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/budgets/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/budgets/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('category + limit + name round-trip via Budget.fromJSON', async () => {
    const recordId = crypto.randomUUID()
    const res = await putBudget(jwtA, recordId, {
      name: 'Food money',
      category: 'groceries',
      limit: { minor: 100000, currency: 'USD', exponent: 2 },
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/budgets/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via Budget.fromJSON — Budget is NOT an Entry (no kind)
    const shape = strapiRowToShape(row)
    const budget = Budget.fromJSON(shape)

    expect(budget.category).toBe('groceries')
    expect(typeof budget.limit.minor).toBe('number')
    expect(budget.limit.minor).toBe(100000)
    expect(budget.limit.currency).toBe('USD')
    expect(budget.limit.exponent).toBe(2)
    expect(budget.name).toBe('Food money')
  })

  it('budget without a name round-trips (null-strip: name absent, not null)', async () => {
    const recordId = crypto.randomUUID()
    const res = await putBudget(jwtA, recordId, {
      // name intentionally omitted
      category: 'transport',
      limit: { minor: 50000, currency: 'USD', exponent: 2 },
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/budgets/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // name must be absent (undefined), never null — Budget constructor throws on null
    expect(row['name']).toBeUndefined()

    // Must decode cleanly (no crash from name: null)
    const shape = strapiRowToShape(row)
    const budget = Budget.fromJSON(shape)
    expect(budget.name).toBeUndefined()
    expect(budget.category).toBe('transport')
    expect(budget.limit.minor).toBe(50000)
  })
})
