import type { FetchFn } from '../ports.js'
import { signal } from '../reactive/signal.js'

export type GoogleConnection = { state: 'unknown'|'unconfigured'|'disconnected'|'connected'|'reconnect-needed', email?: string }

/**
 * Google connection state + Drive access tokens, over the Strapi /google routes.
 * Implements the shared AccessTokenProvider seam ({ force } bypasses the cache).
 */
export function createGoogleStore({ baseUrl, fetch, getToken }: { baseUrl: string, fetch: FetchFn, getToken: () => Promise<string | null> }) {
  const connection = signal({ state: 'unknown' } as GoogleConnection)
  let cached: { accessToken: string, expiresAt: number } | null = null

  /**
   * `credentials: 'include'` is required for `/google/connect-url`: its response sets an
   * HttpOnly session-binding cookie (Strapi's `config/middlewares.ts` CORS was widened to
   * `credentials: true` for exactly this — a cross-origin fetch() without this flag silently
   * drops the Set-Cookie, breaking link-mode connect with `bad_state`). Harmless on the other
   * authed() calls, which don't set or need cookies.
   */
  async function authed(path: string, init?: { method?: string }) {
    const token = await getToken()
    return fetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers: { Authorization: `Bearer ${token}` } })
  }

  return {
    connection,

    /** Pre-auth probe: is Google configured on the backend at all? */
    async probe() {
      try {
        const res = await fetch(`${baseUrl}/google/config`)
        if (!res.ok) return
        const data = (await res.json()) as { configured?: boolean }
        connection.set(data.configured ? { state: 'disconnected' } : { state: 'unconfigured' })
      } catch { /* stay 'unknown' — offline probe is not an error */ }
    },

    /** Signed-in status for the Profile screen. */
    async loadStatus() {
      try {
        const res = await authed('/google/status')
        if (res.status === 501) { connection.set({ state: 'unconfigured' }); return }
        if (!res.ok) return
        const data = (await res.json()) as { connected?: boolean, email?: string }
        if (data.connected) connection.set(data.email ? { state: 'connected', email: data.email } : { state: 'connected' })
        else if (connection.get().state !== 'reconnect-needed') connection.set({ state: 'disconnected' })
      } catch { /* leave current state */ }
    },

    /**
     * AccessTokenProvider seam for the Drive client.
     */
    async getAccessToken(opts?: { force?: boolean }): Promise<string> {
      if (!opts?.force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.accessToken
      const res = await authed('/google/drive-token')
      if (res.status === 410) {
        cached = null
        connection.set({ state: 'reconnect-needed' })
        throw new Error('google-reconnect-needed')
      }
      if (!res.ok) throw new Error(`drive token failed (${res.status})`)
      cached = (await res.json()) as { accessToken: string, expiresAt: number }
      return cached.accessToken
    },

    /** Server-minted link-mode auth URL (a plain anchor cannot carry the JWT). */
    async connectUrl(): Promise<string> {
      const res = await authed('/google/connect-url')
      if (!res.ok) throw new Error(`connect-url failed (${res.status})`)
      return ((await res.json()) as { url: string }).url
    },

    async disconnect() {
      const res = await authed('/google/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error(`disconnect failed (${res.status})`)
      cached = null
      connection.set({ state: 'disconnected' })
    },
  }
}
