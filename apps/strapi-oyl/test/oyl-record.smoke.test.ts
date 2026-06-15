import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot, truncateRecords } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, 'userA'))
})
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

const uid = '11111111-1111-4111-8111-111111111111'
const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })
const put = (jwt: string, rev: number | null, recordId = uid, name = 'Health') =>
  fetch(`${baseUrl}/v1/lifeAreas/${recordId}`, { method: 'PUT', headers: h(jwt), body: JSON.stringify({ data: { id: recordId, name, slug: 'health' }, revision: rev }) })
const listFor = async (jwt: string, qs = '') => (await (await fetch(`${baseUrl}/v1/lifeAreas${qs}`, { headers: h(jwt) })).json()).records

describe('oyl-record /v1 — auth + isolation (booted)', () => {
  it('requires a token (no Authorization → 401/403)', async () => {
    const res = await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'PUT', headers: h(), body: JSON.stringify({ data: {}, revision: null }) })
    expect([401, 403]).toContain(res.status)
    expect(await listFor(jwtA)).toHaveLength(0)
  })

  it('authed create → conflict → bump → list → soft delete → purge', async () => {
    const c = await put(jwtA, null); expect(c.status).toBe(200); expect((await c.json()).revision).toBe(1)
    expect((await put(jwtA, null)).status).toBe(409)
    const u = await put(jwtA, 1); expect(u.status).toBe(200); expect((await u.json()).revision).toBe(2)
    expect(await listFor(jwtA)).toHaveLength(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204)
    expect(await listFor(jwtA)).toHaveLength(0)
    expect(await listFor(jwtA, '?includeDeleted=1')).toHaveLength(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204)
    expect(await listFor(jwtA, '?includeDeleted=1')).toHaveLength(0)
  })

  it('isolates tenants: A cannot see or mutate B records', async () => {
    const { jwt: jwtB } = await registerUser(baseUrl, `userB-${Date.now()}`)
    const bX = await put(jwtB, null); expect((await bX.json()).revision).toBe(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { headers: h(jwtA) })).status).toBe(404)
    expect(await listFor(jwtA)).toHaveLength(0)
    const aX = await put(jwtA, null); expect(aX.status).toBe(200); expect((await aX.json()).revision).toBe(1)
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE', headers: h(jwtA) })).status).toBe(204)
    const bGet = await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { headers: h(jwtB) })
    expect(bGet.status).toBe(200); expect((await bGet.json()).revision).toBe(1)
  })
})
