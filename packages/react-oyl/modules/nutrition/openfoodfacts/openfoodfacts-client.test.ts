import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOFFClient } from './openfoodfacts-client'

const FIELDS = 'code,product_name,brands,image_front_small_url,nutriscore_grade,nova_group'

describe('openfoodfacts-client', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ products: [], count: 0, page: 1, page_count: 0, page_size: 0 }), { status: 200 }),
    )
  })
  afterEach(() => fetchSpy.mockRestore())

  it('builds search URL and includes identification headers', async () => {
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0',
      appVersion: '1.0',
      clientId: 'https://github.com/hynding/oyl',
    })
    await client.searchByQuery('oat milk', new AbortController().signal)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('https://world.openfoodfacts.net/api/v3/search?')
    expect(url).toContain('search_terms=oat+milk')
    expect(url).toContain(`fields=${encodeURIComponent(FIELDS)}`)
    const headers = init.headers as Record<string, string>
    expect(headers['X-App-Name']).toBe('OYL/1.0')
    expect(headers['X-App-Version']).toBe('1.0')
    expect(headers['X-Client-Id']).toBe('https://github.com/hynding/oyl')
    expect(headers['Authorization']).toBe('Basic ' + btoa('off:off'))
  })

  it('omits staging basic auth when base URL is production .org', async () => {
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.org/api/v3',
      appName: 'OYL/1.0',
      appVersion: '1.0',
      clientId: 'https://github.com/hynding/oyl',
    })
    await client.searchByQuery('apple', new AbortController().signal)
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('builds barcode URL and returns null on 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    const result = await client.fetchByBarcode('1234567890123', new AbortController().signal)
    expect(result).toBeNull()
    expect(fetchSpy.mock.calls[0][0]).toContain('/product/1234567890123')
  })

  it('returns null when v3 response status=0', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ status: 0 }), { status: 200 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    expect(await client.fetchByBarcode('000', new AbortController().signal)).toBeNull()
  })

  it('throws on 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('boom', { status: 503 }))
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    await expect(client.searchByQuery('x', new AbortController().signal)).rejects.toThrow(/503/)
  })

  it('propagates AbortSignal', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = createOFFClient({
      baseUrl: 'https://world.openfoodfacts.net/api/v3',
      appName: 'OYL/1.0', appVersion: '1.0', clientId: 'x',
    })
    fetchSpy.mockImplementationOnce((_: unknown, init: RequestInit) => {
      expect(init.signal).toBeDefined()
      return Promise.reject(new DOMException('aborted', 'AbortError'))
    })
    await expect(client.searchByQuery('x', controller.signal)).rejects.toThrow(/abort/i)
  })
})
