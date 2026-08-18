import { describe, it, expect, vi } from 'vitest'
import { createDriveClient } from './drive-client.js'
import { DriveError, type DriveFetchFn, type DriveFetchResponse } from './types.js'

type Call = { url: string; init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } }

function respond(status: number, body: unknown = {}, bytes?: Uint8Array): DriveFetchResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    arrayBuffer: async () => (bytes ?? new Uint8Array()).buffer as ArrayBuffer,
  }
}

function makeFetch(responses: DriveFetchResponse[]): { fetch: DriveFetchFn; calls: Call[] } {
  const calls: Call[] = []
  const fetch: DriveFetchFn = async (url, init = {}) => {
    calls.push({ url, init })
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra request')
    return next
  }
  return { fetch, calls }
}

const tokens = { getAccessToken: vi.fn(async (_opts?: { force?: boolean }) => 't1') }

describe('drive-client', () => {
  it('list pages through files with the parent query and bearer token', async () => {
    const { fetch, calls } = makeFetch([
      respond(200, { files: [{ id: 'f1', name: 'a.txt', mimeType: 'text/plain' }], nextPageToken: 'p2' }),
      respond(200, { files: [{ id: 'f2', name: 'b.txt', mimeType: 'text/plain', size: '12', modifiedTime: '2026-08-18T00:00:00Z' }] }),
    ])
    const drive = createDriveClient({ fetch, tokens })
    const files = await drive.list('folder-1')
    expect(files.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(files[1].size).toBe(12)
    expect(calls[0].url).toContain("'folder-1'+in+parents")
    expect(calls[0].init.headers?.Authorization).toBe('Bearer t1')
    expect(calls[1].url).toContain('pageToken=p2')
  })

  it('ensureFolder finds an existing folder, else creates it', async () => {
    const found = makeFetch([respond(200, { files: [{ id: 'existing', name: 'OYL', mimeType: 'application/vnd.google-apps.folder' }] })])
    expect(await createDriveClient({ fetch: found.fetch, tokens }).ensureFolder('OYL')).toBe('existing')

    const created = makeFetch([respond(200, { files: [] }), respond(200, { id: 'made' })])
    expect(await createDriveClient({ fetch: created.fetch, tokens }).ensureFolder('OYL')).toBe('made')
    expect(created.calls[1].init.method).toBe('POST')
    expect(String(created.calls[1].init.body)).toContain('application/vnd.google-apps.folder')
  })

  it('upload builds a multipart/related body containing metadata and bytes', async () => {
    const { fetch, calls } = makeFetch([respond(200, { id: 'up1', name: 'r.txt', mimeType: 'text/plain' })])
    const drive = createDriveClient({ fetch, tokens })
    const file = await drive.upload('folder-1', 'r.txt', 'text/plain', Uint8Array.from([104, 105]))
    expect(file.id).toBe('up1')
    expect(calls[0].url).toContain('uploadType=multipart')
    const contentType = calls[0].init.headers?.['Content-Type'] ?? ''
    expect(contentType).toMatch(/^multipart\/related; boundary=/)
    const raw = new TextDecoder().decode(calls[0].init.body as Uint8Array)
    expect(raw).toContain('"name":"r.txt"')
    expect(raw).toContain('"parents":["folder-1"]')
    expect(raw).toContain('hi')
  })

  it('download returns the body bytes', async () => {
    const { fetch, calls } = makeFetch([respond(200, {}, Uint8Array.from([1, 2, 3]))])
    const bytes = await createDriveClient({ fetch, tokens }).download('f1')
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(calls[0].url).toContain('alt=media')
  })

  it('retries ONCE with a forced token on 401, then succeeds', async () => {
    tokens.getAccessToken.mockClear()
    const { fetch } = makeFetch([respond(401, {}), respond(200, { files: [] })])
    await createDriveClient({ fetch, tokens }).list('folder-1')
    expect(tokens.getAccessToken).toHaveBeenCalledTimes(2)
    expect(tokens.getAccessToken.mock.calls[1][0]).toEqual({ force: true })
  })

  it('maps 401-after-retry, 404, 429 and thrown fetch to typed DriveError kinds', async () => {
    const cases: Array<[DriveFetchResponse[], string]> = [
      [[respond(401), respond(401)], 'unauthorized'],
      [[respond(404)], 'not-found'],
      [[respond(429)], 'rate-limited'],
    ]
    for (const [responses, kind] of cases) {
      const { fetch } = makeFetch(responses)
      await expect(createDriveClient({ fetch, tokens }).list('x')).rejects.toMatchObject({ name: 'DriveError', kind })
    }
    const throwing: DriveFetchFn = async () => { throw new Error('offline') }
    await expect(createDriveClient({ fetch: throwing, tokens }).list('x')).rejects.toMatchObject({ kind: 'network' })
    expect(new DriveError('network', 'x')).toBeInstanceOf(Error)
  })

  it('remove issues DELETE and update sends media bytes', async () => {
    const del = makeFetch([respond(204)])
    await createDriveClient({ fetch: del.fetch, tokens }).remove('f9')
    expect(del.calls[0].init.method).toBe('DELETE')

    const upd = makeFetch([respond(200, {})])
    await createDriveClient({ fetch: upd.fetch, tokens }).update('f9', 'text/plain', Uint8Array.from([120]))
    expect(upd.calls[0].init.method).toBe('PATCH')
    expect(upd.calls[0].url).toContain('uploadType=media')
    expect(upd.calls[0].init.headers?.['Content-Type']).toBe('text/plain')
  })
})
