import { signal } from '@oyl/all-of-oyl/client'
import { AUTH_KEY } from '@oyl/all-of-oyl/client'

/** @typedef {{ id: number, username: string, email: string }} AuthUser */
/** @typedef {{ token: string, user: AuthUser } | null} AuthSession */
/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }} AppStorage */

/** @param {AppStorage} storage @returns {AuthSession} */
function readSession(storage) {
  try { const raw = storage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : null } catch { return null }
}

/** Auth state: a session signal + login/register/logout/getToken/refresh. @param {AppStorage} storage @param {{ baseUrl: string, fetch: typeof globalThis.fetch }} opts */
export function createAuthState(storage, { baseUrl, fetch }) {
  const session = signal(/** @type {AuthSession} */ (readSession(storage)))
  /** @param {AuthSession} s */
  const persist = (s) => {
    if (s) storage.setItem(AUTH_KEY, JSON.stringify(s))
    else storage.removeItem(AUTH_KEY)
    session.set(s)
  }
  /** @param {string} path @param {Record<string, string>} body @returns {Promise<AuthUser>} */
  async function authRequest(path, body) {
    const res = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = /** @type {any} */ (await res.json().catch(() => ({})))
    if (!res.ok) throw new Error(data?.error?.message || `auth failed (${res.status})`)
    persist({ token: data.jwt, user: data.user })
    return data.user
  }
  return {
    session,
    /** @param {string} identifier @param {string} password */
    login: (identifier, password) => authRequest('/auth/local', { identifier, password }),
    /** @param {string} username @param {string} email @param {string} password */
    register: (username, email, password) => authRequest('/auth/local/register', { username, email, password }),
    logout: () => persist(null),
    /** @returns {Promise<string | null>} */
    getToken: async () => session.get()?.token ?? null,
    /** Multi-tab: re-read the session from storage. */
    refresh: () => session.set(readSession(storage)),
    /**
     * Adopt an OAuth-callback session from the URL fragment (#google=<jwt>) or surface
     * a callback error (#google_error=<code>). Always cleans the hash first — the
     * fragment must not survive into history or a shared link.
     * @param {{ location: { hash: string, pathname: string, search: string }, history: { replaceState(a: any, b: string, url: string): void } }} win
     * @returns {Promise<{ adopted: boolean, error: string | null }>}
     */
    async adoptTokenFromHash(win) {
      const hash = win.location.hash
      const token = hash.startsWith('#google=') ? decodeURIComponent(hash.slice('#google='.length)) : null
      const errorCode = hash.startsWith('#google_error=') ? decodeURIComponent(hash.slice('#google_error='.length)) : null
      if (token == null && errorCode == null) return { adopted: false, error: null }
      win.history.replaceState(null, '', win.location.pathname + win.location.search)
      if (errorCode != null) return { adopted: false, error: errorCode }
      const res = await fetch(`${baseUrl}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return { adopted: false, error: 'session' }
      const user = /** @type {{ id: number, username: string, email: string }} */ (await res.json())
      persist({ token: /** @type {string} */ (token), user: { id: user.id, username: user.username, email: user.email } })
      return { adopted: true, error: null }
    },
  }
}

/** Human messages for /google/callback error codes (hash `#google_error=<code>`). @param {string} code @returns {string} */
export function googleErrorMessage(code) {
  const messages = /** @type {Record<string, string>} */ ({
    denied: 'Google sign-in was cancelled.',
    bad_state: 'The Google sign-in link expired. Please try again.',
    account_exists: 'An account with this email already exists. Sign in with your password, then connect Google from your Profile.',
    no_refresh_token: 'Google did not grant offline access. Please try connecting again.',
    exchange_failed: 'Google sign-in failed. Please try again.',
    already_linked: 'This Google account is already connected to a different OYL account.',
    unknown: 'Google sign-in failed. Please try again.',
  })
  return messages[code] ?? 'Google sign-in failed. Please try again.'
}
