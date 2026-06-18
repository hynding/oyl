import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boot } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwtA: string
let jwtB: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt: jwtA } = await registerUser(baseUrl, `actA-${Date.now()}`))
  ;({ jwt: jwtB } = await registerUser(baseUrl, `actB-${Date.now()}`))
})
afterAll(async () => { await stop?.() })

const h = (jwt?: string) => ({ 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) })

const createActivity = (jwt: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/activities`, {
    method: 'POST',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

// Writes go via PUT /activities/<recordId> — the backend upserts by the domain recordId.
const putActivity = (jwt: string, recordId: string, data: Record<string, unknown>) =>
  fetch(`${baseUrl}/activities/${recordId}`, {
    method: 'PUT',
    headers: h(jwt),
    body: JSON.stringify({ data }),
  })

const listActivities = async (jwt: string, nameFilter?: string) => {
  const url = nameFilter
    ? `${baseUrl}/activities?filters[name][$containsi]=${encodeURIComponent(nameFilter)}`
    : `${baseUrl}/activities`
  const res = await fetch(url, { headers: h(jwt) })
  const body = (await res.json()) as { data: unknown[] }
  return body.data
}

describe('activity content-type — catalog visibility (booted)', () => {
  it('unauthenticated request is rejected (401/403)', async () => {
    const res = await fetch(`${baseUrl}/activities`, { headers: h() })
    expect([401, 403]).toContain(res.status)
  })

  it('user A creates a public activity; user B find (with name search) includes it', async () => {
    const uniq = `pub-act-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createActivity(jwtA, {
      recordId: uniq,
      name: `Public Activity ${uniq}`,
      slug: `public-act-${uniq}`,
      visibility: 'public',
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { data: { id: number } }
    expect(created.data.id).toBeTypeOf('number')

    // B should see it in a plain list
    const bList = await listActivities(jwtB)
    expect(bList.some((r: any) => r.recordId === uniq)).toBe(true)

    // B should see it via name $containsi filter
    const bSearchList = await listActivities(jwtB, `Public Activity ${uniq}`)
    expect(bSearchList.some((r: any) => r.recordId === uniq)).toBe(true)
  })

  it('user A creates a private activity; B does NOT see it but A does', async () => {
    const uniq = `priv-act-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await createActivity(jwtA, {
      recordId: uniq,
      name: `Private Activity ${uniq}`,
      slug: `private-act-${uniq}`,
      visibility: 'private',
    })
    expect(res.status).toBe(201)

    const aList = await listActivities(jwtA)
    const bList = await listActivities(jwtB)

    expect(aList.some((r: any) => r.recordId === uniq)).toBe(true)
    expect(bList.some((r: any) => r.recordId === uniq)).toBe(false)
  })

  it('PUT to a new recordId creates the activity (upsert); a second PUT updates one row', async () => {
    const uniq = `upsert-act-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const first = await putActivity(jwtA, uniq, {
      name: `v1 ${uniq}`,
      slug: `upsert-${uniq}`,
      visibility: 'public',
    })
    expect(first.status).toBe(200)
    const created = (await first.json()) as { data: { recordId: string } }
    expect(created.data.recordId).toBe(uniq)

    const second = await putActivity(jwtA, uniq, {
      name: `v2 ${uniq}`,
      slug: `upsert-${uniq}`,
      visibility: 'public',
    })
    expect(second.status).toBe(200)

    // Idempotent upsert: exactly one row, latest write wins.
    const aList = await listActivities(jwtA)
    const matches = aList.filter((r: any) => r.recordId === uniq)
    expect(matches).toHaveLength(1)
    expect((matches[0] as any).name).toBe(`v2 ${uniq}`)
  })

  it('user B cannot update user A activity by recordId (404, A unchanged)', async () => {
    const uniq = `upd-act-${Date.now()}`
    const res = await putActivity(jwtA, uniq, {
      name: `Update Test ${uniq}`,
      slug: `upd-${uniq}`,
      visibility: 'public',
    })
    expect(res.status).toBe(200)

    const bPut = await putActivity(jwtB, uniq, { name: 'tampered', slug: `upd-${uniq}` })
    expect(bPut.status).toBe(404)

    // A can still read it unchanged
    const aGet = await fetch(`${baseUrl}/activities/${uniq}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
    const aRow = (await aGet.json()) as { data: { name: string } }
    expect(aRow.data.name).toBe(`Update Test ${uniq}`)
  })

  it('user B cannot delete user A activity by recordId (404)', async () => {
    const uniq = `del-act-${Date.now()}`
    const res = await putActivity(jwtA, uniq, {
      name: `Delete Test ${uniq}`,
      slug: `del-${uniq}`,
      visibility: 'public',
    })
    expect(res.status).toBe(200)

    const bDel = await fetch(`${baseUrl}/activities/${uniq}`, { method: 'DELETE', headers: h(jwtB) })
    expect(bDel.status).toBe(404)

    // A can still read it
    const aGet = await fetch(`${baseUrl}/activities/${uniq}`, { headers: h(jwtA) })
    expect(aGet.status).toBe(200)
  })
})
