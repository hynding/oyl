import { HttpRepositoryError } from './http-repository.js'
import type { FetchFn } from './http-repository.js'

/** Talks to Strapi 5 content-type REST (flat fields + documentId), JWT-auth. */
export interface ApiClient {
  find(path: string, query?: Record<string, string | number | boolean>): Promise<{ data: unknown[]; meta: unknown }>
  /** 404 → undefined */
  findOne(path: string, id: string): Promise<unknown | undefined>
  create(path: string, data: unknown): Promise<unknown>
  update(path: string, id: string, data: unknown): Promise<unknown>
  remove(path: string, id: string): Promise<void>
}

export function createApiClient(opts: {
  baseUrl: string
  fetch: FetchFn
  getToken: () => Promise<string | null | undefined>
  onAuthError?: () => void
}): ApiClient {
  const root = opts.baseUrl.replace(/\/$/, '')

  async function request(method: string, url: string, body?: unknown): Promise<unknown> {
    const token = await opts.getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    let res
    try {
      res = await opts.fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
    } catch (err) {
      throw new HttpRepositoryError('transport', err instanceof Error ? err.message : String(err))
    }

    if (res.status === 404) return undefined
    if (res.ok) return res.json()
    if (res.status === 401 || res.status === 403) {
      opts.onAuthError?.()
      throw new HttpRepositoryError('auth', `unauthorized (${res.status})`, res.status)
    }
    throw new HttpRepositoryError('server', `server error (${res.status})`, res.status)
  }

  return {
    async find(path, query) {
      let url = `${root}/api/${path}`
      if (query && Object.keys(query).length > 0) {
        const params = Object.entries(query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
        url = `${url}?${params}`
      }
      const result = await request('GET', url)
      const envelope = result as { data: unknown[]; meta: unknown }
      return { data: envelope.data, meta: envelope.meta }
    },

    async findOne(path, id) {
      const url = `${root}/api/${path}/${id}`
      const result = await request('GET', url)
      if (result === undefined) return undefined
      const envelope = result as { data: unknown }
      return envelope.data
    },

    async create(path, data) {
      const url = `${root}/api/${path}`
      const result = await request('POST', url, { data })
      const envelope = result as { data: unknown }
      return envelope.data
    },

    async update(path, id, data) {
      const url = `${root}/api/${path}/${id}`
      const result = await request('PUT', url, { data })
      const envelope = result as { data: unknown }
      return envelope.data
    },

    async remove(path, id) {
      const url = `${root}/api/${path}/${id}`
      await request('DELETE', url)
    },
  }
}
