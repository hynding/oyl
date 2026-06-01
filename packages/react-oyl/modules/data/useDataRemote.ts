// packages/react-oyl/modules/data/useDataRemote.ts
const BASE = 'http://localhost:3337/api'

type RemoteClient = {
  findAll<T>(path: string): Promise<T[]>
  findOne<T>(path: string, id: string | number): Promise<T | undefined>
  create<T>(path: string, body: unknown): Promise<T>
  update<T>(path: string, id: string | number, body: unknown): Promise<T>
  remove(path: string, id: string | number): Promise<void>
}

const headers = (token: string | null): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

const unwrap = <T>(json: unknown): T => {
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data
  }
  return json as T
}

export function createRemoteClient(getToken: () => string | null): RemoteClient {
  return {
    async findAll<T>(path: string): Promise<T[]> {
      const res = await fetch(`${BASE}/${path}?populate=*`, { headers: headers(getToken()) })
      if (!res.ok) throw new Error(`GET /${path} failed: ${res.status}`)
      const data = unwrap<T[]>(await res.json())
      return Array.isArray(data) ? data : []
    },
    async findOne<T>(path: string, id: string | number) {
      const res = await fetch(`${BASE}/${path}/${id}?populate=*`, { headers: headers(getToken()) })
      if (res.status === 404) return undefined
      if (!res.ok) throw new Error(`GET /${path}/${id} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async create<T>(path: string, body: unknown) {
      const res = await fetch(`${BASE}/${path}?populate=*`, {
        method: 'POST',
        headers: headers(getToken()),
        body: JSON.stringify({ data: body }),
      })
      if (!res.ok) throw new Error(`POST /${path} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async update<T>(path: string, id: string | number, body: unknown) {
      const res = await fetch(`${BASE}/${path}/${id}?populate=*`, {
        method: 'PUT',
        headers: headers(getToken()),
        body: JSON.stringify({ data: body }),
      })
      if (!res.ok) throw new Error(`PUT /${path}/${id} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async remove(path: string, id: string | number) {
      const res = await fetch(`${BASE}/${path}/${id}`, {
        method: 'DELETE',
        headers: headers(getToken()),
      })
      if (!res.ok && res.status !== 404) throw new Error(`DELETE /${path}/${id} failed: ${res.status}`)
    },
  }
}

export type { RemoteClient }
