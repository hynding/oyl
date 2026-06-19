import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { strapiRowToShape } from '@oyl/all-of-oyl'
import { Transaction } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `transactionA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `transactionB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const putTransaction = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/transactions/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listTransactions = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/transactions`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('transaction content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/transactions`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the transaction; A sees it, B does not', async () => {
    const recordId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    const res = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 1500, currency: 'USD', exponent: 2 },
      category: 'groceries',
      direction: 'expense',
      accountId,
    })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listTransactions(jwtA)
    const bList = await listTransactions(jwtB)

    expect(aList.some((r: any) => r.recordId === recordId)).toBe(true)
    expect(bList.some((r: any) => r.recordId === recordId)).toBe(false)
  })

  it('a second PUT by A upserts (idempotent — one row, latest wins)', async () => {
    const recordId = crypto.randomUUID()
    const first = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 1000, currency: 'USD', exponent: 2 },
      category: 'groceries',
      direction: 'expense',
    })
    expect(first.status).toBe(200)
    const second = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 2000, currency: 'USD', exponent: 2 },
      category: 'groceries',
      direction: 'expense',
    })
    expect(second.status).toBe(200)

    const aList = await listTransactions(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // exactly one row
    expect((matches[0] as any).amount?.minor).toBe(2000)
  })

  it("B's PUT to A's recordId is refused (404) and leaves A's row untouched", async () => {
    const recordId = crypto.randomUUID()
    const res = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 500, currency: 'USD', exponent: 2 },
      category: 'dining',
      direction: 'expense',
      note: 'original',
    })
    expect(res.status).toBe(200)

    const bPut = await putTransaction(jwtB, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 9999, currency: 'USD', exponent: 2 },
      category: 'dining',
      direction: 'expense',
      note: 'tampered',
    })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/transactions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { note: string } }
    expect(aRow.data.note).toBe('original')
  })

  it("B's DELETE on A's recordId is refused (404)", async () => {
    const recordId = crypto.randomUUID()
    const res = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: 300, currency: 'USD', exponent: 2 },
      category: 'transport',
      direction: 'expense',
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/transactions/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/transactions/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('amount + category + direction + accountId round-trip via Transaction.fromJSON', async () => {
    const recordId = crypto.randomUUID()
    const accountId = crypto.randomUUID()
    const occurredAt = new Date().toISOString()
    const res = await putTransaction(jwtA, recordId, {
      occurredAt,
      amount: { minor: 1500, currency: 'USD', exponent: 2 },
      category: 'groceries',
      direction: 'expense',
      accountId,
    })
    expect(res.status).toBe(200)

    // Fetch it back
    const getRes = await fetch(`${baseUrl}/transactions/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    // Decode via Transaction.fromJSON — exactly how the app bootstrap reads transactions
    const shape = strapiRowToShape(row, { kind: 'transaction' })
    const tx = Transaction.fromJSON(shape)

    // amount.minor must be numeric (not a string) for Money.fromJSON to succeed
    expect(typeof tx.amount.minor).toBe('number')
    expect(tx.amount.minor).toBe(1500)
    expect(tx.amount.currency).toBe('USD')
    expect(tx.amount.exponent).toBe(2)
    expect(tx.category).toBe('groceries')
    expect(tx.direction).toBe('expense')
    expect(tx.accountId?.toString()).toBe(accountId)
  })

  it('negative-amount refund round-trips with minor === -1500', async () => {
    const recordId = crypto.randomUUID()
    const res = await putTransaction(jwtA, recordId, {
      occurredAt: new Date().toISOString(),
      amount: { minor: -1500, currency: 'USD', exponent: 2 },
      category: 'groceries',
      direction: 'expense',
    })
    expect(res.status).toBe(200)

    const getRes = await fetch(`${baseUrl}/transactions/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: Record<string, unknown> }
    const row = body.data

    const shape = strapiRowToShape(row, { kind: 'transaction' })
    const tx = Transaction.fromJSON(shape)

    expect(tx.amount.minor).toBe(-1500)
    expect(tx.direction).toBe('expense')
  })
})
