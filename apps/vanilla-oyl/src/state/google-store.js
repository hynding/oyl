import { signal } from '@oyl/all-of-oyl/client'

/** @typedef {{ state: 'unknown'|'unconfigured'|'disconnected'|'connected'|'reconnect-needed', email?: string }} GoogleConnection */

/**
 * Google connection state + Drive access tokens, over the Strapi /google routes.
 * Implements the shared AccessTokenProvider seam ({ force } bypasses the cache).
 * @param {{ baseUrl: string, fetch: typeof globalThis.fetch, getToken: () => Promise<string | null> }} opts
 */
export function createGoogleStore({ baseUrl, fetch, getToken }) {
  const connection = signal(/** @type {GoogleConnection} */ ({ state: 'unknown' }))
  /** @type {{ accessToken: string, expiresAt: number } | null} */
  let cached = null

  /**
   * @param {string} path @param {{ method?: string }} [init]
   * `credentials: 'include'` is required for `/google/connect-url`: its response sets an
   * HttpOnly session-binding cookie (Strapi's `config/middlewares.ts` CORS was widened to
   * `credentials: true` for exactly this — a cross-origin fetch() without this flag silently
   * drops the Set-Cookie, breaking link-mode connect with `bad_state`). Harmless on the other
   * authed() calls, which don't set or need cookies.
   */
  async function authed(path, init) {
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
        const data = /** @type {{ configured?: boolean }} */ (await res.json())
        connection.set(data.configured ? { state: 'disconnected' } : { state: 'unconfigured' })
      } catch { /* stay 'unknown' — offline probe is not an error */ }
    },

    /** Signed-in status for the Profile screen. */
    async loadStatus() {
      try {
        const res = await authed('/google/status')
        if (res.status === 501) { connection.set({ state: 'unconfigured' }); return }
        if (!res.ok) return
        const data = /** @type {{ connected?: boolean, email?: string }} */ (await res.json())
        if (data.connected) connection.set(data.email ? { state: 'connected', email: data.email } : { state: 'connected' })
        else if (connection.get().state !== 'reconnect-needed') connection.set({ state: 'disconnected' })
      } catch { /* leave current state */ }
    },

    /**
     * AccessTokenProvider seam for the Drive client.
     * @param {{ force?: boolean }} [opts] @returns {Promise<string>}
     */
    async getAccessToken(opts) {
      if (!opts?.force && cached && cached.expiresAt - 30_000 > Date.now()) return cached.accessToken
      const res = await authed('/google/drive-token')
      if (res.status === 410) {
        cached = null
        connection.set({ state: 'reconnect-needed' })
        throw new Error('google-reconnect-needed')
      }
      if (!res.ok) throw new Error(`drive token failed (${res.status})`)
      cached = /** @type {{ accessToken: string, expiresAt: number }} */ (await res.json())
      return cached.accessToken
    },

    /** Server-minted link-mode auth URL (a plain anchor cannot carry the JWT). @returns {Promise<string>} */
    async connectUrl() {
      const res = await authed('/google/connect-url')
      if (!res.ok) throw new Error(`connect-url failed (${res.status})`)
      return /** @type {{ url: string }} */ (await res.json()).url
    },

    async disconnect() {
      const res = await authed('/google/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error(`disconnect failed (${res.status})`)
      cached = null
      connection.set({ state: 'disconnected' })
    },
  }
}
