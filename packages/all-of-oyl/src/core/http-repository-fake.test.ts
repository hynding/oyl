import { describe, expect, it } from 'vitest'
import { createProtocolFake } from './http-repository-fake.js'

const TOKEN = 'Bearer t'
const j = (res: Response) => res.json()

describe('createProtocolFake', () => {
  it('round-trips a PUT then GET, stamping envelope meta', async () => {
    const { fetch } = createProtocolFake()
    const put = await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', headers: { Authorization: TOKEN }, body: JSON.stringify({ data: { id: 'a1', name: 'Health' }, revision: null }) })
    expect(put.status).toBe(200)
    const env = await j(put)
    expect(env).toMatchObject({ id: 'a1', revision: 1, deletedAt: null })
    expect(typeof env.createdAt).toBe('string')

    const list = await j(await fetch('http://x/v1/lifeAreas', { headers: { Authorization: TOKEN } }))
    expect(list.records).toHaveLength(1)
  })

  it('returns 409 on a stale revision and 404 for a missing record', async () => {
    const { fetch } = createProtocolFake()
    await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'A' }, revision: null }) })
    const stale = await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'B' }, revision: null }) })
    expect(stale.status).toBe(409)
    expect((await j(stale)).error.code).toBe('REVISION_CONFLICT')
    expect((await fetch('http://x/v1/lifeAreas/zzz')).status).toBe(404)
  })

  it('soft-deletes (204) and excludes from list unless includeDeleted=1', async () => {
    const { fetch } = createProtocolFake()
    await fetch('http://x/v1/lifeAreas/a1', { method: 'PUT', body: JSON.stringify({ data: { id: 'a1', name: 'A' }, revision: null }) })
    expect((await fetch('http://x/v1/lifeAreas/a1', { method: 'DELETE' })).status).toBe(204)
    expect((await j(await fetch('http://x/v1/lifeAreas'))).records).toHaveLength(0)
    expect((await j(await fetch('http://x/v1/lifeAreas?includeDeleted=1'))).records).toHaveLength(1)
  })
})
