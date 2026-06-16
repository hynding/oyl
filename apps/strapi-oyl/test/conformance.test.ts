import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { httpProtocolContract } from '@oyl/all-of-oyl/testing'
import { boot, truncateRecords } from './boot'
import { registerUser } from './helpers'

let baseUrl: string
let stop: () => Promise<void>
let jwt: string

beforeAll(async () => {
  ;({ baseUrl, stop } = await boot())
  ;({ jwt } = await registerUser(baseUrl, `conf-${Date.now()}`))
})
afterAll(async () => { await stop?.() })
beforeEach(async () => { await truncateRecords() })

httpProtocolContract('apps/strapi-oyl (booted)', () => ({
  baseUrl,
  fetch: globalThis.fetch,
  getToken: async () => jwt,
}))

describe('delta pull (?since)', () => {
  const hdr = () => ({ Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' })
  const put = (id: string, data: unknown, revision: number | null = null) =>
    fetch(`${baseUrl}/v1/entries/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify({ data, revision }) })
  const list = (qs = '') => fetch(`${baseUrl}/v1/entries${qs}`, { headers: hdr() }).then((r) => r.json())

  it('updatedAt advances on update (R-1)', async () => {
    const id = crypto.randomUUID()
    const created = await (await put(id, { v: 1 })).json()
    const updated = await (await put(id, { v: 2 }, created.revision)).json()
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(created.updatedAt).getTime())
  })

  it('?since with a future timestamp returns nothing (the filter works)', async () => {
    await put(crypto.randomUUID(), { v: 1 })
    const future = new Date(Date.now() + 60_000).toISOString()
    const res = await list(`?since=${encodeURIComponent(future)}&includeDeleted=1`)
    expect(res.records.length).toBe(0)
  })

  it('?since=cursor includes a record updated after the cursor (R-5)', async () => {
    const id = crypto.randomUUID()
    const created = await (await put(id, { v: 1 })).json()
    const full = await list('?includeDeleted=1')
    const cursor = full.records.map((r: any) => r.updatedAt).sort().at(-1) as string
    await put(id, { v: 2 }, created.revision)
    const delta = await list(`?since=${encodeURIComponent(cursor)}&includeDeleted=1`)
    expect(delta.records.find((r: any) => r.id === id)?.data?.v).toBe(2)
  })
})
