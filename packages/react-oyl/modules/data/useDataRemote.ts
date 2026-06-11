// packages/react-oyl/modules/data/useDataRemote.ts
// Strapi API base URL. Configurable via VITE_STRAPI_API_BASE_URL; the default
// matches the host-side port mapping in docker-compose.yaml (3337:1337).
import { POPULATE_BY_PATH } from './sync/types'

const BASE = import.meta.env.VITE_STRAPI_API_BASE_URL ?? 'http://localhost:3337/api'

// Build the `populate` query value for a path. Strapi 5 expects array syntax
// (`populate[0]=a&populate[1]=b`) for multi-field populate; comma-joined is
// rejected as a single invalid key. Unknown paths fall back to `populate=*`.
const populateParam = (path: string): string => {
  const explicit = POPULATE_BY_PATH[path]
  if (!explicit) return 'populate=*'
  return explicit
    .map((f, i) => `populate[${i}]=${encodeURIComponent(f)}`)
    .join('&')
}

// Append the populate query for `path` to `url`, picking `?` or `&` based on
// whether the path already carries a query string. Callers like
// UserDailyNutrition pass `"nutrition-items?filters[...]&pagination[...]"`
// through findAll; without this split, the result is `…pagination=20?populate=*`
// (two `?`) and Strapi's qs parser 400s with "convertStartQueryParams expected
// a positive integer got NaN".
const withPopulate = (path: string, suffix = ''): string => {
  const [bare, existingQs] = path.split('?')
  const populate = populateParam(bare)
  const tail = `${bare}${suffix}`
  if (!populate) return existingQs ? `${tail}?${existingQs}` : tail
  return existingQs ? `${tail}?${existingQs}&${populate}` : `${tail}?${populate}`
}

export type AggregatePayload = {
  date: string
  paths: Record<string, Array<{ id: string | number }>>
}

type RemoteClient = {
  findAll<T>(path: string): Promise<T[]>
  findOne<T>(path: string, id: string | number): Promise<T | undefined>
  create<T>(path: string, body: unknown): Promise<T>
  update<T>(path: string, id: string | number, body: unknown): Promise<T>
  remove(path: string, id: string | number): Promise<void>
  findAggregate(date: string): Promise<AggregatePayload>
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
      const res = await fetch(`${BASE}/${withPopulate(path)}`, { headers: headers(getToken()) })
      if (!res.ok) throw new Error(`GET /${path} failed: ${res.status}`)
      const data = unwrap<T[]>(await res.json())
      return Array.isArray(data) ? data : []
    },
    async findOne<T>(path: string, id: string | number) {
      const res = await fetch(`${BASE}/${withPopulate(path, `/${id}`)}`, { headers: headers(getToken()) })
      if (res.status === 404) return undefined
      if (!res.ok) throw new Error(`GET /${path}/${id} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async create<T>(path: string, body: unknown) {
      const res = await fetch(`${BASE}/${withPopulate(path)}`, {
        method: 'POST',
        headers: headers(getToken()),
        body: JSON.stringify({ data: body }),
      })
      if (!res.ok) throw new Error(`POST /${path} failed: ${res.status}`)
      return unwrap<T>(await res.json())
    },
    async update<T>(path: string, id: string | number, body: unknown) {
      const res = await fetch(`${BASE}/${withPopulate(path, `/${id}`)}`, {
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
    async findAggregate(date: string): Promise<AggregatePayload> {
      const res = await fetch(`${BASE}/user-dailies/aggregate/${date}`, { headers: headers(getToken()) })
      if (!res.ok) throw new Error(`GET /user-dailies/aggregate/${date} failed: ${res.status}`)
      const json = await res.json()
      // Aggregate handler returns the envelope directly, so just trust the shape.
      return json as AggregatePayload
    },
  }
}

export type { RemoteClient }
