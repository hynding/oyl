import { describe, it, expect, vi } from 'vitest'
import { createApiClient } from './api-client.js'
import { HttpRepositoryError } from './http-repository.js'
import type { FetchResponse } from './http-repository.js'

function makeFetch(status: number, body: unknown): () => Promise<FetchResponse> {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  })
}

describe('createApiClient', () => {
  const baseUrl = 'https://example.com'
  const getToken = () => Promise.resolve('tok-123')

  describe('find', () => {
    it('unwraps the data array from a Strapi collection response', async () => {
      const rows = [{ documentId: 'a', name: 'Alpha' }, { documentId: 'b', name: 'Beta' }]
      const fetch = makeFetch(200, { data: rows, meta: { pagination: { page: 1 } } })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.find('articles')
      expect(result.data).toEqual(rows)
      expect((result.meta as { pagination: { page: number } }).pagination.page).toBe(1)
    })

    it('sends GET to ${baseUrl}/api/${path}', async () => {
      const fetch = makeFetch(200, { data: [], meta: {} })
      const client = createApiClient({ baseUrl, fetch, getToken })
      await client.find('articles')
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/articles',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('appends query params when provided', async () => {
      const fetch = makeFetch(200, { data: [], meta: {} })
      const client = createApiClient({ baseUrl, fetch, getToken })
      await client.find('articles', { filters: 'foo', page: 1, published: true })
      const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string]
      expect(url).toContain('filters=foo')
      expect(url).toContain('page=1')
      expect(url).toContain('published=true')
    })

    it('attaches Authorization header when token is available', async () => {
      const fetch = makeFetch(200, { data: [], meta: {} })
      const client = createApiClient({ baseUrl, fetch, getToken })
      await client.find('articles')
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    })

    it('throws HttpRepositoryError auth on 401 and calls onAuthError', async () => {
      const fetch = makeFetch(401, { error: { message: 'Unauthorized' } })
      const onAuthError = vi.fn()
      const client = createApiClient({ baseUrl, fetch, getToken, onAuthError })
      await expect(client.find('articles')).rejects.toMatchObject({
        kind: 'auth',
        status: 401,
      })
      expect(onAuthError).toHaveBeenCalledOnce()
    })

    it('throws HttpRepositoryError auth on 403 and calls onAuthError', async () => {
      const fetch = makeFetch(403, { error: { message: 'Forbidden' } })
      const onAuthError = vi.fn()
      const client = createApiClient({ baseUrl, fetch, getToken, onAuthError })
      await expect(client.find('articles')).rejects.toBeInstanceOf(HttpRepositoryError)
      const err = await client.find('articles').catch((e: unknown) => e as HttpRepositoryError)
      expect(err.kind).toBe('auth')
      expect(err.status).toBe(403)
    })

    it('throws HttpRepositoryError server on 500', async () => {
      const fetch = makeFetch(500, { error: { message: 'Internal Server Error' } })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const err = await client.find('articles').catch((e: unknown) => e as HttpRepositoryError)
      expect(err).toBeInstanceOf(HttpRepositoryError)
      expect(err.kind).toBe('server')
    })

    it('throws HttpRepositoryError transport on network failure', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('network failure'))
      const client = createApiClient({ baseUrl, fetch, getToken })
      const err = await client.find('articles').catch((e: unknown) => e as HttpRepositoryError)
      expect(err).toBeInstanceOf(HttpRepositoryError)
      expect(err.kind).toBe('transport')
    })
  })

  describe('findOne', () => {
    it('unwraps .data from a single-item response', async () => {
      const doc = { documentId: 'abc', title: 'Hello' }
      const fetch = makeFetch(200, { data: doc })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.findOne('articles', 'abc')
      expect(result).toEqual(doc)
    })

    it('sends GET to ${baseUrl}/api/${path}/${id}', async () => {
      const doc = { documentId: 'abc', title: 'Hello' }
      const fetch = makeFetch(200, { data: doc })
      const client = createApiClient({ baseUrl, fetch, getToken })
      await client.findOne('articles', 'abc')
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/articles/abc',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('returns undefined on 404', async () => {
      const fetch = makeFetch(404, { error: { message: 'Not Found' } })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.findOne('articles', 'missing')
      expect(result).toBeUndefined()
    })

    it('throws HttpRepositoryError auth on 401', async () => {
      const fetch = makeFetch(401, {})
      const onAuthError = vi.fn()
      const client = createApiClient({ baseUrl, fetch, getToken, onAuthError })
      await expect(client.findOne('articles', 'x')).rejects.toMatchObject({ kind: 'auth' })
      expect(onAuthError).toHaveBeenCalledOnce()
    })
  })

  describe('create', () => {
    it('sends POST with { data } body and returns unwrapped .data', async () => {
      const created = { documentId: 'new1', title: 'New Article' }
      const fetch = makeFetch(200, { data: created })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.create('articles', { title: 'New Article' })
      expect(result).toEqual(created)
      const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(url).toBe('https://example.com/api/articles')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({ data: { title: 'New Article' } })
    })

    it('throws HttpRepositoryError auth on 401 + calls onAuthError', async () => {
      const fetch = makeFetch(401, {})
      const onAuthError = vi.fn()
      const client = createApiClient({ baseUrl, fetch, getToken, onAuthError })
      await expect(client.create('articles', { title: 'x' })).rejects.toMatchObject({ kind: 'auth' })
      expect(onAuthError).toHaveBeenCalledOnce()
    })
  })

  describe('update', () => {
    it('sends PUT with { data } body and returns unwrapped .data', async () => {
      const updated = { documentId: 'abc', title: 'Updated' }
      const fetch = makeFetch(200, { data: updated })
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.update('articles', 'abc', { title: 'Updated' })
      expect(result).toEqual(updated)
      const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      expect(url).toBe('https://example.com/api/articles/abc')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body as string)).toEqual({ data: { title: 'Updated' } })
    })
  })

  describe('remove', () => {
    it('sends DELETE to ${baseUrl}/api/${path}/${id} and resolves void', async () => {
      const fetch = makeFetch(200, {})
      const client = createApiClient({ baseUrl, fetch, getToken })
      const result = await client.remove('articles', 'abc')
      expect(result).toBeUndefined()
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/articles/abc',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })

    it('throws HttpRepositoryError auth on 401', async () => {
      const fetch = makeFetch(401, {})
      const onAuthError = vi.fn()
      const client = createApiClient({ baseUrl, fetch, getToken, onAuthError })
      await expect(client.remove('articles', 'abc')).rejects.toMatchObject({ kind: 'auth' })
      expect(onAuthError).toHaveBeenCalledOnce()
    })
  })

  describe('no token', () => {
    it('omits Authorization header when getToken returns null', async () => {
      const fetch = makeFetch(200, { data: [], meta: {} })
      const client = createApiClient({ baseUrl, fetch, getToken: () => Promise.resolve(null) })
      await client.find('articles')
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Record<string, unknown>]
      const headers = init.headers as Record<string, string>
      expect(headers.Authorization).toBeUndefined()
    })
  })
})
