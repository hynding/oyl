import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'
import { Account, strapiRowToShape } from '@oyl/all-of-oyl'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `accountA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `accountB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

// Writes go via PUT /accounts/<recordId> — the backend upserts by the domain recordId.
const putAccount = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/accounts/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listAccounts = async (jwt: string) => {
  const res = await fetch(`${baseUrl}/accounts`, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('account content-type — owner scoping (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/accounts`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('PUT to a new recordId creates the account (upsert); A sees it, B does not', async () => {
    const recordId = `account-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await putAccount(jwtA, recordId, { name: 'Checking', currency: 'USD' })
    expect(res.status).toBe(200)
    const created = (await res.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(recordId)

    const aList = await listAccounts(jwtA)
    const bList = await listAccounts(jwtB)

    const aHasIt = aList.some((r: any) => r.recordId === recordId)
    const bHasIt = bList.some((r: any) => r.recordId === recordId)

    expect(aHasIt).toBe(true)
    expect(bHasIt).toBe(false)
  })

  it('a second PUT to the same recordId updates in place — one row, no duplicate (idempotent upsert)', async () => {
    const recordId = `account-upsert-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const first = await putAccount(jwtA, recordId, { name: 'Savings', currency: 'USD' })
    expect(first.status).toBe(200)
    const second = await putAccount(jwtA, recordId, { name: 'Savings Renamed', currency: 'EUR' })
    expect(second.status).toBe(200)

    const aList = await listAccounts(jwtA)
    const matches = aList.filter((r: any) => r.recordId === recordId)
    expect(matches).toHaveLength(1) // upsert reconciled to a single row
    expect((matches[0] as any).name).toBe('Savings Renamed') // latest write wins
    expect((matches[0] as any).currency).toBe('EUR')
  })

  it('user B cannot read user A account by recordId', async () => {
    const recordId = `account-id-test-${Date.now()}`
    const res = await putAccount(jwtA, recordId, { name: 'Checking', currency: 'USD' })
    expect(res.status).toBe(200)

    const bGet = await fetch(`${baseUrl}/accounts/${recordId}`, { headers: h(jwtB) })
    expect(bGet.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/accounts/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('a cross-user PUT to A\'s recordId is refused (404) and never touches A\'s row', async () => {
    const recordId = `account-upd-test-${Date.now()}`
    const res = await putAccount(jwtA, recordId, { name: 'Protected', currency: 'USD' })
    expect(res.status).toBe(200)

    // recordId is globally unique and owned by A; B's PUT must not reach across owners
    // nor create a colliding row → 404.
    const bPut = await putAccount(jwtB, recordId, { name: 'Tampered', currency: 'GBP' })
    expect(bPut.status).toBe(404)

    const aGet = await fetch(`${baseUrl}/accounts/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { name: string } }
    expect(aRow.data.name).toBe('Protected') // untouched by B
  })

  it('user B cannot delete user A account by recordId (404)', async () => {
    const recordId = `account-del-test-${Date.now()}`
    const res = await putAccount(jwtA, recordId, { name: 'To Protect', currency: 'USD' })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/accounts/${recordId}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // Account should still exist for A
    const aGet = await fetch(`${baseUrl}/accounts/${recordId}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })

  it('Account.fromJSON(strapiRowToShape(row)) round-trip: name and currency survive', async () => {
    // recordId must be a UUID because Account.fromJSON delegates to Id.of which requires UUID format
    const recordId = crypto.randomUUID()
    const res = await putAccount(jwtA, recordId, { name: 'Checking', currency: 'USD' })
    expect(res.status).toBe(200)

    const getRes = await fetch(`${baseUrl}/accounts/${recordId}`, { headers: h(jwtA) })
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { data: unknown }
    const row = body.data

    // Account is NOT an Entry — no kind arg
    const shape = strapiRowToShape(row)
    const account = Account.fromJSON(shape)

    expect(account.name).toBe('Checking')
    expect(account.currency).toBe('USD')
    expect(account.id.toString()).toBe(recordId)
  })
})
