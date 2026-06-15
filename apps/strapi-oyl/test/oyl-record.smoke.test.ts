import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boot, truncateRecords } from './boot'

let baseUrl: string
let stop: () => Promise<void>

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
})

afterAll(async () => {
  await stop?.()
})

beforeEach(async () => {
  await truncateRecords()
})

const uid = '11111111-1111-4111-8111-111111111111'

const put = (rev: number | null, name = 'Health') =>
  fetch(`${baseUrl}/v1/lifeAreas/${uid}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { id: uid, name, slug: 'health' }, revision: rev }),
  })

describe('oyl-record /v1 single-record protocol (booted)', () => {
  it('create → conflict → bump → list → soft delete → purge', async () => {
    // CREATE: no prior revision → server stamps revision 1
    const c = await put(null)
    expect(c.status).toBe(200)
    expect((await c.json()).revision).toBe(1)

    // CONFLICT: record exists, null revision again → 409
    expect((await put(null)).status).toBe(409)

    // UPDATE: supply correct revision 1 → server bumps to 2
    const u = await put(1)
    expect(u.status).toBe(200)
    expect((await u.json()).revision).toBe(2)

    // LIST: one active record
    const list1 = await (await fetch(`${baseUrl}/v1/lifeAreas`)).json()
    expect(list1.records).toHaveLength(1)

    // SOFT DELETE: 204 No Content
    expect((await fetch(`${baseUrl}/v1/lifeAreas/${uid}`, { method: 'DELETE' })).status).toBe(204)

    // LIST excludes deleted by default
    const list2 = await (await fetch(`${baseUrl}/v1/lifeAreas`)).json()
    expect(list2.records).toHaveLength(0)

    // LIST with includeDeleted=1 shows soft-deleted row
    const list3 = await (await fetch(`${baseUrl}/v1/lifeAreas?includeDeleted=1`)).json()
    expect(list3.records).toHaveLength(1)

    // PURGE: hard delete, 204 No Content
    expect(
      (await fetch(`${baseUrl}/v1/lifeAreas/${uid}?purge=1`, { method: 'DELETE' })).status,
    ).toBe(204)

    // LIST with includeDeleted=1 — now empty
    const list4 = await (await fetch(`${baseUrl}/v1/lifeAreas?includeDeleted=1`)).json()
    expect(list4.records).toHaveLength(0)
  })
})
