import { signal } from '../reactive/signal.js'
import { ACCESS_KEY } from '../storage/keys.js'
import type { EnumerableStorage, FetchFn } from '../ports.js'

type AppStorage = Pick<EnumerableStorage, 'getItem' | 'setItem' | 'removeItem'>
type Cached = { userId: number, admin: boolean }

function readCached(storage: AppStorage): Cached | null {
  try { const raw = storage.getItem(ACCESS_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/**
 * The signed-in user's access level, from the backend's GET /access (`{ admin }`, decided
 * server-side by the `OYL_ADMIN_EMAILS` allowlist). Admin-only UI (the Status screen) reads
 * `admin`. The last answer is cached per user so an admin keeps Status while the backend is
 * unreachable (Status is the diagnostics surface); any other answer than a 2xx `admin: true`
 * — including a 404 from a backend that predates the route — means not an admin. UI gating
 * only: nothing the Status screen does goes beyond the user's own account.
 */
export function createAccessState(
  storage: AppStorage,
  { baseUrl, fetch, getToken, userId }: { baseUrl: string, fetch: FetchFn, getToken: () => Promise<string | null>, userId: () => number | null },
) {
  const initial = readCached(storage)
  const admin = signal(initial != null && initial.userId === userId() && initial.admin === true)
  const adopt = (id: number, value: boolean) => {
    storage.setItem(ACCESS_KEY, JSON.stringify({ userId: id, admin: value }))
    admin.set(value)
  }
  const clear = () => { storage.removeItem(ACCESS_KEY); admin.set(false) }

  return {
    admin,
    clear,
    async load(): Promise<void> {
      const id = userId()
      if (id == null) return clear()
      const token = await getToken()
      const res = await fetch(`${baseUrl}/access`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      if (res == null) return // offline: keep the last-known flag
      const body = res.ok ? ((await res.json().catch(() => ({}))) as { admin?: unknown }) : {}
      adopt(id, body.admin === true)
    },
  }
}
