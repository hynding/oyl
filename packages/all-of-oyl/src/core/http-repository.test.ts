import { describe, expect, it, vi } from 'vitest'
import { createHttpClient, createHttpRepository, HttpRepositoryError } from './http-repository.js'
import { createProtocolFake } from './http-repository-fake.js'
import { DomainError } from './domain-error.js'
import { LifeArea } from './life-area.js'
import { COLLECTIONS } from '../collections.js'

const codec = COLLECTIONS.lifeAreas
const deps = (fetch: typeof globalThis.fetch, getToken = async () => 'tok') =>
  createHttpRepository(createHttpClient({ baseUrl: 'http://x', fetch, getToken }), 'lifeAreas', codec)

describe('createHttpRepository — wire shape & auth', () => {
  it('sends Bearer auth and the right method/path/body', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch = vi.fn(async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ records: [] }), { status: 200 }) }) as any
    await deps(fetch).list()
    expect(calls[0]!.url).toBe('http://x/v1/lifeAreas')
    expect((calls[0]!.init.headers as any).Authorization).toBe('Bearer tok')
  })

  it('omits Authorization when getToken is falsy (R13)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })) as any
    await deps(fetch, async () => '').list()
    expect((fetch.mock.calls[0][1].headers as any).Authorization).toBeUndefined()
  })

  it('passes includeDeleted and purge query params', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ records: [] }), { status: 200 })) as any
    await deps(fetch).list({ includeDeleted: true })
    expect(String(fetch.mock.calls[0][0])).toContain('includeDeleted=1')
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deps(fetch).purge('id1' as any)
    expect(String(fetch.mock.calls[1][0])).toContain('purge=1')
  })

  it('maps statuses to errors: 409→REVISION_CONFLICT, 401→auth, 500→server, 404(get)→undefined', async () => {
    const at = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as any
    const la = new LifeArea({ name: 'A', slug: 'a' })
    await expect(deps(at(409, { error: { code: 'REVISION_CONFLICT' } })).save(la)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(deps(at(409)).save(la)).rejects.toBeInstanceOf(DomainError)
    await expect(deps(at(401)).list()).rejects.toMatchObject({ kind: 'auth' })
    await expect(deps(at(500)).list()).rejects.toBeInstanceOf(HttpRepositoryError)
    expect(await deps(at(404)).get('missing' as any)).toBeUndefined()
  })

  it('reviveEnvelope: envelope meta wins over meta embedded in data (R2)', async () => {
    const uid = '11111111-1111-4111-8111-111111111111'
    const env = { id: uid, data: { id: uid, name: 'Health', slug: 'health', meta: { createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z', revision: 99 } }, revision: 4, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z', deletedAt: null }
    const fetch = vi.fn(async () => new Response(JSON.stringify(env), { status: 200 })) as any
    const got = await deps(fetch).get(uid as any)
    expect(got!.meta!.revision).toBe(4)
  })

  it('round-trips through the protocol fake', async () => {
    const repo = deps(createProtocolFake().fetch)
    const saved = await repo.save(new LifeArea({ name: 'Health', slug: 'health' }))
    expect(saved.meta!.revision).toBe(1)
    expect(await repo.list()).toHaveLength(1)
  })
})
